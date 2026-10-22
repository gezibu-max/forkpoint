#!/usr/bin/env node
import { spawn } from "node:child_process";
import { resolveCliEntry } from "./resolve-cli.mjs";

let entry;
try {
  entry = resolveCliEntry();
} catch (error) {
  console.error(`forkpoint plugin: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}

const child = spawn(process.execPath, [entry, ...process.argv.slice(2)], {
  stdio: "inherit",
  windowsHide: true,
});

child.on("error", (error) => {
  console.error(`forkpoint plugin: failed to start the CLI: ${error.message}`);
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal === null ? (code ?? 1) : 1);
});
