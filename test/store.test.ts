import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import { CassetteCorruptError, MigrationError } from "../src/core/errors.js";
import { Cassette, openCassette } from "../src/store/cassette.js";
import { cassettePath } from "../src/store/db.js";

const stores: string[] = [];

function makeStore(): string {
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-store-"));
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
});

describe("Cassette", () => {
  it("round-trips runs, events, and fixtures and assigns seq", () => {
    const store = makeStore();
    const cassette = new Cassette(store);
    cassette.createRun({
      id: "r_test",
      name: "run",
      mode: "recorded",
      status: "recording",
      command: "node agent.js",
      cwd: "/tmp/project",
      config: { a: 1 },
    });
    cassette.appendEvent("r_test", { type: "run.start", payload: { name: "run", mode: "record" } });
    cassette.appendEvent("r_test", {
      type: "tool.call",
      payload: { name: "run_sql", args: { sql: "select 1" }, isWrite: false },
      callsite: "agent.ts:1:1",
      requestHash: "abc",
    });
    cassette.putFixture("r_test", {
      kind: "tool",
      fixtureKey: "abc",
      occurrence: 0,
      callsite: "agent.ts:1:1",
      requestJson: '{"sql":"select 1"}',
      response: { result: [{ value: 1 }] },
      meta: { write: false },
    });
    cassette.appendEvent("r_test", { type: "run.end", payload: { status: "ok" } });
    cassette.updateRunStatus("r_test", "recorded", { durationMs: 12 });
    cassette.close();

    const reopened = new Cassette(store);
    try {
      const run = reopened.getRun("r_test");
      expect(run?.status).toBe("recorded");
      expect(run?.metricsJson).toBe('{"durationMs":12}');
      expect(reopened.getEvents("r_test").map((event) => event.seq)).toEqual([0, 1, 2]);
      expect(reopened.getEvents("r_test")[1]?.payload).toMatchObject({ name: "run_sql" });

      const fixture = reopened.getFixture("r_test", "tool", "abc", 0);
      expect(fixture?.response).toEqual({ result: [{ value: 1 }] });
      expect(fixture?.meta).toEqual({ write: false });
      expect(reopened.getFixture("r_test", "tool", "abc", 1)).toBeUndefined();
    } finally {
      reopened.close();
    }

    const raw = new DatabaseSync(cassettePath(store));
    try {
      const version = raw.prepare("SELECT value FROM meta WHERE key = 'schema_version'").get();
      expect(version?.value).toBe("1");
    } finally {
      raw.close();
    }
  });

  it("snapshots event payloads before buffering", () => {
    const store = makeStore();
    const cassette = new Cassette(store);
    cassette.createRun({ id: "r_snapshot", name: "snapshot", mode: "recorded", status: "recording" });
    const messages: Array<{ role: string; content: string }> = [{ role: "user", content: "hi" }];
    cassette.appendEvent("r_snapshot", {
      type: "llm.request",
      payload: {
        provider: "openai-compatible",
        model: "m",
        stream: false,
        request: { model: "m", messages },
      },
    });
    messages.push({ role: "assistant", content: "later" });
    messages[0]!.content = "mutated";
    cassette.close();

    const reopened = new Cassette(store);
    try {
      const payload = reopened.getEvents("r_snapshot")[0]?.payload as {
        request: { messages: Array<{ role: string; content: string }> };
      };
      expect(payload.request.messages).toEqual([{ role: "user", content: "hi" }]);
    } finally {
      reopened.close();
    }
  });

  it("continues seq after reopening", () => {
    const store = makeStore();
    const first = new Cassette(store);
    first.createRun({ id: "r_seq", name: "seq", mode: "recorded", status: "recording" });
    first.appendEvent("r_seq", { type: "run.start", payload: { name: "seq", mode: "record" } });
    first.close();

    const second = new Cassette(store);
    try {
      second.appendEvent("r_seq", { type: "run.end", payload: { status: "ok" } });
      second.flush();
      expect(second.getEvents("r_seq").map((event) => event.seq)).toEqual([0, 1]);
    } finally {
      second.close();
    }
  });

  it("rejects a newer schema without modifying it", () => {
    const store = makeStore();
    const file = cassettePath(store);
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', '99')").run();
    db.close();

    expect(() => openCassette(store)).toThrowError(MigrationError);
  });

  it("backs up before a failed migration", () => {
    const store = makeStore();
    const file = cassettePath(store);
    const db = new DatabaseSync(file);
    db.exec("CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    db.prepare("INSERT INTO meta(key, value) VALUES ('schema_version', '0')").run();
    db.close();

    expect(() => openCassette(store)).toThrowError(MigrationError);
    expect(existsSync(`${file}.bak`)).toBe(true);
  });

  it("reports a corrupt cassette", () => {
    const store = makeStore();
    writeFileSync(cassettePath(store), "this is not sqlite");
    expect(() => openCassette(store)).toThrowError(CassetteCorruptError);
  });
});
