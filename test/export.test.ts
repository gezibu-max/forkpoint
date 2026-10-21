import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildExport, type ExportDocument } from "../src/cli/export.js";
import { createRunId } from "../src/core/ulid.js";
import { Forkpoint, tool } from "../src/index.js";
import { openCassette } from "../src/store/cassette.js";

interface FakeClient {
  calls: number;
  chat: {
    completions: {
      create(request: Record<string, unknown>): Promise<unknown>;
    };
  };
}

interface ExportLine {
  kind: "meta" | "event" | "fixture";
  formatVersion?: number;
  redacted?: boolean;
  replayable?: boolean;
  run?: { id: string };
  redaction?: { rules: string[] };
  event?: { type: string; payload?: Record<string, unknown> };
  fixture?: { kind: string; response?: { result?: Record<string, unknown> } };
}

function makeClient(): FakeClient {
  const client: FakeClient = {
    calls: 0,
    chat: {
      completions: {
        create: async (request) => {
          client.calls += 1;
          return {
            id: "chatcmpl-export",
            object: "chat.completion",
            model: request.model,
            choices: [
              {
                index: 0,
                message: { role: "assistant", content: "ok" },
                finish_reason: "stop",
              },
            ],
            usage: { prompt_tokens: 5, completion_tokens: 1, total_tokens: 6 },
          };
        },
      },
    },
  };
  return client;
}

const RULES = [
  { name: "internal-id", pattern: /int_[a-z0-9]+/g, replacement: "[INTERNAL]" },
];

const lookup = tool("lookup", async (id: string) => ({
  id,
  owner: "int_abc123",
  leaked: "sk-test-planted-123456",
  authorization: "Bearer sk-test-header-secret",
}));

async function runAgent(client: FakeClient, lookupTool: (id: string) => Promise<unknown>) {
  await client.chat.completions.create({
    model: "test-model",
    messages: [{ role: "user", content: "look up int_xyz789" }],
    headers: {
      Authorization: "Bearer sk-test-header-secret",
      "x-api-key": "sk-test-api-key-123456",
    },
  });
  return lookupTool("int_abc123");
}

const stores: string[] = [];
const instances: Forkpoint[] = [];

function makeStore(): string {
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-export-"));
  stores.push(store);
  return store;
}

function makeForkpoint(options: ConstructorParameters<typeof Forkpoint>[0]): Forkpoint {
  const fp = new Forkpoint(options);
  instances.push(fp);
  return fp;
}

function parseLines(document: ExportDocument): ExportLine[] {
  return document.lines.map((line) => JSON.parse(line) as ExportLine);
}

afterEach(() => {
  for (const fp of instances.splice(0)) fp.dispose();
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
  delete process.env.OPENAI_API_KEY;
  delete process.env.FORKPOINT_RUN_ID;
});

describe("export", () => {
  it("builds a redacted JSONL document and flags secrets left by custom rules", async () => {
    const store = makeStore();
    process.env.OPENAI_API_KEY = "sk-test-env-secret-123456";
    const fp = makeForkpoint({ store, mode: "record", redact: RULES });
    const client = makeClient();
    const wrapped = fp.wrapOpenAI(client);

    await fp.run("export-run", () => runAgent(wrapped, lookup));

    const cassette = openCassette(store);
    try {
      const run = cassette.listRuns(1)[0]!;
      const events = cassette.getEvents(run.id);
      const fixtures = cassette.listFixtures(run.id);
      const document = buildExport(run, events, fixtures, {
        now: new Date("2026-10-21T00:00:00Z"),
      });
      const lines = parseLines(document);
      const jsonl = document.lines.join("\n");

      expect(document.lines).toHaveLength(1 + events.length + fixtures.length);
      expect(lines[0]).toMatchObject({
        kind: "meta",
        formatVersion: 1,
        redacted: true,
        replayable: false,
        run: { id: run.id },
        redaction: { rules: ["internal-id"] },
      });
      expect(document.rules).toEqual(["internal-id"]);

      expect(jsonl).toContain("[INTERNAL]");
      expect(jsonl).not.toContain("int_abc123");
      expect(jsonl).not.toContain("int_xyz789");
      expect(jsonl).not.toContain("sk-test-env-secret-123456");
      expect(jsonl).not.toContain("sk-test-api-key-123456");

      const toolResultIndex = events.findIndex((event) => event.type === "tool.result");
      expect(toolResultIndex).toBeGreaterThan(-1);
      const leakedFinding = document.findings.find(
        (finding) => finding.field === "$.event.payload.result.leaked",
      );
      expect(leakedFinding).toMatchObject({
        pattern: "openai-key",
        record: "event",
        line: toolResultIndex + 2,
      });
      expect(
        document.findings.some((finding) => finding.field === "$.fixture.response.result.leaked"),
      ).toBe(true);

      const toolFixtureLine = lines.find(
        (line) => line.kind === "fixture" && line.fixture?.kind === "tool",
      );
      expect(toolFixtureLine?.fixture?.response?.result?.authorization).toBe("[REDACTED]");
      expect(toolFixtureLine?.fixture?.response?.result?.owner).toBe("[INTERNAL]");
      expect(toolFixtureLine?.fixture?.response?.result?.leaked).toBe("sk-test-planted-123456");

      const config = JSON.parse(run.configJson!) as {
        redactionRules?: string[];
        redactionPatterns?: Array<{ name: string; source: string }>;
      };
      expect(config.redactionRules).toEqual(["internal-id"]);
      expect(config.redactionPatterns).toEqual([
        { name: "internal-id", source: "int_[a-z0-9]+", flags: "g", replacement: "[INTERNAL]" },
      ]);
    } finally {
      cassette.close();
    }
  });

  it("persists rules when the CLI pre-created the run row", async () => {
    const store = makeStore();
    const runId = createRunId();
    const cassette = openCassette(store);
    cassette.createRun({
      id: runId,
      name: "precreated",
      mode: "recorded",
      status: "recording",
      config: { argv: ["node", "agent.js"] },
    });
    cassette.close();

    process.env.FORKPOINT_RUN_ID = runId;
    const fp = makeForkpoint({ store, mode: "record", redact: RULES });
    await fp.run("precreated", () => runAgent(fp.wrapOpenAI(makeClient()), lookup));

    const reopened = openCassette(store);
    try {
      const run = reopened.getRun(runId)!;
      expect(run.status).toBe("recorded");
      const config = JSON.parse(run.configJson!) as {
        argv?: unknown;
        redactionPatterns?: Array<{ name: string }>;
      };
      expect(config.argv).toBeDefined();
      expect(config.redactionPatterns?.map((rule) => rule.name)).toEqual(["internal-id"]);

      const document = buildExport(run, reopened.getEvents(runId), reopened.listFixtures(runId));
      expect(document.rules).toEqual(["internal-id"]);
      expect(document.lines.join("\n")).toContain("[INTERNAL]");
    } finally {
      reopened.close();
    }
  });

  it("inherits stored redaction rules into replayed variants", async () => {
    const store = makeStore();
    const recordFp = makeForkpoint({ store, mode: "record", redact: RULES });
    const recordClient = makeClient();
    const recordWrapped = recordFp.wrapOpenAI(recordClient);
    await recordFp.run("rules-baseline", () => runAgent(recordWrapped, lookup));

    const baselineId = readRunIds(store)[0]!;
    const variantId = createRunId();
    const precreated = openCassette(store);
    precreated.createRun({
      id: variantId,
      name: "rules-baseline",
      parentRunId: baselineId,
      mode: "replayed",
      status: "recording",
      config: { replayedFrom: baselineId, argv: ["node", "agent.js"] },
    });
    precreated.close();

    const replayFp = makeForkpoint({
      store,
      mode: "replay",
      baselineRunId: baselineId,
      runId: variantId,
    });
    const replayClient = makeClient();
    const replayWrapped = replayFp.wrapOpenAI(replayClient);
    await replayFp.run("rules-baseline", () => runAgent(replayWrapped, lookup));

    expect(replayClient.calls).toBe(0);

    const cassette = openCassette(store);
    try {
      const variant = cassette.getRun(variantId)!;
      expect(variant.mode).toBe("replayed");
      const config = JSON.parse(variant.configJson!) as {
        replayedFrom?: string;
        redactionPatterns?: Array<{ name: string }>;
      };
      expect(config.replayedFrom).toBe(baselineId);
      expect(config.redactionPatterns?.map((rule) => rule.name)).toEqual(["internal-id"]);

      const document = buildExport(variant, cassette.getEvents(variant.id), cassette.listFixtures(variant.id));
      const jsonl = document.lines.join("\n");
      expect(document.rules).toEqual(["internal-id"]);
      expect(jsonl).toContain("[INTERNAL]");
      expect(jsonl).not.toContain("int_abc123");
    } finally {
      cassette.close();
    }
  });
});

function readRunIds(store: string): string[] {
  const cassette = openCassette(store);
  try {
    return cassette.listRuns(10).map((run) => run.id);
  } finally {
    cassette.close();
  }
}
