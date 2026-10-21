import { mkdtempSync, readFileSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { Forkpoint, tool } from "../src/index.js";
import {
  NoActiveRunError,
  NestedRunError,
  UnsupportedStreamMethodError,
} from "../src/core/errors.js";
import { cassettePath } from "../src/store/db.js";
import { openCassette } from "../src/store/cassette.js";

interface FakeClient {
  calls: number;
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

function fakeClient(fail = false): FakeClient {
  const client: FakeClient = {
    calls: 0,
    chat: {
      completions: {
        create: async (request) => {
          client.calls += 1;
          if (fail) throw new Error("boom");
          return {
            id: "chatcmpl-test",
            object: "chat.completion",
            model: request.model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "hello" },
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
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-run-"));
  stores.push(store);
  return store;
}

function makeForkpoint(store: string, mode: "record" | "off" = "record"): Forkpoint {
  const fp = new Forkpoint({ store, mode });
  instances.push(fp);
  return fp;
}

afterEach(() => {
  for (const fp of instances.splice(0)) fp.dispose();
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
  delete process.env.OPENAI_API_KEY;
});

describe("Forkpoint recording", () => {
  it("records a run with LLM, tool, env, and lifecycle events", async () => {
    const store = makeStore();
    process.env.OPENAI_API_KEY = "sk-forkpoint-test-secret";
    const client = fakeClient();
    const fp = makeForkpoint(store);
    const wrapped = fp.wrapOpenAI(client);
    const add = tool("add", (left: number, right: number) => left + right);

    const result = await fp.run("test-run", async () => {
      const response = (await wrapped.chat.completions.create(request)) as { id: string };
      const sum = add(2, 3);
      return { id: response.id, sum };
    });

    expect(result).toEqual({ id: "chatcmpl-test", sum: 5 });
    expect(client.calls).toBe(1);

    const cassette = openCassette(store);
    try {
      const run = cassette.getRun(cassette.listRuns(1)[0]!.id);
      expect(run?.name).toBe("test-run");
      expect(run?.status).toBe("recorded");
      expect(run?.mode).toBe("recorded");
      expect(run?.metricsJson).toContain('"llmCalls":1');
      expect(run?.metricsJson).toContain('"toolCalls":1');

      const events = cassette.getEvents(run!.id);
      expect(events.map((event) => event.type)).toEqual([
        "run.start",
        "env.snapshot",
        "llm.request",
        "llm.response",
        "tool.call",
        "tool.result",
        "run.end",
      ]);
      expect(events.map((event) => event.seq)).toEqual([0, 1, 2, 3, 4, 5, 6]);
      expect(events[0]?.payload).toEqual({ name: "test-run", mode: "record" });
      expect(events[2]?.callsite).toMatch(/^test\/run\.test\.ts:\d+:\d+$/);
      expect(events[4]?.callsite).toMatch(/^test\/run\.test\.ts:\d+:\d+$/);
      expect(events[2]?.requestHash).toMatch(/^[0-9a-f]{64}$/);
      expect(events[3]?.responseHash).toMatch(/^[0-9a-f]{64}$/);

      const llmFixture = cassette.getFixture(run!.id, "llm", events[2]!.requestHash!, 0);
      expect(llmFixture?.response).toMatchObject({ id: "chatcmpl-test" });
      const toolFixture = cassette.getFixture(run!.id, "tool", events[4]!.requestHash!, 0);
      expect(toolFixture?.response).toEqual({ result: 5 });

      const env = events.find((event) => event.type === "env.snapshot")?.payload as {
        env: Record<string, string>;
      };
      expect(env.env.OPENAI_API_KEY).toBeUndefined();
      expect(readFileSync(cassettePath(store)).includes("sk-forkpoint-test-secret")).toBe(false);
    } finally {
      cassette.close();
    }
  });

  it("allocates occurrences for identical requests", async () => {
    const store = makeStore();
    const client = fakeClient();
    const fp = makeForkpoint(store);
    const wrapped = fp.wrapOpenAI(client);
    const ping = tool("ping", () => "pong");

    await fp.run("occurrences", async () => {
      await wrapped.chat.completions.create(request);
      await wrapped.chat.completions.create(request);
      ping();
      ping();
    });

    const cassette = openCassette(store);
    try {
      const runId = cassette.listRuns(1)[0]!.id;
      const llmRequest = cassette.getEvents(runId).find((event) => event.type === "llm.request")!;
      const toolCall = cassette.getEvents(runId).find((event) => event.type === "tool.call")!;
      expect(cassette.getFixture(runId, "llm", llmRequest.requestHash!, 0)).toBeDefined();
      expect(cassette.getFixture(runId, "llm", llmRequest.requestHash!, 1)).toBeDefined();
      expect(cassette.getFixture(runId, "tool", toolCall.requestHash!, 0)).toBeDefined();
      expect(cassette.getFixture(runId, "tool", toolCall.requestHash!, 1)).toBeDefined();
      expect(cassette.getFixture(runId, "tool", toolCall.requestHash!, 2)).toBeUndefined();
    } finally {
      cassette.close();
    }
  });

  it("records LLM errors as fixtures", async () => {
    const store = makeStore();
    const fp = makeForkpoint(store);
    const wrapped = fp.wrapOpenAI(fakeClient(true));

    await expect(
      fp.run("llm-error", async () => wrapped.chat.completions.create(request)),
    ).rejects.toThrow("boom");

    const cassette = openCassette(store);
    try {
      const run = cassette.listRuns(1)[0]!;
      expect(run.status).toBe("failed");
      const events = cassette.getEvents(run.id);
      expect(events.map((event) => event.type)).toContain("llm.error");
      const requestEvent = events.find((event) => event.type === "llm.request")!;
      const fixture = cassette.getFixture(run.id, "llm", requestEvent.requestHash!, 0);
      expect(fixture?.meta).toMatchObject({ error: { name: "Error", message: "boom" } });
    } finally {
      cassette.close();
    }
  });

  it("rejects nested runs and wrapped calls outside fp.run", async () => {
    const store = makeStore();
    const fp = makeForkpoint(store);
    const add = tool("add", (left: number, right: number) => left + right);

    expect(() => add(1, 2)).toThrowError(NoActiveRunError);
    await expect(fp.run("outer", async () => fp.run("inner", async () => 1))).rejects.toBeInstanceOf(
      NestedRunError,
    );
  });

  it("fails explicitly for unsupported streaming", async () => {
    const store = makeStore();
    const fp = makeForkpoint(store);
    const wrapped = fp.wrapOpenAI(fakeClient());

    await expect(
      fp.run("stream", async () =>
        wrapped.chat.completions.create({ ...request, stream: true }),
      ),
    ).rejects.toBeInstanceOf(UnsupportedStreamMethodError);
  });

  it("does not create files or intercept boundaries in off mode", async () => {
    const store = makeStore();
    const fp = makeForkpoint(store, "off");
    const client = fakeClient();
    const wrapped = fp.wrapOpenAI(client);
    const add = tool("add", (left: number, right: number) => left + right);

    const value = await fp.run("off", async () => {
      await wrapped.chat.completions.create(request);
      return add(1, 2);
    });

    expect(value).toBe(3);
    expect(client.calls).toBe(1);
    expect(existsSync(cassettePath(store))).toBe(false);
  });
});
