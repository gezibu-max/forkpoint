import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import type { DatabaseSync } from "node:sqlite";
import { realNow } from "../core/clock.js";
import type {
  EventInput,
  EventRecord,
  RunStatus,
  StoredRunMode,
} from "../core/events.js";
import { ForkpointError, RunExistsError } from "../core/errors.js";
import { parseJsonText, toJsonText } from "../core/serialize.js";
import { cassettePath, openDatabase } from "./db.js";

export interface NewRun {
  id: string;
  name: string;
  parentRunId?: string;
  mode: StoredRunMode;
  status: RunStatus;
  command?: string;
  cwd?: string;
  gitSha?: string;
  nodeVersion?: string;
  platform?: string;
  config?: unknown;
  env?: unknown;
  seed?: number;
  metrics?: unknown;
  createdAt?: string;
}

export interface RunRow {
  id: string;
  name: string;
  createdAt: string;
  parentRunId?: string;
  mode: StoredRunMode;
  status: RunStatus;
  command?: string;
  cwd?: string;
  gitSha?: string;
  nodeVersion?: string;
  platform?: string;
  configJson?: string;
  envJson?: string;
  seed?: number;
  metricsJson?: string;
}

export interface FixtureInput {
  kind: string;
  fixtureKey: string;
  occurrence: number;
  callsite?: string;
  requestJson?: string;
  response?: unknown;
  meta?: unknown;
}

export interface FixtureRow {
  kind: string;
  fixtureKey: string;
  occurrence: number;
  callsite?: string;
  requestJson?: string;
  response?: unknown;
  meta?: unknown;
}

const EVENT_FLUSH_THRESHOLD = 50;

export class Cassette {
  readonly file: string;
  private readonly db: DatabaseSync;
  private readonly pending: EventRecord[] = [];
  private readonly seqByRun = new Map<string, number>();
  private readonly insertEvent: ReturnType<DatabaseSync["prepare"]>;
  private readonly insertFixture: ReturnType<DatabaseSync["prepare"]>;
  private closed = false;

  constructor(readonly store: string) {
    this.file = cassettePath(store);
    this.db = openDatabase(store);
    this.insertEvent = this.db.prepare(`
      INSERT INTO events (
        run_id, seq, type, span_id, parent_span_id, ts, duration_ms,
        callsite, request_hash, response_hash, payload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    this.insertFixture = this.db.prepare(`
      INSERT INTO fixtures (
        run_id, kind, fixture_key, occurrence, callsite, request_json, response_blob, meta_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
  }

  createRun(run: NewRun): void {
    try {
      this.db
        .prepare(`
          INSERT INTO runs (
            id, name, created_at, parent_run_id, mode, status, command, cwd,
            git_sha, node_version, platform, config_json, env_json, seed, metrics_json
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `)
        .run(
          run.id,
          run.name,
          run.createdAt ?? new Date(realNow()).toISOString(),
          run.parentRunId ?? null,
          run.mode,
          run.status,
          run.command ?? null,
          run.cwd ?? null,
          run.gitSha ?? null,
          run.nodeVersion ?? null,
          run.platform ?? null,
          run.config === undefined ? null : toJsonText(run.config, "$.config"),
          run.env === undefined ? null : toJsonText(run.env, "$.env"),
          run.seed ?? null,
          run.metrics === undefined ? null : toJsonText(run.metrics, "$.metrics"),
        );
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw new RunExistsError(run.id);
      }
      throw error;
    }
  }

  getRun(runId: string): RunRow | undefined {
    const row = this.db.prepare("SELECT * FROM runs WHERE id = ?").get(runId);
    return row === undefined ? undefined : mapRun(row);
  }

  listRuns(limit = 20): RunRow[] {
    return this.db
      .prepare("SELECT * FROM runs ORDER BY created_at DESC, id DESC LIMIT ?")
      .all(limit)
      .map(mapRun);
  }

  updateRunStatus(runId: string, status: RunStatus, metrics?: unknown): void {
    this.db
      .prepare("UPDATE runs SET status = ?, metrics_json = COALESCE(?, metrics_json) WHERE id = ?")
      .run(status, metrics === undefined ? null : toJsonText(metrics, "$.metrics"), runId);
  }

  updateRunEnvironment(runId: string, env: unknown): void {
    this.db
      .prepare("UPDATE runs SET env_json = ? WHERE id = ?")
      .run(toJsonText(env, "$.env"), runId);
  }

  updateRunConfig(runId: string, config: unknown): void {
    this.db
      .prepare("UPDATE runs SET config_json = ? WHERE id = ?")
      .run(toJsonText(config, "$.config"), runId);
  }

  appendEvent(runId: string, event: EventInput): void {
    // Events are buffered before flush, so a live request object could be mutated by later agent steps.
    const record: EventRecord = {
      ...event,
      payload: parseJsonText(toJsonText(event.payload, "$.payload")),
      runId,
      seq: this.nextSeq(runId),
      ts: event.ts ?? realNow(),
    };
    this.pending.push(record);
    if (this.pending.length >= EVENT_FLUSH_THRESHOLD) this.flush();
  }

  flush(): void {
    if (this.pending.length === 0 || this.closed) return;

    this.db.exec("BEGIN");
    try {
      for (const event of this.pending) {
        this.insertEvent.run(
          event.runId,
          event.seq,
          event.type,
          event.spanId ?? null,
          event.parentSpanId ?? null,
          event.ts,
          event.durationMs ?? null,
          event.callsite ?? null,
          event.requestHash ?? null,
          event.responseHash ?? null,
          event.payload === undefined ? null : Buffer.from(toJsonText(event.payload, "$.payload"), "utf8"),
        );
      }
      this.db.exec("COMMIT");
      this.pending.length = 0;
    } catch (error) {
      try {
        this.db.exec("ROLLBACK");
      } catch {
        // The transaction may already be closed.
      }
      throw error;
    }
  }

  hasEventType(runId: string, type: string): boolean {
    const row = this.db
      .prepare("SELECT 1 AS found FROM events WHERE run_id = ? AND type = ? LIMIT 1")
      .get(runId, type);
    return row !== undefined;
  }

  countEvents(runId: string): number {
    const row = this.db.prepare("SELECT COUNT(*) AS count FROM events WHERE run_id = ?").get(runId);
    return Number(row?.count ?? 0);
  }

  getEvents(runId: string, limit?: number): EventRecord[] {
    const sql = `SELECT * FROM events WHERE run_id = ? ORDER BY seq ASC${limit === undefined ? "" : " LIMIT ?"}`;
    const statement = this.db.prepare(sql);
    const rows = limit === undefined ? statement.all(runId) : statement.all(runId, limit);
    return rows.map(mapEvent);
  }

  countFixtures(runId: string): number {
    const row = this.db
      .prepare("SELECT COUNT(*) AS count FROM fixtures WHERE run_id = ?")
      .get(runId);
    return Number(row?.count ?? 0);
  }

  getEventsByType(runId: string, type: string): EventRecord[] {
    return this.db
      .prepare("SELECT * FROM events WHERE run_id = ? AND type = ? ORDER BY seq ASC")
      .all(runId, type)
      .map(mapEvent);
  }

  putFixture(runId: string, fixture: FixtureInput): void {
    try {
      this.insertFixture.run(
        runId,
        fixture.kind,
        fixture.fixtureKey,
        fixture.occurrence,
        fixture.callsite ?? null,
        fixture.requestJson ?? null,
        fixture.response === undefined ? null : Buffer.from(toJsonText(fixture.response, "$.response"), "utf8"),
        fixture.meta === undefined ? null : toJsonText(fixture.meta, "$.meta"),
      );
    } catch (error) {
      if (error instanceof Error && /UNIQUE constraint failed/i.test(error.message)) {
        throw new ForkpointError(
          "FIXTURE_DUPLICATE",
          `Fixture ${fixture.kind}/${fixture.fixtureKey.slice(0, 12)}… occurrence ${fixture.occurrence} already exists.`,
          { hint: "Occurrence allocation is broken; this is a Forkpoint bug." },
        );
      }
      throw error;
    }
  }

  getFixture(runId: string, kind: string, fixtureKey: string, occurrence: number): FixtureRow | undefined {
    const row = this.db
      .prepare(
        "SELECT * FROM fixtures WHERE run_id = ? AND kind = ? AND fixture_key = ? AND occurrence = ?",
      )
      .get(runId, kind, fixtureKey, occurrence);
    return row === undefined ? undefined : mapFixture(row);
  }

  listFixtures(runId: string): FixtureRow[] {
    return this.db
      .prepare(
        "SELECT * FROM fixtures WHERE run_id = ? ORDER BY kind ASC, fixture_key ASC, occurrence ASC",
      )
      .all(runId)
      .map(mapFixture);
  }

  putBlob(content: string | Uint8Array, encoding = "utf8"): string {
    const buffer = typeof content === "string" ? Buffer.from(content, "utf8") : Buffer.from(content);
    const hash = createBlobHash(buffer);
    this.db
      .prepare("INSERT OR IGNORE INTO blobs(hash, content, encoding) VALUES (?, ?, ?)")
      .run(hash, buffer, encoding);
    return hash;
  }

  getBlob(hash: string): Buffer | undefined {
    const row = this.db.prepare("SELECT content FROM blobs WHERE hash = ?").get(hash);
    return row === undefined ? undefined : Buffer.from(row.content as Uint8Array);
  }

  close(): void {
    if (this.closed) return;
    try {
      this.flush();
    } finally {
      this.closed = true;
      this.db.close();
    }
  }

  private nextSeq(runId: string): number {
    let next = this.seqByRun.get(runId);
    if (next === undefined) {
      const row = this.db
        .prepare("SELECT COALESCE(MAX(seq), -1) AS max_seq FROM events WHERE run_id = ?")
        .get(runId);
      next = Number(row?.max_seq ?? -1) + 1;
    }
    this.seqByRun.set(runId, next + 1);
    return next;
  }
}

export function openCassette(store: string): Cassette {
  return new Cassette(store);
}

export function openExistingCassette(store: string): Cassette | undefined {
  return existsSync(cassettePath(store)) ? new Cassette(store) : undefined;
}

function mapRun(row: Record<string, unknown>): RunRow {
  return {
    id: String(row.id),
    name: String(row.name),
    createdAt: String(row.created_at),
    ...(row.parent_run_id === null ? {} : { parentRunId: String(row.parent_run_id) }),
    mode: String(row.mode) as StoredRunMode,
    status: String(row.status) as RunStatus,
    ...(row.command === null ? {} : { command: String(row.command) }),
    ...(row.cwd === null ? {} : { cwd: String(row.cwd) }),
    ...(row.git_sha === null ? {} : { gitSha: String(row.git_sha) }),
    ...(row.node_version === null ? {} : { nodeVersion: String(row.node_version) }),
    ...(row.platform === null ? {} : { platform: String(row.platform) }),
    ...(row.config_json === null ? {} : { configJson: String(row.config_json) }),
    ...(row.env_json === null ? {} : { envJson: String(row.env_json) }),
    ...(row.seed === null ? {} : { seed: Number(row.seed) }),
    ...(row.metrics_json === null ? {} : { metricsJson: String(row.metrics_json) }),
  };
}

function mapFixture(row: Record<string, unknown>): FixtureRow {
  return {
    kind: String(row.kind),
    fixtureKey: String(row.fixture_key),
    occurrence: Number(row.occurrence),
    ...(row.callsite === null ? {} : { callsite: String(row.callsite) }),
    ...(row.request_json === null ? {} : { requestJson: String(row.request_json) }),
    ...(row.response_blob === null
      ? {}
      : { response: parseJsonText(Buffer.from(row.response_blob as Uint8Array).toString("utf8")) }),
    ...(row.meta_json === null ? {} : { meta: parseJsonText(String(row.meta_json)) }),
  };
}

function mapEvent(row: Record<string, unknown>): EventRecord {
  return {
    runId: String(row.run_id),
    seq: Number(row.seq),
    type: String(row.type) as EventRecord["type"],
    ts: Number(row.ts),
    ...(row.span_id === null ? {} : { spanId: String(row.span_id) }),
    ...(row.parent_span_id === null ? {} : { parentSpanId: String(row.parent_span_id) }),
    ...(row.duration_ms === null ? {} : { durationMs: Number(row.duration_ms) }),
    ...(row.callsite === null ? {} : { callsite: String(row.callsite) }),
    ...(row.request_hash === null ? {} : { requestHash: String(row.request_hash) }),
    ...(row.response_hash === null ? {} : { responseHash: String(row.response_hash) }),
    payload:
      row.payload === null
        ? null
        : parseJsonText(Buffer.from(row.payload as Uint8Array).toString("utf8")),
  };
}

function createBlobHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}
