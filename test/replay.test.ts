import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  EnvChangedError,
  FixtureMissError,
  LiveCallBlockedError,
  NestedRunError,
  NondeterminismError,
  NoActiveRunError,
  RngExhaustedError,
  RngMismatchError,
} from "../src/core/errors.js";
import { Forkpoint, tool } from "../src/index.js";
import { openCassette, type RunRow } from "../src/store/cassette.js";

interface FakeClient {
  calls: number;
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

function fakeClient(fail = false): FakeClient {
  let call = 0;
  const client: FakeClient = {
    calls: 0,
    chat: {
      completions: {
        create: async (request) => {
          client.calls += 1;
          call += 1;
          if (fail) throw new Error("boom");
          return {
            id: `chatcmpl-${call}`,
            object: "chat.completion",
            model: request.model,
            created: Date.now(),
            now: new Date().toISOString(),
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: `answer-${call}` },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 10, completion_tokens: 2, total_tokens: 12 },
          };
        },
      },
    },
  };
  return client;
}

const request = {
  model: "test-model",
  messages: [{ role: "user", content: "hi" }],
  temperature: 0,
  stream: false,
};

const stores: string[] = [];
const instances: Forkpoint[] = [];

function makeStore(): string {
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-replay-"));
  stores.push(store);
  return store;
}

function makeForkpoint(options: ConstructorParameters<typeof Forkpoint>[0]): Forkpoint {
  const fp = new Forkpoint(options);
  instances.push(fp);
  return fp;
}

function runByName(store: string, name: string): RunRow {
  const cassette = openCassette(store);
  try {
    const run = cassette.listRuns(20).find((entry) => entry.name === name);
    if (run === undefined) throw new Error(`run ${name} not found`);
    return run;
  } finally {
    cassette.close();
  }
}

function replayRun(store: string, baselineRunId: string, name: string): RunRow {
  const cassette = openCassette(store);
  try {
    return cassette
      .listRuns(50)
      .find((entry) => entry.mode === "replayed" && entry.name === name && entry.parentRunId === baselineRunId)!;
  } finally {
    cassette.close();
  }
}

afterEach(() => {
  for (const fp of instances.splice(0)) fp.dispose();
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
  delete process.env.OPENAI_API_KEY;
  delete process.env.FORKPOINT_BASELINE_RUN_ID;
  delete process.env.FORKPOINT_RUN_ID;
  delete process.env.FORKPOINT_ENV_TEST;
  delete process.env.FORKPOINT_FAIL_ON_ENV_CHANGE;
});

describe("strict replay", () => {
  it("replays LLM, tools, and clock without live calls", async () => {
    const store = makeStore();
    const counter = { llm: 0, tool: 0 };
    const client = fakeClient();
    const add = tool("add", (left: number, right: number) => {
      counter.tool += 1;
      return left + right;
    });

    const recorder = makeForkpoint({ store, mode: "record" });
    const recordedClient = recorder.wrapOpenAI({
      chat: {
        completions: {
          create: async (raw: Record<string, unknown>) => {
            counter.llm += 1;
            return client.chat.completions.create(raw);
          },
        },
      },
    });

    const body = async (wrapped: FakeClient, addTool: typeof add) => {
      const startedAt = Date.now();
      const iso = new Date().toISOString();
      const tick = performance.now();
      const response = (await wrapped.chat.completions.create(request)) as {
        id: string;
        created: number;
        now: string;
      };
      return { startedAt, iso, tick, response, sum: addTool(2, 3) };
    };

    const recorded = await recorder.run("clock-run", () => body(recordedClient as unknown as FakeClient, add));
    recorder.dispose();

    const baseline = runByName(store, "clock-run");
    expect(baseline.status).toBe("recorded");

    const liveClient: FakeClient = {
      calls: 0,
      chat: {
        completions: {
          create: async () => {
            liveClient.calls += 1;
            throw new Error("strict replay called the live client");
          },
        },
      },
    };
    const replayer = makeForkpoint({
      store,
      mode: "replay",
      baselineRunId: baseline.id,
    });
    const replayedClient = replayer.wrapOpenAI(liveClient);
    const replayed = await replayer.run("clock-run", () =>
      body(replayedClient as unknown as FakeClient, add),
    );

    expect(replayed).toEqual(recorded);
    expect(counter.llm).toBe(1);
    expect(counter.tool).toBe(1);
    expect(liveClient.calls).toBe(0);

    const variant = replayRun(store, baseline.id, "clock-run");
    expect(variant.status).toBe("replayed");
    expect(variant.mode).toBe("replayed");
    expect(variant.parentRunId).toBe(baseline.id);

    const cassette = openCassette(store);
    try {
      const events = cassette.getEvents(variant.id);
      expect(events.some((event) => event.type === "clock.now")).toBe(true);
      expect(events.some((event) => event.type === "llm.response")).toBe(true);
      expect(events.some((event) => event.type === "tool.result")).toBe(true);
    } finally {
      cassette.close();
    }
  });

  it("does not execute write tools and records a warning", async () => {
    const store = makeStore();
    let executions = 0;
    const write = tool("write_row", (value: string) => {
      executions += 1;
      return { written: value };
    }, { write: true });

    const recorder = makeForkpoint({ store, mode: "record" });
    const recorded = await recorder.run("write-run", () => write("a"));
    recorder.dispose();
    expect(recorded).toEqual({ written: "a" });
    expect(executions).toBe(1);

    const baseline = runByName(store, "write-run");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const replayed = await replayer.run("write-run", () => write("a"));

    expect(replayed).toEqual({ written: "a" });
    expect(executions).toBe(1);

    const variant = replayRun(store, baseline.id, "write-run");
    const cassette = openCassette(store);
    try {
      const warnings = cassette
        .getEventsByType(variant.id, "replay.warning")
        .map((event) => event.payload as { code: string });
      expect(warnings.map((warning) => warning.code)).toContain("WRITE_TOOL_NOT_EXECUTED");
    } finally {
      cassette.close();
    }
  });

  it("fails explicitly when a request does not exist in the cassette", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const client = recorder.wrapOpenAI(fakeClient());
    await recorder.run("mismatch-run", () => client.chat.completions.create(request));
    recorder.dispose();

    const baseline = runByName(store, "mismatch-run");
    let liveCalls = 0;
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const liveClient: FakeClient = {
      calls: 0,
      chat: {
        completions: {
          create: async () => {
            liveCalls += 1;
            return {};
          },
        },
      },
    };
    const live = replayer.wrapOpenAI(liveClient);

    await expect(
      replayer.run("mismatch-run", () =>
        live.chat.completions.create({ ...request, temperature: 0.5 }),
      ),
    ).rejects.toBeInstanceOf(FixtureMissError);
    expect(liveCalls).toBe(0);

    const cassette = openCassette(store);
    try {
      const failed = cassette
        .listRuns(10)
        .find((run) => run.mode === "replayed" && run.parentRunId === baseline.id);
      expect(failed?.status).toBe("failed");
    } finally {
      cassette.close();
    }
  });

  it("reports the nearest fixture and changed fields on a miss", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const client = recorder.wrapOpenAI(fakeClient());
    const original = {
      ...request,
      messages: [
        { role: "system", content: "old" },
        { role: "user", content: "hi" },
      ],
    };
    await recorder.run("nearest-run", () => client.chat.completions.create(original));
    recorder.dispose();

    const baseline = runByName(store, "nearest-run");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const live = replayer.wrapOpenAI(fakeClient());
    const changed = {
      ...original,
      messages: [
        { role: "system", content: "new" },
        { role: "user", content: "hi" },
      ],
    };

    const error = (await replayer
      .run("nearest-run", () => live.chat.completions.create(changed))
      .catch((caught: unknown) => caught)) as FixtureMissError;

    expect(error).toBeInstanceOf(FixtureMissError);
    expect(error.nearest).toHaveLength(1);
    expect(error.nearest[0]!.diffPaths).toContain("$.messages[0].content");
    expect(error.diffPaths).toContain("$.messages[0].content");
    expect(error.actualKey).toBe(error.nearest[0]!.key);
  });

  it("does not let agent code swallow an LLM fixture miss", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const client = recorder.wrapOpenAI(fakeClient());
    await recorder.run("swallow-llm", () => client.chat.completions.create(request));
    recorder.dispose();

    const baseline = runByName(store, "swallow-llm");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const live = replayer.wrapOpenAI(fakeClient());

    await expect(
      replayer.run("swallow-llm", async () => {
        try {
          await live.chat.completions.create({ ...request, temperature: 0.7 });
        } catch {
          return "fallback";
        }
        return "unreachable";
      }),
    ).rejects.toBeInstanceOf(FixtureMissError);

    const cassette = openCassette(store);
    try {
      const variant = cassette
        .listRuns(10)
        .find((run) => run.mode === "replayed" && run.parentRunId === baseline.id);
      expect(variant?.status).toBe("failed");
      const errors = cassette.getEventsByType(variant!.id, "llm.error");
      expect(errors).toHaveLength(1);
      expect((errors[0]!.payload as { name: string }).name).toBe("FixtureMissError");
    } finally {
      cassette.close();
    }
  });

  it("rejects overlapping runs in the same process", async () => {
    const store = makeStore();
    const fp = makeForkpoint({ store, mode: "record" });
    const first = fp.run("overlap-first", async () => {
      await new Promise((resolve) => setTimeout(resolve, 30));
      return 1;
    });

    await expect(fp.run("overlap-second", () => 2)).rejects.toBeInstanceOf(NestedRunError);
    await expect(first).resolves.toBe(1);
    await expect(fp.run("overlap-third", () => 3)).resolves.toBe(3);
  });

  it("blocks live fetch calls during replay", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("fetch-run", () => 1);
    recorder.dispose();

    const baseline = runByName(store, "fetch-run");
    const originalFetch = globalThis.fetch;
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });

    await expect(
      replayer.run("fetch-run", () => fetch("https://example.com/data")),
    ).rejects.toBeInstanceOf(LiveCallBlockedError);
    expect(globalThis.fetch).toBe(originalFetch);
  });

  it("replays recorded LLM errors with the same name and message", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const failing = recorder.wrapOpenAI(fakeClient(true));
    await expect(
      recorder.run("llm-error", () => failing.chat.completions.create(request)),
    ).rejects.toThrow("boom");
    recorder.dispose();

    const baseline = runByName(store, "llm-error");
    expect(baseline.status).toBe("failed");

    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const live = replayer.wrapOpenAI(fakeClient());
    await expect(
      replayer.run("llm-error", () => live.chat.completions.create(request)),
    ).rejects.toThrow("boom");

    const variant = replayRun(store, baseline.id, "llm-error");
    expect(variant.status).toBe("failed");
    const cassette = openCassette(store);
    try {
      expect(cassette.getEventsByType(variant.id, "llm.error")).toHaveLength(1);
    } finally {
      cassette.close();
    }
  });

  it("preserves recorded error fields on replay", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const failing = recorder.wrapOpenAI({
      chat: {
        completions: {
          create: async (_request: unknown) => {
            throw Object.assign(new Error("rate limited"), {
              name: "RateLimitError",
              status: 429,
              code: "rate_limit_exceeded",
              type: "requests",
              param: "model",
              request_id: "req-123",
            });
          },
        },
      },
    });

    await expect(
      recorder.run("llm-error-fields", () => failing.chat.completions.create(request)),
    ).rejects.toMatchObject({ status: 429 });
    recorder.dispose();

    const baseline = runByName(store, "llm-error-fields");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const live = replayer.wrapOpenAI(fakeClient());
    const error = await replayer
      .run("llm-error-fields", () => live.chat.completions.create(request))
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(Error);
    expect(error).toMatchObject({
      name: "RateLimitError",
      message: "rate limited",
      status: 429,
      code: "rate_limit_exceeded",
      type: "requests",
      param: "model",
      request_id: "req-123",
    });
  });

  it("replays repeated identical requests in occurrence order", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const recordedClient = recorder.wrapOpenAI(fakeClient());
    const recorded = await recorder.run("occurrence-run", async () => {
      const first = (await recordedClient.chat.completions.create(request)) as { id: string };
      const second = (await recordedClient.chat.completions.create(request)) as { id: string };
      return [first.id, second.id];
    });
    recorder.dispose();
    expect(recorded).toEqual(["chatcmpl-1", "chatcmpl-2"]);

    const baseline = runByName(store, "occurrence-run");
    let liveCalls = 0;
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const liveClient: FakeClient = {
      calls: 0,
      chat: {
        completions: {
          create: async () => {
            liveCalls += 1;
            return {};
          },
        },
      },
    };
    const live = replayer.wrapOpenAI(liveClient);

    const replayed = await replayer.run("occurrence-run", async () => {
      const first = (await live.chat.completions.create(request)) as { id: string };
      const second = (await live.chat.completions.create(request)) as { id: string };
      return [first.id, second.id];
    });

    expect(replayed).toEqual(recorded);
    expect(liveCalls).toBe(0);
  });

  it("replays Math.random, UUIDs, and random bytes exactly", async () => {
    const store = makeStore();
    const sample = () => ({
      random: Math.random(),
      uuid: crypto.randomUUID(),
      bytes: Array.from(crypto.getRandomValues(new Uint8Array(8))),
    });

    const recorder = makeForkpoint({ store, mode: "record" });
    const recorded = await recorder.run("rng-run", sample);
    recorder.dispose();

    const baseline = runByName(store, "rng-run");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const replayed = await replayer.run("rng-run", sample);

    expect(replayed).toEqual(recorded);

    const cassette = openCassette(store);
    try {
      const sources = cassette
        .getEventsByType(baseline.id, "rng.value")
        .map((event) => (event.payload as { source: string }).source);
      expect(sources).toEqual(["math.random", "crypto.randomUUID", "crypto.getRandomValues"]);
      expect(cassette.getEventsByType(replayRun(store, baseline.id, "rng-run").id, "rng.value")).toHaveLength(3);
    } finally {
      cassette.close();
    }
  });

  it("replays a replayed run from its copied fixtures", async () => {
    const store = makeStore();
    const add = tool("add", (left: number, right: number) => left + right);
    const body = async (wrapped: FakeClient) => {
      const response = (await wrapped.chat.completions.create(request)) as { id: string };
      return { id: response.id, sum: add(2, 3), now: Date.now() };
    };

    const recorder = makeForkpoint({ store, mode: "record" });
    const recorded = await recorder.run("replay-twice", () =>
      body(recorder.wrapOpenAI(fakeClient()) as unknown as FakeClient),
    );
    recorder.dispose();

    const baseline = runByName(store, "replay-twice");
    const firstReplayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const first = await firstReplayer.run("replay-twice", () =>
      body(firstReplayer.wrapOpenAI(fakeClient()) as unknown as FakeClient),
    );
    expect(first).toEqual(recorded);

    const variant = replayRun(store, baseline.id, "replay-twice");
    const cassette = openCassette(store);
    try {
      expect(cassette.countFixtures(variant.id)).toBe(2);
    } finally {
      cassette.close();
    }

    const secondReplayer = makeForkpoint({ store, mode: "replay", baselineRunId: variant.id });
    const second = await secondReplayer.run("replay-twice", () =>
      body(secondReplayer.wrapOpenAI(fakeClient()) as unknown as FakeClient),
    );
    expect(second).toEqual(recorded);
  });

  it("keeps baseline redaction rules when a replay adds its own", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({
      store,
      mode: "record",
      redact: [{ name: "baseline-rule", pattern: /base_[a-z]+/g, replacement: "[BASE]" }],
    });
    await recorder.run("redact-merge", () => 1);
    recorder.dispose();

    const baseline = runByName(store, "redact-merge");
    const replayer = makeForkpoint({
      store,
      mode: "replay",
      baselineRunId: baseline.id,
      redact: [{ name: "own-rule", pattern: /own_[a-z]+/g, replacement: "[OWN]" }],
    });
    await replayer.run("redact-merge", () => 1);

    const cassette = openCassette(store);
    try {
      const variant = cassette
        .listRuns(10)
        .find((run) => run.mode === "replayed" && run.parentRunId === baseline.id);
      const config = JSON.parse(variant?.configJson ?? "{}") as {
        redactionRules?: string[];
        redactionPatterns?: Array<{ name: string }>;
      };
      expect(config.redactionRules).toEqual(["baseline-rule", "own-rule"]);
      expect(config.redactionPatterns?.map((rule) => rule.name)).toEqual([
        "baseline-rule",
        "own-rule",
      ]);
    } finally {
      cassette.close();
    }
  });

  it("does not record clock or RNG reads inside live SDK internals", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    const client = recorder.wrapOpenAI({
      chat: {
        completions: {
          create: async (raw: Record<string, unknown>) => {
            Math.random();
            crypto.randomUUID();
            return {
              id: "chatcmpl-internal",
              model: raw.model,
              created: Date.now(),
              generatedAt: new Date().toISOString(),
              choices: [],
            };
          },
        },
      },
    });

    const internalTool = tool("internal_tool", () => ({
      now: Date.now(),
      random: Math.random(),
    }));

    const recorded = await recorder.run("internal-reads", async () => {
      await client.chat.completions.create(request);
      return { tool: internalTool(), now: Date.now(), random: Math.random() };
    });
    recorder.dispose();

    const baseline = runByName(store, "internal-reads");
    const cassette = openCassette(store);
    try {
      expect(cassette.getEventsByType(baseline.id, "clock.now")).toHaveLength(1);
      expect(cassette.getEventsByType(baseline.id, "rng.value")).toHaveLength(1);
    } finally {
      cassette.close();
    }

    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    const replayClient = replayer.wrapOpenAI({
      chat: {
        completions: {
          create: async (_request: unknown) => {
            throw new Error("strict replay called the live client");
          },
        },
      },
    });
    const replayed = await replayer.run("internal-reads", async () => {
      await replayClient.chat.completions.create(request);
      return { tool: internalTool(), now: Date.now(), random: Math.random() };
    });

    expect(replayed).toEqual(recorded);
  });

  it("fails when replay consumes fewer clock or RNG values than recorded", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("clock-short", () => [Date.now(), Date.now()]);
    await recorder.run("rng-short-consumed", () => [Math.random(), Math.random()]);
    recorder.dispose();

    const clockBaseline = runByName(store, "clock-short");
    const clockReplayer = makeForkpoint({
      store,
      mode: "replay",
      baselineRunId: clockBaseline.id,
    });
    await expect(
      clockReplayer.run("clock-short", () => [Date.now()]),
    ).rejects.toBeInstanceOf(NondeterminismError);
    expect(replayRun(store, clockBaseline.id, "clock-short").status).toBe("failed");

    const rngBaseline = runByName(store, "rng-short-consumed");
    const rngReplayer = makeForkpoint({
      store,
      mode: "replay",
      baselineRunId: rngBaseline.id,
    });
    await expect(
      rngReplayer.run("rng-short-consumed", () => [Math.random()]),
    ).rejects.toBeInstanceOf(NondeterminismError);
    expect(replayRun(store, rngBaseline.id, "rng-short-consumed").status).toBe("failed");
  });

  it("fails when replay consumes more clock reads than recorded", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("clock-long", () => Date.now());
    recorder.dispose();

    const baseline = runByName(store, "clock-long");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    await expect(
      replayer.run("clock-long", () => [Date.now(), Date.now()]),
    ).rejects.toBeInstanceOf(NondeterminismError);
  });

  it("fails when replay consumes more randomness than recorded", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("rng-short", () => Math.random());
    recorder.dispose();

    const baseline = runByName(store, "rng-short");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    await expect(
      replayer.run("rng-short", () => [Math.random(), Math.random()]),
    ).rejects.toBeInstanceOf(RngExhaustedError);
  });

  it("fails when replay consumes a different randomness source", async () => {
    const store = makeStore();
    const recorder = makeForkpoint({ store, mode: "record" });
    await recorder.run("rng-order", () => {
      Math.random();
      return crypto.randomUUID();
    });
    recorder.dispose();

    const baseline = runByName(store, "rng-order");
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: baseline.id });
    await expect(
      replayer.run("rng-order", () => {
        crypto.randomUUID();
        return Math.random();
      }),
    ).rejects.toBeInstanceOf(RngMismatchError);
  });

  it("fails on a changed environment when failOnEnvChange is set", async () => {
    const store = makeStore();
    const envWhitelist = ["FORKPOINT_ENV_TEST"];
    const recorder = makeForkpoint({ store, mode: "record", envWhitelist });
    await recorder.run("env-run", () => 1);
    recorder.dispose();

    const baseline = runByName(store, "env-run");
    process.env.FORKPOINT_ENV_TEST = "changed";
    const replayer = makeForkpoint({
      store,
      mode: "replay",
      baselineRunId: baseline.id,
      envWhitelist,
      failOnEnvChange: true,
    });
    await expect(replayer.run("env-run", () => 1)).rejects.toBeInstanceOf(EnvChangedError);

    const variant = replayRun(store, baseline.id, "env-run");
    expect(variant.status).toBe("failed");
  });

  it("keeps wrapped calls outside fp.run rejected", async () => {
    const store = makeStore();
    const replayer = makeForkpoint({ store, mode: "replay", baselineRunId: "r_01m5emwqk393dztah4rjrbqz3j" });
    const add = tool("add", () => 1);
    expect(() => add()).toThrowError(NoActiveRunError);

    const wrapped = replayer.wrapOpenAI(fakeClient());
    await expect(wrapped.chat.completions.create(request)).rejects.toBeInstanceOf(NoActiveRunError);
  });
});
