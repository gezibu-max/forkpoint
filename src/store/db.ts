import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { CassetteCorruptError, MigrationError } from "../core/errors.js";
import { MIGRATIONS, REQUIRED_TABLES, SCHEMA_V1, SCHEMA_VERSION } from "./schema.js";

export const CASSETTE_FILE = "cassette.sqlite";

export function cassettePath(store: string): string {
  return path.join(path.resolve(store), CASSETTE_FILE);
}

export function cassetteExists(store: string): boolean {
  return existsSync(cassettePath(store));
}

export function openDatabase(store: string): DatabaseSync {
  const file = cassettePath(store);
  mkdirSync(path.dirname(file), { recursive: true });

  let db: DatabaseSync;
  try {
    db = new DatabaseSync(file);
  } catch (error) {
    throw wrapCorruption(file, error);
  }

  try {
    db.exec("PRAGMA journal_mode = DELETE");
    db.exec("PRAGMA synchronous = NORMAL");
    db.exec("PRAGMA busy_timeout = 5000");
    db.exec("PRAGMA foreign_keys = ON");
    ensureSchema(db, file);
    return db;
  } catch (error) {
    safeClose(db);
    throw wrapCorruption(file, error);
  }
}

function ensureSchema(db: DatabaseSync, file: string): void {
  let tables = listTables(db, file);

  if (tables.length === 0) {
    createCurrentSchema(db, file);
    return;
  }

  if (!tables.includes("meta")) {
    throw new CassetteCorruptError(file, "the meta table is missing");
  }

  let version: number;
  try {
    const row = db.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
    if (row === undefined) {
      throw new CassetteCorruptError(file, "meta.schema_version is missing");
    }
    version = Number(row.value);
    if (!Number.isInteger(version) || version < 0) {
      throw new CassetteCorruptError(file, `invalid schema_version ${String(row.value)}`);
    }
  } catch (error) {
    if (error instanceof CassetteCorruptError) throw error;
    throw wrapCorruption(file, error);
  }

  if (version > SCHEMA_VERSION) {
    throw new MigrationError(
      file,
      `cassette version ${version} is newer than this build (${SCHEMA_VERSION}); upgrade Forkpoint`,
    );
  }

  if (version < SCHEMA_VERSION) {
    migrate(db, file, version);
    tables = listTables(db, file);
  }

  const missing = REQUIRED_TABLES.filter((table) => !tables.includes(table));
  if (missing.length > 0) {
    throw new CassetteCorruptError(file, `missing tables: ${missing.join(", ")}`);
  }
}

function listTables(db: DatabaseSync, file: string): string[] {
  try {
    return db
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
      .all()
      .map((row) => String(row.name));
  } catch (error) {
    throw wrapCorruption(file, error);
  }
}

function createCurrentSchema(db: DatabaseSync, file: string): void {
  try {
    db.exec("BEGIN");
    db.exec(SCHEMA_V1);
    db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', ?)").run(String(SCHEMA_VERSION));
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    throw wrapCorruption(file, error);
  }
}

function migrate(db: DatabaseSync, file: string, from: number): void {
  const backup = `${file}.bak`;
  try {
    if (existsSync(file)) copyFileSync(file, backup);
  } catch (error) {
    throw new MigrationError(file, `cannot write backup ${backup}`, { cause: error });
  }

  try {
    db.exec("BEGIN");
    for (let version = from + 1; version <= SCHEMA_VERSION; version += 1) {
      const migration = MIGRATIONS[version];
      if (migration === undefined) {
        throw new Error(`no migration path from version ${version - 1} to ${version}`);
      }
      db.exec(migration);
    }
    db.prepare("UPDATE meta SET value = ? WHERE key = 'schema_version'").run(String(SCHEMA_VERSION));
    db.exec(`PRAGMA user_version = ${SCHEMA_VERSION}`);
    db.exec("COMMIT");
  } catch (error) {
    try {
      db.exec("ROLLBACK");
    } catch {
      // The transaction may already be closed.
    }
    throw new MigrationError(file, error instanceof Error ? error.message : String(error), {
      cause: error,
    });
  }
}

function safeClose(db: DatabaseSync): void {
  try {
    db.close();
  } catch {
    // Closing a failed handle is best-effort.
  }
}

function wrapCorruption(file: string, error: unknown): Error {
  if (error instanceof CassetteCorruptError || error instanceof MigrationError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/not a database|malformed|corrupt|invalid page|disk image/i.test(message)) {
    return new CassetteCorruptError(file, message, { cause: error });
  }
  return error instanceof Error ? error : new Error(message, { cause: error });
}
