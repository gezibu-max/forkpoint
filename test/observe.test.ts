import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiff, type DiffRunInfo } from "../src/core/diff.js";
import type { EventRecord } from "../src/core/events.js";
import { executeFork } from "../src/cli/fork.js";
import { executeReplay, readBaseline } from "../src/cli/replay.js";
import { recordObserveEvent, resolveObserveStore } from "../src/observe/record.js";
import { openCassette } from "../src/store/cassette.js";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const stores: string[] = [];

function makeStore(): string {
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-observe-"));
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
});

function payload(store: string, sessionId: string, extra: Record<string, unknown> = {}) {
  return {
    session_id: sessionId,
    cwd: store,
    transcript_path: path.join(store, "transcript.jsonl"),
    session_title: "Observed session",
    ...extra,
  };
}

function recordSession(store: string, sessionId: string, toolInput: unknown = { file: "a.ts" }): string {
  recordObserveEvent({
    store,
    input: payload(store, sessionId, { hook_event_name: "SessionStart", source: "startup" }),
  });
  recordObserveEvent({
    store,
    input: payload(store, sessionId, {
      hook_event_name: "PreToolUse",
      tool_name: "Read",
      tool_input: toolInput,
      tool_use_id: `toolu_${sessionId}`,
    }),
  });
  recordObserveEvent({
    store,
    input: payload(store, sessionId, {
      hook_event_name: "PostToolUse",
      tool_name: "Read",
      tool_input: toolInput,
      tool_output: { content: "file contents" },
      tool_use_id: `toolu_${sessionId}`,
    }),
  });
  const result = recordObserveEvent({
    store,
    input: payload(store, sessionId, { hook_event_name: "SessionEnd", reason: "clear" }),
  });
  return result.runId;
}

function runCliObserve(store: string, input: unknown) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli/index.ts", "observe", "hook", "--store", store, "--json"],
    {
      cwd: repoRoot,
      env: { ...process.env, FORKPOINT_MODE: "" },
      input: JSON.stringify(input),
      encoding: "utf8",
      timeout: 60_000,
    },
  );
}

describe("observe mode", () => {
  it("records a Claude Code session as an observed tool-only run", () => {
    const store = makeStore();
    const runId = recordSession(store, "session-1");

    expect(runId).toBe("obs_session-1");
    const cassette = openCassette(store);
    try {
      const run = cassette.getRun(runId);
      expect(run?.mode).toBe("observed");
      expect(run?.status).toBe("observed");
      expect(run?.command).toBe("claude-code");
      expect(run?.cwd).toBe(store);

      const config = JSON.parse(run?.configJson ?? "{}") as Record<string, unknown>;
      expect(config.source).toBe("claude-code");
      expect(config.sessionId).toBe("session-1");
      expect(config.transcriptPath).toBe(path.join(store, "transcript.jsonl"));

      const events = cassette.getEvents(runId);
      expect(events.map((event) => event.type)).toEqual([
        "observe.start",
        "tool.call",
        "tool.result",
        "run.end",
      ]);
      expect(events.every((event) => !event.type.startsWith("llm."))).toBe(true);

      const call = events.find((event) => event.type === "tool.call")!;
      expect(call.callsite).toBe("claude-code:Read");
      expect(call.requestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(call.spanId).toBe("toolu_session-1");
      expect(call.payload).toMatchObject({
        name: "Read",
        args: { file: "a.ts" },
        isWrite: false,
        toolUseId: "toolu_session-1",
      });

      const result = events.find((event) => event.type === "tool.result")!;
      expect(result.responseHash).toMatch(/^[0-9a-f]{64}$/);
      expect(result.payload).toMatchObject({ name: "Read", result: { content: "file contents" } });

      const metrics = JSON.parse(run?.metricsJson ?? "{}") as Record<string, unknown>;
      expect(metrics.events).toBe(4);
      expect(metrics.toolCalls).toBe(1);
    } finally {
      cassette.close();
    }
  });

  it("ignores duplicate start/end hooks and reopens a resumed session", () => {
    const store = makeStore();
    recordObserveEvent({
      store,
      input: payload(store, "session-2", { hook_event_name: "SessionStart" }),
    });
    expect(countEvents(store, "obs_session-2")).toBe(1);

    recordObserveEvent({
      store,
      input: payload(store, "session-2", { hook_event_name: "SessionStart" }),
    });
    expect(countEvents(store, "obs_session-2")).toBe(1);

    recordObserveEvent({
      store,
      input: payload(store, "session-2", {
        hook_event_name: "PreToolUse",
        tool_name: "Read",
        tool_input: { file: "a.ts" },
      }),
    });
    recordObserveEvent({
      store,
      input: payload(store, "session-2", { hook_event_name: "SessionEnd" }),
    });
    expect(runStatus(store, "obs_session-2")).toBe("observed");
    const ended = countEvents(store, "obs_session-2");

    recordObserveEvent({
      store,
      input: payload(store, "session-2", { hook_event_name: "SessionEnd" }),
    });
    expect(countEvents(store, "obs_session-2")).toBe(ended);

    recordObserveEvent({
      store,
      input: payload(store, "session-2", { hook_event_name: "SessionStart", source: "resume" }),
    });
    expect(runStatus(store, "obs_session-2")).toBe("observing");
    expect(countEvents(store, "obs_session-2")).toBe(ended + 1);

    recordObserveEvent({
      store,
      input: payload(store, "session-2", { hook_event_name: "SessionEnd" }),
    });
    expect(runStatus(store, "obs_session-2")).toBe("observed");
    expect(countEvents(store, "obs_session-2")).toBe(ended + 2);
  });

  it("ignores hook events that are not part of the observe set", () => {
    const store = makeStore();
    const result = recordObserveEvent({
      store,
      input: payload(store, "session-3", { hook_event_name: "Stop" }),
    });
    expect(result.recorded).toBe(false);
    expect(result.runId).toBe("");
  });

  it("resolves the store relative to the hook session cwd", () => {
    const store = makeStore();
    const resolved = resolveObserveStore({ cwd: store }, ".forkpoint");
    expect(resolved).toBe(path.join(store, ".forkpoint"));

    const absolute = resolveObserveStore({ cwd: store }, path.join(store, "custom"));
    expect(absolute).toBe(path.join(store, "custom"));
  });

  it("rejects replay, verify, and fork for observed runs", async () => {
    const store = makeStore();
    const runId = recordSession(store, "session-4");

    expect(() => readBaseline(store, runId)).toThrow(/observed Claude Code trace/);

    await expect(
      executeReplay({
        runId,
        store,
        json: false,
        debug: false,
        failOnEnvChange: false,
        command: [],
      }),
    ).rejects.toThrow(/cannot be replayed/);

    await expect(
      executeFork({
        runId,
        store,
        json: false,
        debug: false,
        overrides: { model: "test-model" },
        command: [],
      }),
    ).rejects.toThrow(/cannot be replayed/);
  });

  it("diffs observed runs by callsite and marks them observe-only", () => {
    const store = makeStore();
    const baseId = recordSession(store, "session-5", { file: "a.ts" });
    const variantId = recordSession(store, "session-6", { file: "b.ts" });

    const cassette = openCassette(store);
    let report;
    let baseEvents: EventRecord[];
    let variantEvents: EventRecord[];
    try {
      const base = cassette.getRun(baseId)!;
      const variant = cassette.getRun(variantId)!;
      baseEvents = cassette.getEvents(baseId);
      variantEvents = cassette.getEvents(variantId);
      const info = (run: typeof base): DiffRunInfo => ({
        id: run.id,
        name: run.name,
        mode: run.mode,
        status: run.status,
      });
      report = buildDiff(info(base), info(variant), baseEvents, variantEvents);
    } finally {
      cassette.close();
    }

    expect(report.firstDivergence?.status).toBe("request_mismatch");
    expect(report.firstDivergence?.category).toBe("request_mismatch");
    expect(report.firstDivergence?.fields).toEqual([
      { path: "$.file", base: "a.ts", variant: "b.ts" },
    ]);
    expect(report.metrics.base.llmCalls).toBe(0);
    expect(report.metrics.base.toolCalls).toBe(1);
    expect(report.caveats[0]).toMatch(/Observed Claude Code runs/);
    expect(report.caveats[0]).toMatch(/cannot be replayed/);
  });

  it("ingests a hook payload through the observe CLI", () => {
    const store = makeStore();
    const start = runCliObserve(
      store,
      payload(store, "session-7", { hook_event_name: "SessionStart", source: "startup" }),
    );
    expect(start.status, start.stderr).toBe(0);
    expect(JSON.parse(start.stdout) as Record<string, unknown>).toMatchObject({
      ok: true,
      runId: "obs_session-7",
      event: "SessionStart",
      recorded: true,
    });

    const call = runCliObserve(
      store,
      payload(store, "session-7", {
        hook_event_name: "PreToolUse",
        tool_name: "Bash",
        tool_input: { command: "echo hi" },
        tool_use_id: "toolu_7",
      }),
    );
    expect(call.status, call.stderr).toBe(0);
    expect(JSON.parse(call.stdout) as Record<string, unknown>).toMatchObject({
      runId: "obs_session-7",
      event: "PreToolUse",
      recorded: true,
    });

    const cassette = openCassette(store);
    try {
      expect(cassette.countEvents("obs_session-7")).toBe(2);
      const event = cassette.getEventsByType("obs_session-7", "tool.call")[0]!;
      expect(event.payload).toMatchObject({ name: "Bash", isWrite: true });
    } finally {
      cassette.close();
    }
  });

  it("rejects malformed observe CLI input", () => {
    const store = makeStore();
    const empty = spawnSync(
      process.execPath,
      ["--import", "tsx", "src/cli/index.ts", "observe", "hook", "--store", store],
      {
        cwd: repoRoot,
        env: { ...process.env, FORKPOINT_MODE: "" },
        input: "",
        encoding: "utf8",
        timeout: 60_000,
      },
    );
    expect(empty.status).toBe(2);
    expect(empty.stderr).toContain("expected a JSON object");
  });
});

function countEvents(store: string, runId: string): number {
  const cassette = openCassette(store);
  try {
    return cassette.countEvents(runId);
  } finally {
    cassette.close();
  }
}

function runStatus(store: string, runId: string): string | undefined {
  const cassette = openCassette(store);
  try {
    return cassette.getRun(runId)?.status;
  } finally {
    cassette.close();
  }
}
