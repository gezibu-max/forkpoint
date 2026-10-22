import { describe, expect, it } from "vitest";
import {
  alignSteps,
  buildDiff,
  collectSteps,
  type DiffRunInfo,
} from "../src/core/diff.js";
import type { EventRecord } from "../src/core/events.js";
import { renderJson, renderMarkdown } from "../src/cli/diff.js";

const baseRun: DiffRunInfo = {
  id: "r_base",
  name: "demo",
  mode: "recorded",
  status: "recorded",
};

const variantRun: DiffRunInfo = {
  id: "r_variant",
  name: "demo",
  mode: "recorded",
  status: "recorded",
};

function runEvents(
  runId: string,
  options: {
    systemPrompt?: string;
    sql?: string;
    result?: unknown;
    error?: boolean;
    extraTool?: boolean;
  } = {},
): EventRecord[] {
  const request = {
    provider: "openai",
    model: "test-model",
    stream: false,
    request: {
      model: "test-model",
      messages: [
        { role: "system", content: options.systemPrompt ?? "system" },
        { role: "user", content: "question" },
      ],
      temperature: 0,
    },
  };
  const response = {
    response: {
      id: "chatcmpl-1",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: "answer" },
          finish_reason: "stop",
        },
      ],
    },
    usage: { total_tokens: 42 },
    finishReason: "stop",
    stream: false,
  };
  const sql = options.sql ?? "SELECT 1";

  const events: EventRecord[] = [
    { runId, seq: 0, ts: 1, type: "run.start", payload: { name: "demo", mode: "record" } },
    { runId, seq: 1, ts: 1, type: "env.snapshot", payload: { env: {} } },
    { runId, seq: 2, ts: 1, type: "clock.now", payload: { source: "date.now", value: 1 } },
    {
      runId,
      seq: 3,
      ts: 1,
      type: "llm.request",
      callsite: "agent.ts:10:1",
      requestHash: `llm-${options.systemPrompt ?? "system"}`,
      payload: request,
    },
    {
      runId,
      seq: 4,
      ts: 1,
      type: "llm.response",
      callsite: "agent.ts:10:1",
      responseHash: "response",
      durationMs: 5,
      payload: response,
    },
    {
      runId,
      seq: 5,
      ts: 1,
      type: "tool.call",
      callsite: "agent.ts:20:1",
      requestHash: `tool-${sql}`,
      payload: { name: "run_sql", args: { sql }, isWrite: false },
    },
  ];

  if (options.error === true) {
    events.push({
      runId,
      seq: 6,
      ts: 1,
      type: "tool.error",
      callsite: "agent.ts:20:1",
      payload: { name: "run_sql", errorName: "Error", message: "boom" },
    });
  } else {
    events.push({
      runId,
      seq: 6,
      ts: 1,
      type: "tool.result",
      callsite: "agent.ts:20:1",
      responseHash: `result-${String(options.result ?? "rows")}`,
      payload: { name: "run_sql", result: options.result ?? { rows: 1 } },
    });
  }

  if (options.extraTool === true) {
    events.push(
      {
        runId,
        seq: 7,
        ts: 1,
        type: "tool.call",
        callsite: "agent.ts:30:1",
        requestHash: "tool-extra",
        payload: { name: "extra", args: {}, isWrite: false },
      },
      {
        runId,
        seq: 8,
        ts: 1,
        type: "tool.result",
        callsite: "agent.ts:30:1",
        responseHash: "result-extra",
        payload: { name: "extra", result: { ok: true } },
      },
    );
  }

  events.push({
    runId,
    seq: 9,
    ts: 1,
    type: "run.end",
    payload: { status: "ok" },
    durationMs: 25,
  });
  return events;
}

describe("step collection and alignment", () => {
  it("pairs requests with responses and errors", () => {
    const steps = collectSteps(runEvents("r_base", { error: true }));

    expect(steps).toHaveLength(2);
    expect(steps[0]).toMatchObject({ kind: "llm", name: "test-model", ordinal: 0 });
    expect(steps[0]?.responseHash).toBe("response");
    expect(steps[0]?.usage).toEqual({ total_tokens: 42 });
    expect(steps[1]).toMatchObject({ kind: "tool", name: "run_sql", ordinal: 0 });
    expect(steps[1]?.error).toEqual({ name: "Error", message: "boom" });
  });

  it("aligns a changed prompt to the same callsite", () => {
    const base = collectSteps(runEvents("r_base", { systemPrompt: "old" }));
    const variant = collectSteps(runEvents("r_variant", { systemPrompt: "new" }));
    const alignments = alignSteps(base, variant);

    expect(alignments).toHaveLength(2);
    expect(alignments[0]?.status).toBe("request_mismatch");
    expect(alignments[0]?.fields?.map((field) => field.path)).toContain("$.messages[0].content");
    expect(alignments[1]?.status).toBe("same");
  });

  it("uses per-callsite ordinals for repeated calls", () => {
    const base = collectSteps(runEvents("r_base"));
    const repeated = collectSteps([
      ...runEvents("r_base"),
      {
        runId: "r_base",
        seq: 10,
        ts: 1,
        type: "tool.call",
        callsite: "agent.ts:20:1",
        requestHash: "second",
        payload: { name: "run_sql", args: { sql: "SELECT 2" }, isWrite: false },
      },
    ]);

    expect(base[1]?.ordinal).toBe(0);
    expect(repeated[2]?.ordinal).toBe(1);
    expect(alignSteps(base, repeated).map((entry) => entry.status)).toEqual([
      "same",
      "same",
      "added_step",
    ]);
  });
});

describe("diff report", () => {
  it("classifies fixture misses and nondeterminism leaks", () => {
    const baseEvents = runEvents("r_base");
    for (const [errorName, category] of [
      ["FixtureMissError", "fixture_miss"],
      ["NondeterminismError", "nondeterminism_leak"],
    ] as const) {
      const variantEvents = baseEvents.map((event) =>
        event.type === "llm.response"
          ? ({
              runId: "r_variant",
              seq: event.seq,
              ts: event.ts,
              type: "llm.error",
              callsite: event.callsite,
              payload: { name: errorName, message: "failed" },
            } satisfies EventRecord)
          : event,
      );
      const report = buildDiff(baseRun, variantRun, baseEvents, variantEvents);

      expect(report.firstDivergence).toMatchObject({
        status: "error_changed",
        category,
      });
    }
  });

  it("reports the first differing tool call with field changes", () => {
    const report = buildDiff(
      baseRun,
      variantRun,
      runEvents("r_base", { sql: "SELECT 1" }),
      runEvents("r_variant", { sql: "SELECT 2" }),
    );

    expect(report.firstDivergence).toMatchObject({
      index: 2,
      status: "request_mismatch",
      category: "request_mismatch",
      severity: "info",
    });
    expect(report.firstDivergence?.fields).toEqual([
      { path: "$.sql", base: "SELECT 1", variant: "SELECT 2" },
    ]);
    expect(report.metrics.base).toMatchObject({
      llmCalls: 1,
      toolCalls: 1,
      totalTokens: 42,
      durationMs: 25,
      finalAnswer: "answer",
    });
  });

  it("marks strict replay divergences as errors", () => {
    const replayRun: DiffRunInfo = { ...variantRun, mode: "replayed" };
    const report = buildDiff(
      baseRun,
      replayRun,
      runEvents("r_base", { sql: "SELECT 1" }),
      runEvents("r_variant", { sql: "SELECT 2" }),
    );

    expect(report.firstDivergence?.severity).toBe("error");
  });

  it("classifies error changes for tools", () => {
    const report = buildDiff(
      baseRun,
      variantRun,
      runEvents("r_base"),
      runEvents("r_variant", { error: true }),
    );

    expect(report.firstDivergence).toMatchObject({
      index: 2,
      status: "error_changed",
      category: "tool_exception",
    });
  });

  it("reports an added step when the base is a prefix", () => {
    const report = buildDiff(
      baseRun,
      variantRun,
      runEvents("r_base"),
      runEvents("r_variant", { extraTool: true }),
    );

    expect(report.firstDivergence).toMatchObject({
      index: 3,
      status: "added_step",
      category: "unclassified",
    });
  });

  it("renders markdown and JSON without raw payloads", () => {
    const report = buildDiff(
      baseRun,
      variantRun,
      runEvents("r_base", { sql: "SELECT 1" }),
      runEvents("r_variant", { sql: "SELECT 2" }),
    );

    const markdown = renderMarkdown(report);
    expect(markdown).toContain("# Forkpoint diff");
    expect(markdown).toContain("## First divergence");
    expect(markdown).toContain("$.sql");
    expect(markdown).toContain("SELECT 1");

    const json = JSON.parse(renderJson(report)) as {
      firstDivergence: { status: string; fields: Array<{ path: string }> };
      steps: unknown[];
    };
    expect(json.firstDivergence.status).toBe("request_mismatch");
    expect(json.firstDivergence.fields[0]?.path).toBe("$.sql");
    expect(json.steps).toHaveLength(2);
  });
});
