import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const wrapper = path.join(repoRoot, "plugin", "scripts", "observe.mjs");
const tempDirs: string[] = [];

function makeTempDir(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "forkpoint-hook-"));
  tempDirs.push(dir);
  return dir;
}

function writeFakeCli(dir: string): string {
  const script = path.join(dir, "fake-cli.mjs");
  writeFileSync(
    script,
    [
      'import { readFileSync, writeFileSync } from "node:fs";',
      "const payload = readFileSync(0, \"utf8\");",
      "if (process.env.FAKE_CLI_OUT) writeFileSync(process.env.FAKE_CLI_OUT, payload);",
      "if (process.env.FAKE_CLI_STDERR) process.stderr.write(process.env.FAKE_CLI_STDERR);",
      "process.exit(Number(process.env.FAKE_CLI_EXIT ?? \"0\"));",
      "",
    ].join("\n"),
    "utf8",
  );
  return script;
}

function runWrapper(
  payload: string,
  env: Record<string, string>,
): Promise<{ status: number | null; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [wrapper], {
      cwd: repoRoot,
      env: { ...process.env, FORKPOINT_OBSERVE: "", ...env },
      stdio: ["pipe", "ignore", "pipe"],
    });
    let stderr = "";
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk: string) => (stderr += chunk));
    child.on("error", reject);
    child.on("close", (status) => resolve({ status, stderr }));
    child.stdin.on("error", () => {});
    child.stdin.end(payload);
  });
}

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("plugin hook wrapper", () => {
  it("forwards stdin to the CLI when observe is enabled", async () => {
    const dir = makeTempDir();
    const output = path.join(dir, "payload.json");
    const payload = JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash" });
    const result = await runWrapper(payload, {
      FORKPOINT_OBSERVE: "1",
      FORKPOINT_CLI: writeFakeCli(dir),
      FAKE_CLI_OUT: output,
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe("");
    expect(readFileSync(output, "utf8")).toBe(payload);
  });

  it("does not start the CLI when observe is disabled or stdin is empty", async () => {
    const dir = makeTempDir();
    const disabledOutput = path.join(dir, "disabled.json");
    const disabled = await runWrapper("{}", {
      FORKPOINT_CLI: writeFakeCli(dir),
      FAKE_CLI_OUT: disabledOutput,
    });
    expect(disabled.status).toBe(0);
    expect(existsSync(disabledOutput)).toBe(false);

    const emptyOutput = path.join(dir, "empty.json");
    const empty = await runWrapper("", {
      FORKPOINT_OBSERVE: "1",
      FORKPOINT_CLI: writeFakeCli(dir),
      FAKE_CLI_OUT: emptyOutput,
    });
    expect(empty.status).toBe(0);
    expect(existsSync(emptyOutput)).toBe(false);
  });

  it("exits 0 but surfaces CLI failures on stderr", async () => {
    const dir = makeTempDir();
    const result = await runWrapper("{}", {
      FORKPOINT_OBSERVE: "1",
      FORKPOINT_CLI: writeFakeCli(dir),
      FAKE_CLI_EXIT: "2",
      FAKE_CLI_STDERR: "observe failed\n",
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("observe failed");
  });

  it("exits 0 when the configured CLI does not exist", async () => {
    const dir = makeTempDir();
    const result = await runWrapper("{}", {
      FORKPOINT_OBSERVE: "1",
      FORKPOINT_CLI: path.join(dir, "missing-cli.mjs"),
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toContain("FORKPOINT_CLI does not point to a file");
  });
});
