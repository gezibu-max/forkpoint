import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Mode } from "./events.js";
import { sha256 } from "./fingerprint.js";
import { UsageError } from "./errors.js";

export const DEFAULT_ENV_WHITELIST = ["NODE_ENV", "CI", "TZ", "LANG"];

const SENSITIVE_ENV = /(_KEY|_TOKEN|_SECRET|_PASSWORD)$/i;
const LOCKFILES = ["package-lock.json", "pnpm-lock.yaml", "yarn.lock", "bun.lockb", "bun.lock"];

export interface EnvironmentSnapshot {
  env: Record<string, string>;
  lockfileHash?: string;
  lockfile?: string;
}

export function resolveMode(explicit: Mode | undefined, env: NodeJS.ProcessEnv = process.env): Mode {
  const raw = explicit ?? env.FORKPOINT_MODE;
  if (raw === undefined || raw === "") return "off";
  if (raw === "record" || raw === "replay" || raw === "fork" || raw === "off") return raw;
  throw new UsageError(`Unknown Forkpoint mode: ${raw}`);
}

export function captureEnvironment(
  whitelist: string[] = DEFAULT_ENV_WHITELIST,
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd(),
): EnvironmentSnapshot {
  const captured: Record<string, string> = {};
  for (const name of whitelist) {
    if (SENSITIVE_ENV.test(name)) continue;
    const value = env[name];
    if (value !== undefined) captured[name] = value;
  }

  const lockfile = LOCKFILES.map((name) => path.join(cwd, name)).find((file) => existsSync(file));
  if (lockfile === undefined) return { env: captured };

  return {
    env: captured,
    lockfile: path.basename(lockfile),
    lockfileHash: sha256(readFileSync(lockfile)),
  };
}

export function readGitSha(cwd: string): string | undefined {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd,
    encoding: "utf8",
    timeout: 2000,
    windowsHide: true,
  });
  if (result.status !== 0) return undefined;
  const sha = result.stdout.trim();
  return /^[0-9a-f]{40}$/i.test(sha) ? sha : undefined;
}

export interface RunMetadata {
  command?: string;
  cwd: string;
  gitSha?: string;
  nodeVersion: string;
  platform: string;
  lockfileHash?: string;
  lockfile?: string;
}

export function collectRunMetadata(command?: string, cwd: string = process.cwd()): RunMetadata {
  const environment = captureEnvironment(DEFAULT_ENV_WHITELIST, process.env, cwd);
  return {
    ...(command === undefined ? {} : { command }),
    cwd,
    gitSha: readGitSha(cwd),
    nodeVersion: process.version,
    platform: `${process.platform}-${process.arch}`,
    ...(environment.lockfileHash === undefined ? {} : { lockfileHash: environment.lockfileHash }),
    ...(environment.lockfile === undefined ? {} : { lockfile: environment.lockfile }),
  };
}

export function formatCommand(command: string, args: string[]): string {
  return [command, ...args].map(quoteArg).join(" ");
}

function quoteArg(value: string): string {
  if (value === "") return '""';
  if (/^[A-Za-z0-9_./:@%+=,-]+$/.test(value)) return value;
  return `"${value.replaceAll("\\", "\\\\").replaceAll('"', '\\"')}"`;
}
