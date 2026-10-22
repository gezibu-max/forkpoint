import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openCassette } from "../src/store/cassette.js";
import { cassettePath } from "../src/store/db.js";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const stores: string[] = [];

function makeStore(): string {
  const store = mkdtempSync(path.join(tmpdir(), "forkpoint-cli-"));
  stores.push(store);
  return store;
}

afterEach(() => {
  for (const store of stores.splice(0)) rmSync(store, { recursive: true, force: true });
});

function cleanEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env };
  delete env.OPENAI_API_KEY;
  delete env.FORKPOINT_MODE;
  delete env.FORKPOINT_RUN_ID;
  delete env.FORKPOINT_BASELINE_RUN_ID;
  delete env.FORKPOINT_BASELINE_MODEL;
  delete env.FORKPOINT_STORE;
  delete env.FORKPOINT_COMMAND;
  delete env.FORKPOINT_FAIL_ON_ENV_CHANGE;
  delete env.FORKPOINT_DEMO_PLAN;
  delete env.FORKPOINT_DEMO_TODAY;
  return env;
}

function run(store: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli/index.ts", ...args, "--store", store],
    {
      cwd: repoRoot,
      env: { ...cleanEnv(), ...extraEnv },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
}

function recordDemo(store: string, name: string, extraEnv: NodeJS.ProcessEnv = {}) {
  return spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "src/cli/index.ts",
      "record",
      "--name",
      name,
      "--store",
      store,
      "--",
      process.execPath,
      "--import",
      "tsx",
      "examples/sql-agent/index.ts",
    ],
    {
      cwd: repoRoot,
      env: { ...cleanEnv(), ...extraEnv },
      encoding: "utf8",
      timeout: 60_000,
    },
  );
}

function recordedRunId(stdout: string): string {
  const match = /Recorded run (r_[0-9a-hjkmnp-tv-z]{26})/.exec(stdout);
  if (match === null) throw new Error(`no run id in output: ${stdout}`);
  return match[1]!;
}

function trailingJson(stdout: string): unknown {
  const start = stdout.lastIndexOf("\n{");
  return JSON.parse(start === -1 ? stdout : stdout.slice(start + 1));
}

describe("CLI integration", () => {
  it("records the demo and exposes it through show and ls", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-integration");

    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const cassette = openCassette(store);
    try {
      const run = cassette.getRun(runId);
      expect(run?.status).toBe("recorded");
      expect(cassette.countEvents(runId)).toBeGreaterThan(10);
    } finally {
      cassette.close();
    }

    const show = run(store, ["show", runId, "--json"]);
    expect(show.status, show.stderr).toBe(0);
    const shown = JSON.parse(show.stdout) as { run: { status: string } };
    expect(shown.run.status).toBe("recorded");

    const ls = run(store, ["ls", "--json"]);
    expect(ls.status, ls.stderr).toBe(0);
    const listed = JSON.parse(ls.stdout) as { runs: Array<{ id: string }> };
    expect(listed.runs.map((entry) => entry.id)).toContain(runId);
  });

  it("replays a recorded run offline into a new run row", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-replay");
    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const before = openCassette(store);
    let baselineEvents = 0;
    try {
      baselineEvents = before.countEvents(runId);
    } finally {
      before.close();
    }

    const replay = run(store, ["replay", runId, "--json"]);
    expect(replay.status, replay.stderr).toBe(0);
    expect(replay.stdout).toContain("scripted run");

    const result = trailingJson(replay.stdout) as {
      ok: boolean;
      runId: string;
      baselineRunId: string;
      status: string;
    };
    expect(result.ok).toBe(true);
    expect(result.baselineRunId).toBe(runId);
    expect(result.status).toBe("replayed");

    const cassette = openCassette(store);
    try {
      const baseline = cassette.getRun(runId);
      expect(baseline?.status).toBe("recorded");
      expect(cassette.countEvents(runId)).toBe(baselineEvents);

      const variant = cassette.getRun(result.runId);
      expect(variant?.mode).toBe("replayed");
      expect(variant?.status).toBe("replayed");
      expect(variant?.parentRunId).toBe(runId);
      expect(cassette.countEvents(result.runId)).toBeGreaterThan(10);
      expect(cassette.hasEventType(result.runId, "tool.error")).toBe(true);
      expect(cassette.hasEventType(result.runId, "clock.now")).toBe(true);
    } finally {
      cassette.close();
    }
  });

  it("diffs a replay variant against its baseline with no behavioral divergence", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-diff");
    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const replay = run(store, ["replay", runId, "--json"]);
    expect(replay.status, replay.stderr).toBe(0);
    const variant = trailingJson(replay.stdout) as { runId: string };

    const diff = run(store, ["diff", runId, variant.runId, "--json"]);
    expect(diff.status, diff.stderr).toBe(0);
    const report = JSON.parse(diff.stdout) as {
      base: { id: string; mode: string };
      variant: { id: string; mode: string };
      firstDivergence: unknown;
      steps: Array<{ status: string }>;
      metrics: { base: { llmCalls: number; toolCalls: number; totalTokens: number } };
    };

    expect(report.base.id).toBe(runId);
    expect(report.variant.id).toBe(variant.runId);
    expect(report.variant.mode).toBe("replayed");
    expect(report.firstDivergence).toBeNull();
    expect(report.steps.length).toBeGreaterThan(5);
    expect(report.steps.every((step) => step.status === "same")).toBe(true);
    expect(report.metrics.base).toMatchObject({ llmCalls: 5, toolCalls: 5, totalTokens: 2400 });

    const output = path.join(store, "diff.json");
    const toFile = run(store, ["diff", runId, variant.runId, "--format", "json", "-o", output]);
    expect(toFile.status, toFile.stderr).toBe(0);
    expect(toFile.stdout).toContain("Wrote");
  });

  it("localizes tool-level and answer-level divergence in a fixed scenario set", () => {
    const store = makeStore();
    const fixed = { FORKPOINT_DEMO_TODAY: "2026-10-21T00:00:00.000Z" };
    const baselineRun = recordDemo(store, "scenario-baseline", {
      ...fixed,
      FORKPOINT_DEMO_PLAN: "baseline",
    });
    const correctedRun = recordDemo(store, "scenario-corrected", {
      ...fixed,
      FORKPOINT_DEMO_PLAN: "corrected",
    });
    const altFinalRun = recordDemo(store, "scenario-alt-final", {
      ...fixed,
      FORKPOINT_DEMO_PLAN: "alt-final",
    });

    for (const recorded of [baselineRun, correctedRun, altFinalRun]) {
      expect(recorded.status, recorded.stderr).toBe(0);
    }
    const baseline = recordedRunId(baselineRun.stdout);
    const corrected = recordedRunId(correctedRun.stdout);
    const altFinal = recordedRunId(altFinalRun.stdout);

    const correctedDiff = run(store, ["diff", baseline, corrected, "--json"]);
    expect(correctedDiff.status, correctedDiff.stderr).toBe(0);
    const correctedReport = JSON.parse(correctedDiff.stdout) as {
      firstDivergence: { status: string; fields?: Array<{ path: string }> } | null;
      steps: Array<{ status: string }>;
      finalOutput: { base: string; variant: string } | null;
    };
    expect(correctedReport.firstDivergence?.status).toBe("response_changed");
    expect(correctedReport.firstDivergence?.fields?.[0]?.path).toContain(
      "tool_calls[0].function.arguments",
    );
    expect(correctedReport.steps.slice(0, 7).every((step) => step.status === "same")).toBe(true);
    expect(correctedReport.steps.some((step) => step.status === "request_mismatch")).toBe(true);
    expect(correctedReport.finalOutput?.base).not.toBe(correctedReport.finalOutput?.variant);

    const altFinalDiff = run(store, ["diff", baseline, altFinal, "--json"]);
    expect(altFinalDiff.status, altFinalDiff.stderr).toBe(0);
    const altFinalReport = JSON.parse(altFinalDiff.stdout) as {
      firstDivergence: { status: string; fields?: Array<{ path: string }> } | null;
      steps: Array<{ status: string }>;
      finalOutput: { base: string; variant: string } | null;
    };
    expect(altFinalReport.firstDivergence?.status).toBe("response_changed");
    expect(altFinalReport.firstDivergence?.fields?.[0]?.path).toBe(
      "$.choices[0].message.content",
    );
    expect(altFinalReport.steps.slice(0, 9).every((step) => step.status === "same")).toBe(true);
    expect(altFinalReport.finalOutput?.variant).toContain("fork demo");
  });

  it("rejects diffing a run against itself", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-diff-self");
    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const diff = run(store, ["diff", runId, runId, "--json"]);
    expect(diff.status).toBe(2);
    expect(diff.stderr).toContain("Cannot diff a run against itself");
  });

  it("verifies that two replays produce identical event hashes", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-verify");
    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const verify = run(store, ["verify", runId, "--json"]);
    expect(verify.status, verify.stderr).toBe(0);
    const result = JSON.parse(verify.stdout) as {
      ok: boolean;
      baselineRunId: string;
      deterministic: boolean;
      eventCount: number;
      hash: string;
      replays: Array<{ runId: string; status: string }>;
      unconsumedFixtures?: number;
    };

    expect(result.ok).toBe(true);
    expect(result.deterministic).toBe(true);
    expect(result.baselineRunId).toBe(runId);
    expect(result.eventCount).toBeGreaterThan(10);
    expect(result.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.replays).toHaveLength(2);
    expect(result.replays.every((entry) => entry.status === "replayed")).toBe(true);
    expect(result.unconsumedFixtures).toBeUndefined();

    const cassette = openCassette(store);
    try {
      expect(cassette.getRun(runId)?.status).toBe("recorded");
      expect(
        cassette.listRuns(10).filter((entry) => entry.mode === "replayed" && entry.parentRunId === runId),
      ).toHaveLength(2);
    } finally {
      cassette.close();
    }
  });

  it("forks a recorded run with live scripted model calls and frozen tools", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-fork");
    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const fork = run(
      store,
      ["fork", runId, "--model", "scripted-alt", "--name", "cli-fork-alt", "--json"],
      { FORKPOINT_DEMO_PLAN: "alt-final" },
    );
    expect(fork.status, fork.stderr).toBe(0);
    const result = trailingJson(fork.stdout) as {
      ok: boolean;
      runId: string;
      baselineRunId: string;
      status: string;
    };
    expect(result.ok).toBe(true);
    expect(result.baselineRunId).toBe(runId);
    expect(result.status).toBe("forked");

    const cassette = openCassette(store);
    try {
      const variant = cassette.getRun(result.runId);
      expect(variant?.mode).toBe("forked");
      expect(variant?.status).toBe("forked");
      expect(variant?.name).toBe("cli-fork-alt");
      expect(variant?.parentRunId).toBe(runId);
      expect(cassette.countFixtures(result.runId)).toBe(cassette.countFixtures(runId));
      expect(cassette.getEventsByType(result.runId, "tool.result")).toHaveLength(
        cassette.getEventsByType(runId, "tool.result").length,
      );

      const start = cassette.getEventsByType(result.runId, "run.start")[0]!;
      expect((start.payload as { mode: string }).mode).toBe("fork");
      const warnings = cassette
        .getEventsByType(result.runId, "replay.warning")
        .map((event) => (event.payload as { code: string }).code);
      expect(warnings).toContain("FORK_TOOLS_FROZEN");

      const config = JSON.parse(variant?.configJson ?? "{}") as {
        overrides?: { model?: string };
      };
      expect(config.overrides).toEqual({ model: "scripted-alt" });
    } finally {
      cassette.close();
    }

    const replay = run(store, ["replay", result.runId, "--json"]);
    expect(replay.status, replay.stderr).toBe(0);
    const replayed = trailingJson(replay.stdout) as { status: string; baselineRunId: string };
    expect(replayed.status).toBe("replayed");
    expect(replayed.baselineRunId).toBe(result.runId);

    const diff = run(store, ["diff", runId, result.runId, "--format", "json"]);
    expect(diff.status, diff.stderr).toBe(0);
    const report = JSON.parse(diff.stdout) as {
      firstDivergence: { status: string; severity: string } | null;
      finalOutput: { base: string; variant: string } | null;
    };
    expect(report.firstDivergence?.severity).toBe("expected");
    expect(report.finalOutput).not.toBeNull();
    expect(report.finalOutput?.variant).toContain("fork demo");
  });

  it("exports a redacted JSONL file and refuses raw export", () => {
    const store = makeStore();
    const record = recordDemo(store, "cli-export");
    expect(record.status, record.stderr).toBe(0);
    const runId = recordedRunId(record.stdout);

    const cassette = openCassette(store);
    let eventCount: number;
    let fixtureCount: number;
    try {
      eventCount = cassette.countEvents(runId);
      fixtureCount = cassette.countFixtures(runId);
    } finally {
      cassette.close();
    }

    const target = path.join(store, "exports", "run.jsonl");
    const exported = run(store, ["export", runId, "--redact", "-o", target, "--json"]);
    expect(exported.status, exported.stderr).toBe(0);
    const summary = JSON.parse(exported.stdout) as {
      ok: boolean;
      runId: string;
      redacted: boolean;
      replayable: boolean;
      events: number;
      fixtures: number;
      findings: unknown[];
    };
    expect(summary).toMatchObject({
      ok: true,
      runId,
      redacted: true,
      replayable: false,
      events: eventCount,
      fixtures: fixtureCount,
      findings: [],
    });

    const lines = readFileSync(target, "utf8").trimEnd().split("\n");
    expect(lines).toHaveLength(1 + eventCount + fixtureCount);
    const meta = JSON.parse(lines[0]!) as { kind: string; redacted: boolean; replayable: boolean };
    expect(meta).toMatchObject({ kind: "meta", redacted: true, replayable: false });

    const noRedact = run(store, ["export", runId]);
    expect(noRedact.status).toBe(2);
    expect(noRedact.stderr).toContain("--redact");

    const overwrite = run(store, [
      "export",
      runId,
      "--redact",
      "-o",
      cassettePath(store),
    ]);
    expect(overwrite.status).toBe(2);
    expect(overwrite.stderr).toContain("Refusing to overwrite the cassette");
  });

  it("marks a command that never starts fp.run as failed", () => {
    const store = makeStore();
    const record = spawnSync(
      process.execPath,
      [
        "--import",
        "tsx",
        "src/cli/index.ts",
        "record",
        "--name",
        "noop",
        "--store",
        store,
        "--",
        process.execPath,
        "-e",
        "process.exit(0)",
      ],
      {
        cwd: repoRoot,
        env: cleanEnv(),
        encoding: "utf8",
        timeout: 30_000,
      },
    );

    expect(record.status).toBe(1);
    expect(record.stderr).toContain("never started a run");

    const cassette = openCassette(store);
    try {
      const runs = cassette.listRuns(1);
      expect(runs).toHaveLength(1);
      expect(runs[0]?.status).toBe("failed");
    } finally {
      cassette.close();
    }
  });
});
