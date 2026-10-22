import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildDiff } from "../src/core/diff.js";
import { FixtureMissError, UsageError } from "../src/core/errors.js";
import { Forkpoint, tool } from "../src/index.js";
import {
  applyForkOverrides,
  parseForkOverrides,
  validateForkOverrides,
} from "../src/sdk/overrides.js";
import { openCassette, type RunRow } from "../src/store/cassette.js";

interface FakeClient {
  calls: number;
  requests: Array<Record<string, unknown>>;
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

function staticClient(answer: string): FakeClient {
  const client: FakeClient = {
    calls: 0,
    requests: [],
    chat: {
      completions: {
        create: async (request) => {
          client.calls += 1;
          client.requests.push(request);
          return {
            id: `chatcmpl-${answer}`,
            object: "chat.completion",
            model: request.model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: answer },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
          };
        },
      },
    },
  };
  return client;
}

function throwingClient(): FakeClient {
  const client: FakeClient = {
    calls: 0,
    requests: [],
    chat: {
      completions: {
        create: async (request) => {
          client.calls += 1;
          client.requests.push(request);
          throw new Error("a live LLM call escaped the cassette");
        },
      },
    },
  };
  return client;
}

const request = {
  model: "base-model",
  messages: [
    { role: "system", content: "base system" },
    { role: "user", content: "hi" },
  ],
  temperature: 0,
  stream: false,
};

function answerOf(response: unknown): string {
  const choices = (response as { choices?: Array<{ message?: { content?: string } }> }).choices;
  return choices?.[0]?.message?.content ?? "";
}

async function callAndAdd(
  client: FakeClient,
  add: (left: number, right: number) => number,
): Promise<{ answer: string; sum: number }> {
  const response = await client.chat.completions.create(request);
  return { answer: answerOf(response), sum: add(2, 3) };
}

const stores: string[] = [];
const instances: Forkpoint[] = [];

function makeStore(): string {
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-fork-"));
  stores.push(store);
  return store;
}

function makeForkpoint(options: ConstructorParameters<typeof Forkpoint>[0]): Forkpoint {
  const fp = new Forkpoint(options);
  instances.push(fp);
  return fp;
}

function findRun(store: string, predicate: (run: RunRow) => boolean): RunRow {
  const cassette = openCassette(store);
  try {
    const run = cassette.listRuns(50).find(predicate);
    if (run === undefined) throw new Error("run not found");
    return run;
  } finally {
    cassette.close();
  }
}

afterEach(() => {
  for (const fp of instances.splice(0)) fp.dispose();
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
  delete process.env.FORKPOINT_MODE;
  delete process.env.FORKPOINT_OVERRIDES;
  delete process.env.FORKPOINT_BASELINE_RUN_ID;
  delete process.env.FORKPOINT_RUN_ID;
});

describe("fork", () => {
  it("calls the live model with overrides and serves tools from the baseline", async () => {
    const store = makeStore();
    let toolExecutions = 0;
    const add = tool("add", (left: number, right: number) => {
      toolExecutions += 1;
      return left + right;
    });

    const recorder = makeForkpoint({ store, mode: "record" });
    const baselineClient = staticClient("baseline answer");
    const wrappedBaseline = recorder.wrapOpenAI(baselineClient);
    const recorded = await recorder.run("fork-run", () => callAndAdd(wrappedBaseline, add));
    recorder.dispose();

    expect(recorded).toEqual({ answer: "baseline answer", sum: 5 });
    expect(toolExecutions).toBe(1);

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const live = staticClient("forked answer");
    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: {
        model: "fork-model",
        temperature: 1.2,
        systemPrompt: "fork system",
      },
    });
    const wrappedLive = forker.wrapOpenAI(live);
    const originalFetch = globalThis.fetch;
    let fetchDuringFork: typeof fetch | undefined;

    const forked = await forker.run("fork-run", () => {
      fetchDuringFork = globalThis.fetch;
      return callAndAdd(wrappedLive, add);
    });

    expect(forked).toEqual({ answer: "forked answer", sum: 5 });
    expect(live.calls).toBe(1);
    expect(toolExecutions).toBe(1);
    expect(fetchDuringFork).toBe(originalFetch);
    expect(live.requests[0]).toMatchObject({
      model: "fork-model",
      temperature: 1.2,
      messages: [
        { role: "system", content: "fork system" },
        { role: "user", content: "hi" },
      ],
    });
    expect(request.messages[0]!.content).toBe("base system");

    const variant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === baseline.id,
    );
    expect(variant.status).toBe("forked");
    expect(variant.name).toBe(baseline.name);

    const cassette = openCassette(store);
    try {
      expect(cassette.countFixtures(variant.id)).toBe(2);
      const warnings = cassette
        .getEventsByType(variant.id, "replay.warning")
        .map((event) => (event.payload as { code: string }).code);
      expect(warnings).toContain("FORK_TOOLS_FROZEN");
      expect(cassette.getEventsByType(variant.id, "tool.result")).toHaveLength(1);

      const config = JSON.parse(variant.configJson ?? "{}") as {
        overrides?: { model?: string; temperature?: number; systemPrompt?: string };
      };
      expect(config.overrides).toEqual({
        model: "fork-model",
        temperature: 1.2,
        systemPrompt: "fork system",
      });

      const report = buildDiff(
        { id: baseline.id, name: baseline.name, mode: baseline.mode, status: baseline.status },
        { id: variant.id, name: variant.name, mode: variant.mode, status: variant.status },
        cassette.getEvents(baseline.id),
        cassette.getEvents(variant.id),
      );
      expect(report.firstDivergence?.status).toBe("request_mismatch");
      expect(report.firstDivergence?.severity).toBe("expected");
    } finally {
      cassette.close();
    }
  });

  it("consumes the baseline clock and random sequence", async () => {
    const store = makeStore();
    const sample = () => ({
      now: Date.now(),
      iso: new Date().toISOString(),
      random: Math.random(),
    });
    const body = async (client: FakeClient) => {
      const before = sample();
      const response = await client.chat.completions.create(request);
      return { before, answer: answerOf(response) };
    };

    const recorder = makeForkpoint({ store, mode: "record" });
    const recorded = await recorder.run("fork-clock", () =>
      body(recorder.wrapOpenAI(staticClient("baseline answer"))),
    );
    recorder.dispose();

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model" },
    });
    const forked = await forker.run("fork-clock", () =>
      body(forker.wrapOpenAI(staticClient("forked answer"))),
    );

    expect(forked.before).toEqual(recorded.before);
    expect(forked.answer).toBe("forked answer");
  });

  it("extends the baseline random sequence when a fork needs more randomness", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const recorded = await recorder.run("fork-rng-extend", () => Math.random());
    recorder.dispose();

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model" },
    });
    const forked = await forker.run("fork-rng-extend", () => [
      Math.random(),
      Math.random(),
    ]);

    expect(forked[0]).toBe(recorded);
    expect(typeof forked[1]).toBe("number");

    const variant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === baseline.id,
    );
    expect(variant.status).toBe("forked");
    const cassette = openCassette(store);
    try {
      expect(cassette.getEventsByType(variant.id, "rng.value")).toHaveLength(2);
      const warnings = cassette
        .getEventsByType(variant.id, "replay.warning")
        .map((event) => (event.payload as { code: string }).code);
      expect(warnings).toContain("RNG_EXTENDED");
    } finally {
      cassette.close();
    }
  });

  it("records fresh clock values when a fork reads a different clock source", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fork-clock-source", () => Date.now());
    recorder.dispose();

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model" },
    });
    const forked = await forker.run("fork-clock-source", () => performance.now());

    expect(typeof forked).toBe("number");
    const variant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === baseline.id,
    );
    expect(variant.status).toBe("forked");
    const cassette = openCassette(store);
    try {
      const warnings = cassette
        .getEventsByType(variant.id, "replay.warning")
        .map((event) => (event.payload as { code: string }).code);
      expect(warnings).toContain("CLOCK_SOURCE_MISMATCH");
      const sources = cassette
        .getEventsByType(variant.id, "clock.now")
        .map((event) => (event.payload as { source: string }).source);
      expect(sources).toContain("performance");
    } finally {
      cassette.close();
    }
  });

  it("does not let agent code swallow a fixture miss", async () => {
    const store = makeStore();
    const add = tool("add", (left: number, right: number) => left + right);
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fork-swallow", () => add(2, 3));
    recorder.dispose();

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model" },
    });

    await expect(
      forker.run("fork-swallow", () => {
        try {
          add(4, 5);
        } catch (error) {
          expect(error).toBeInstanceOf(FixtureMissError);
        }
        return add(6, 7);
      }),
    ).rejects.toBeInstanceOf(FixtureMissError);
  });

  it("fails when the model asks for a tool call that was not recorded", async () => {
    const store = makeStore();
    let executions = 0;
    const add = tool("add", (left: number, right: number) => {
      executions += 1;
      return left + right;
    });

    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fork-miss", async () => {
      await recorder.wrapOpenAI(staticClient("first")).chat.completions.create(request);
      return add(2, 3);
    });
    recorder.dispose();

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model" },
    });
    const live = staticClient("second");

    await expect(
      forker.run("fork-miss", async () => {
        await forker.wrapOpenAI(live).chat.completions.create(request);
        return add(4, 5);
      }),
    ).rejects.toBeInstanceOf(FixtureMissError);

    expect(executions).toBe(1);
    expect(live.calls).toBe(1);
    const variant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === baseline.id,
    );
    expect(variant.status).toBe("failed");
    const cassette = openCassette(store);
    try {
      const errors = cassette.getEventsByType(variant.id, "tool.error");
      expect(errors).toHaveLength(1);
      expect((errors[0]!.payload as { errorName: string }).errorName).toBe("FixtureMissError");
    } finally {
      cassette.close();
    }
  });

  it("refuses to fork without an override", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fork-empty", () => 1);
    recorder.dispose();

    const baseline = findRun(store, (run) => run.mode === "recorded");
    const forker = makeForkpoint({ store, mode: "fork", baselineRunId: baseline.id });
    await expect(forker.run("fork-empty", () => 1)).rejects.toBeInstanceOf(UsageError);
  });

  it("inherits a forked baseline's overrides when forking again", async () => {
    const store = makeStore();
    const add = tool("add", (left: number, right: number) => left + right);

    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fork-chain", () =>
      callAndAdd(recorder.wrapOpenAI(staticClient("baseline answer")), add),
    );
    recorder.dispose();
    const baseline = findRun(store, (run) => run.mode === "recorded");

    const firstFork = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model", temperature: 0.2 },
    });
    await firstFork.run("fork-chain", () =>
      callAndAdd(firstFork.wrapOpenAI(staticClient("first fork")), add),
    );
    const firstVariant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === baseline.id,
    );

    const live = staticClient("second fork");
    const secondFork = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: firstVariant.id,
      overrides: { temperature: 0.9 },
    });
    await secondFork.run("fork-chain", () => callAndAdd(secondFork.wrapOpenAI(live), add));

    expect(live.requests[0]).toMatchObject({ model: "fork-model", temperature: 0.9 });

    const secondVariant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === firstVariant.id,
    );
    const config = JSON.parse(secondVariant.configJson ?? "{}") as {
      overrides?: { model?: string; temperature?: number };
    };
    expect(config.overrides).toEqual({ model: "fork-model", temperature: 0.9 });

    const cassette = openCassette(store);
    try {
      const warnings = cassette
        .getEventsByType(secondVariant.id, "replay.warning")
        .map((event) => (event.payload as { code: string }).code);
      expect(warnings).toContain("FORK_OVERRIDES_INHERITED");
    } finally {
      cassette.close();
    }
  });

  it("replays a forked run by reusing its stored overrides", async () => {
    const store = makeStore();
    let executions = 0;
    const add = tool("add", (left: number, right: number) => {
      executions += 1;
      return left + right;
    });

    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fork-replay", () =>
      callAndAdd(recorder.wrapOpenAI(staticClient("baseline answer")), add),
    );
    recorder.dispose();
    const baseline = findRun(store, (run) => run.mode === "recorded");

    const forker = makeForkpoint({
      store,
      mode: "fork",
      baselineRunId: baseline.id,
      overrides: { model: "fork-model", systemPrompt: "fork system" },
    });
    const forked = await forker.run("fork-replay", () =>
      callAndAdd(forker.wrapOpenAI(staticClient("forked answer")), add),
    );
    const variant = findRun(
      store,
      (run) => run.mode === "forked" && run.parentRunId === baseline.id,
    );

    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: variant.id });
    const live = throwingClient();
    const replayed = await replayer.run("fork-replay", () =>
      callAndAdd(replayer.wrapOpenAI(live), add),
    );

    expect(replayed).toEqual(forked);
    expect(live.calls).toBe(0);
    expect(executions).toBe(1);

    let replayedRunId = "";
    const cassette = openCassette(store);
    try {
      const replayedRun = cassette
        .listRuns(50)
        .find((run) => run.mode === "replayed" && run.parentRunId === variant.id);
      replayedRunId = replayedRun!.id;
      const warnings = cassette
        .getEventsByType(replayedRun!.id, "replay.warning")
        .map((event) => (event.payload as { code: string }).code);
      expect(warnings).toContain("FORK_OVERRIDES_APPLIED");
    } finally {
      cassette.close();
    }

    const secondReplayer = makeForkpoint({ store, mode: "replay", baselineRunId: replayedRunId });
    const liveAgain = throwingClient();
    const replayedAgain = await secondReplayer.run("fork-replay", () =>
      callAndAdd(secondReplayer.wrapOpenAI(liveAgain), add),
    );
    expect(replayedAgain).toEqual(forked);
    expect(liveAgain.calls).toBe(0);
    expect(executions).toBe(1);
  });
});

describe("fork overrides", () => {
  it("replaces the system prompt for chat and responses requests", () => {
    const chat = applyForkOverrides("chat.completions", request, { systemPrompt: "new system" });
    expect(chat.messages).toEqual([
      { role: "system", content: "new system" },
      { role: "user", content: "hi" },
    ]);

    const responses = applyForkOverrides(
      "responses",
      {
        model: "m",
        instructions: "old",
        input: [
          { role: "system", content: "old" },
          { role: "user", content: "hi" },
        ],
      },
      { systemPrompt: "new system" },
    );
    expect(responses.instructions).toBe("new system");
    expect(responses.input).toEqual([{ role: "user", content: "hi" }]);
  });

  it("rejects unknown keys, invalid temperatures, and malformed JSON", () => {
    expect(() => validateForkOverrides({ voice: "loud" })).toThrowError(UsageError);
    expect(() => validateForkOverrides({ temperature: 3 })).toThrowError(UsageError);
    expect(() => parseForkOverrides("{not json")).toThrowError(UsageError);
    expect(parseForkOverrides(undefined)).toEqual({});
  });
});
