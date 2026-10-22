#!/usr/bin/env node
import { spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolveCliEntry } from "./resolve-cli.mjs";

const HOOK_TIMEOUT_MS = 10_000;
const STDERR_LIMIT = 4_000;

// Hooks must never block the host session, so every path exits 0.
// Drain stdin first so a disabled hook cannot leave the host with a broken pipe.
if (process.stdin.isTTY) process.exit(0);
const payload = readStdin().trim();
if (process.env.FORKPOINT_OBSERVE !== "1") process.exit(0);
if (payload === "") process.exit(0);

let entry;
try {
  entry = resolveCliEntry();
} catch (error) {
  console.error(`forkpoint observe: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(0);
}

const child = spawn(process.execPath, [entry, "observe", "hook"], {
  stdio: ["pipe", "ignore", "pipe"],
  windowsHide: true,
});

let stderr = "";
child.stderr.on("data", (chunk) => {
  stderr = (stderr + chunk.toString()).slice(-STDERR_LIMIT);
});

const timer = setTimeout(() => child.kill(), HOOK_TIMEOUT_MS);

child.on("error", (error) => {
  clearTimeout(timer);
  console.error(`forkpoint observe: failed to start the CLI: ${error.message}`);
  process.exit(0);
});

child.on("close", () => {
  clearTimeout(timer);
  if (stderr.trim() === "") {
    process.exit(0);
  }
  process.stderr.write(`${stderr.trim()}\n`, () => process.exit(0));
});

child.stdin.on("error", () => {});
child.stdin.end(payload);

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}
