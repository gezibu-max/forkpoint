import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { openCassette } from "../src/store/cassette.js";

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
  return env;
}

function run(store: string, args: string[]) {
  return spawnSync(
    process.execPath,
    ["--import", "tsx", "src/cli/index.ts", ...args, "--store", store],
    {
      cwd: repoRoot,
      env: cleanEnv(),
      encoding: "utf8",
      timeout: 60_000,
    },
  );
}

function recordDemo(store: string, name: string) {
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
      env: cleanEnv(),
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
