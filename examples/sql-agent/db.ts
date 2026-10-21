import { mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { DatabaseSync } from "node:sqlite";

const DATA_DIR = fileURLToPath(new URL(".data", import.meta.url));
const DB_FILE = path.join(DATA_DIR, "sales.sqlite");

export function ensureDatabase(): DatabaseSync {
  mkdirSync(DATA_DIR, { recursive: true });
  const db = new DatabaseSync(DB_FILE);
  initialize(db);
  return db;
}

export function initialize(db: DatabaseSync): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      region TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      price REAL NOT NULL
    );
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY,
      customer_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      amount REAL NOT NULL,
      created_at TEXT NOT NULL
    );
  `);

  const row = db.prepare("SELECT COUNT(*) AS count FROM customers").get();
  if (Number(row?.count ?? 0) === 0) seed(db);
  db.exec("PRAGMA query_only = ON");
}

function seed(db: DatabaseSync): void {
  const now = new Date();
  const previousStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  const currentStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const dayOfMonth = now.getUTCDate();

  const regions = ["华东", "华南", "华北", "西南", "华中"];
  const insertCustomer = db.prepare("INSERT INTO customers(id, name, region) VALUES (?, ?, ?)");
  const insertProduct = db.prepare("INSERT INTO products(id, name, price) VALUES (?, ?, ?)");
  const insertOrder = db.prepare(
    "INSERT INTO orders(id, customer_id, product_id, amount, created_at) VALUES (?, ?, ?, ?, ?)",
  );

  db.exec("BEGIN");
  try {
    for (let id = 1; id <= 15; id += 1) {
      insertCustomer.run(id, `客户${String(id).padStart(2, "0")}`, regions[(id - 1) % regions.length]!);
    }
    for (let id = 1; id <= 8; id += 1) {
      insertProduct.run(id, `产品${String.fromCharCode(64 + id)}`, 99 + id * 25);
    }
    for (let id = 1; id <= 80; id += 1) {
      const previousMonth = id <= 45;
      const start = previousMonth ? previousStart : currentStart;
      const maxDay = previousMonth ? 27 : Math.max(1, dayOfMonth);
      const day = ((id * 7) % maxDay) + 1;
      const date = new Date(start);
      date.setUTCDate(day);
      const amount = ((id * 137) % 900) + 100 + ((id * 13) % 100) / 100;
      insertOrder.run(
        id,
        ((id * 7) % 15) + 1,
        ((id * 5) % 8) + 1,
        Math.round(amount * 100) / 100,
        `${date.toISOString().slice(0, 10)}T12:00:00Z`,
      );
    }
    db.exec("COMMIT");
  } catch (error) {
    db.exec("ROLLBACK");
    throw error;
  }
}

export function listTableNames(db: DatabaseSync): string[] {
  return db
    .prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => String(row.name));
}

const ALLOWED_TABLES = new Set(["customers", "orders", "products"]);

export function describeTable(db: DatabaseSync, table: string): Array<Record<string, unknown>> {
  if (!ALLOWED_TABLES.has(table)) {
    throw new Error(`Unknown table "${table}". Available tables: ${[...ALLOWED_TABLES].join(", ")}`);
  }
  return db
    .prepare(`PRAGMA table_info(${table})`)
    .all()
    .map((row) => ({
      name: String(row.name),
      type: String(row.type),
      notnull: Boolean(row.notnull),
      primaryKey: Boolean(row.pk),
    }));
}

export function runReadOnlySql(db: DatabaseSync, sql: string): Array<Record<string, unknown>> {
  const normalized = sql.trim().replace(/;\s*$/, "");
  if (normalized.length === 0) throw new Error("SQL is empty.");
  if (normalized.includes(";")) throw new Error("Only one SQL statement is allowed.");
  if (!/^(select|with)\b/i.test(normalized)) {
    throw new Error("Only SELECT / WITH queries are allowed.");
  }

  return db
    .prepare(normalized)
    .all()
    .map((row) => ({ ...row }));
}

export function closeDatabase(db: DatabaseSync): void {
  db.close();
}
