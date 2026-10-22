import path from "node:path";
import { collectRunMetadata, formatCommand } from "../core/env.js";
import type { RunStatus } from "../core/events.js";
import { RunNotFoundError, UsageError } from "../core/errors.js";
import { createRunId } from "../core/ulid.js";
import { openCassette, openExistingCassette, type RunRow } from "../store/cassette.js";
import { finalizeChildRun, spawnChild } from "./child.js";
import { printJson } from "./output.js";

export interface ReplayCommandOptions {
  runId: string;
  store: string;
  json: boolean;
  debug: boolean;
  failOnEnvChange: boolean;
  command: string[];
}

export interface ReplayCommandResult {
  runId: string;
  baselineRunId: string;
  status: RunStatus;
  childExitCode: number;
}

export interface ExecuteReplayOptions extends ReplayCommandOptions {
  quiet?: boolean;
}

export async function executeReplay(options: ExecuteReplayOptions): Promise<ReplayCommandResult> {
  const store = path.resolve(options.store);
  const baseline = readBaseline(store, options.runId);
  const resolved = resolveCommand(baseline, options.command);
  const commandText = formatCommand(resolved.command, resolved.args);
  const variantId = createRunId();
  const metadata = collectRunMetadata(commandText);

  const cassette = openCassette(store);
  try {
    cassette.createRun({
      id: variantId,
      name: baseline.name,
      parentRunId: baseline.id,
      mode: "replayed",
      status: "recording",
      command: commandText,
      cwd: metadata.cwd,
      ...(metadata.gitSha === undefined ? {} : { gitSha: metadata.gitSha }),
      nodeVersion: metadata.nodeVersion,
      platform: metadata.platform,
      config: { replayedFrom: baseline.id, argv: [resolved.command, ...resolved.args] },
    });
  } finally {
    cassette.close();
  }

  const baselineModel = readBaselineModel(store, baseline.id);
  const extraEnv: Record<string, string> = {};
  if (baselineModel !== undefined) extraEnv.FORKPOINT_BASELINE_MODEL = baselineModel;
  if (options.failOnEnvChange) extraEnv.FORKPOINT_FAIL_ON_ENV_CHANGE = "1";

  const outcome = await spawnChild({
    command: resolved.command,
    args: resolved.args,
    store,
    mode: "replay",
    runId: variantId,
    baselineRunId: baseline.id,
    commandText,
    quiet: options.quiet === true,
    ...(Object.keys(extraEnv).length === 0 ? {} : { extraEnv }),
  });
  const finalized = finalizeChildRun({
    runId: variantId,
    store,
    outcome,
    finalStatus: "replayed",
    json: options.json,
    debug: options.debug,
    missingStartMessage:
      "forkpoint: the child process never started a replay. Did it call fp.run()?",
    incompleteMessage:
      "forkpoint: the child exited without a complete replay; no run.end was recorded.",
  });

  return {
    runId: variantId,
    baselineRunId: baseline.id,
    status: finalized.status,
    childExitCode: finalized.childExitCode,
  };
}

export async function replayCommand(options: ReplayCommandOptions): Promise<number> {
  const result = await executeReplay(options);

  if (options.json) {
    printJson({ ok: result.status === "replayed", ...result });
  } else if (result.status === "replayed") {
    process.stdout.write(`Replayed run ${result.runId} from ${result.baselineRunId}\n`);
  } else {
    process.stdout.write(`Replay failed; partial cassette kept for run ${result.runId}\n`);
  }

  if (result.childExitCode === 2) return 2;
  if (result.childExitCode !== 0) return result.childExitCode;
  return result.status === "replayed" ? 0 : 1;
}

export function readBaseline(store: string, runId: string): RunRow {
  const cassette = openExistingCassette(store);
  if (cassette === undefined) throw new RunNotFoundError(runId, store);
  try {
    const run = cassette.getRun(runId);
    if (run === undefined) throw new RunNotFoundError(runId, store);
    if (run.mode === "observed") {
      throw new UsageError(
        `Run ${run.id} is an observed Claude Code trace. Observed runs record tool calls only and cannot be replayed, verified, or forked; compare them with \`forkpoint diff\`.`,
      );
    }
    return run;
  } finally {
    cassette.close();
  }
}

function readBaselineModel(store: string, runId: string): string | undefined {
  const cassette = openExistingCassette(store);
  if (cassette === undefined) return undefined;
  try {
    for (const event of cassette.getEventsByType(runId, "llm.request")) {
      if (typeof event.payload !== "object" || event.payload === null) continue;
      const model = (event.payload as Record<string, unknown>).model;
      if (typeof model === "string") return model;
    }
    return undefined;
  } finally {
    cassette.close();
  }
}

export function resolveCommand(
  baseline: RunRow,
  override: string[],
  commandName = "replay",
): { command: string; args: string[] } {
  if (override.length > 0) {
    return { command: override[0]!, args: override.slice(1) };
  }

  const argv = readConfigArgv(baseline.configJson);
  if (argv !== undefined) {
    return { command: argv[0]!, args: argv.slice(1) };
  }

  throw new UsageError(
    `Run ${baseline.id} has no recorded command; pass it after --: forkpoint ${commandName} ${baseline.id} -- <command...>`,
  );
}

function readConfigArgv(configJson: string | undefined): string[] | undefined {
  if (configJson === undefined) return undefined;
  try {
    const config = JSON.parse(configJson) as unknown;
    if (typeof config !== "object" || config === null) return undefined;
    const argv = (config as Record<string, unknown>).argv;
    if (!Array.isArray(argv) || argv.length === 0) return undefined;
    if (!argv.every((value) => typeof value === "string")) return undefined;
    return argv as string[];
  } catch {
    return undefined;
  }
}

interface ParsedReplayArguments {
  runId?: string;
  store?: string;
  json?: boolean;
  debug?: boolean;
  strict?: boolean;
  failOnEnvChange?: boolean;
  command: string[];
}

export function parseReplayArguments(args: string[]): ParsedReplayArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";
  if (args.includes("--allow-live")) {
    throw new UsageError("--allow-live is not available in v0.1; strict replay never calls a model.");
  }

  const separator = args.indexOf("--");
  const optionArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const parsed: ParsedReplayArguments = { command };

  for (let index = 0; index < optionArgs.length; index += 1) {
    const argument = optionArgs[index]!;
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--strict") {
      parsed.strict = true;
      continue;
    }
    if (argument === "--verbose") {
      continue;
    }
    if (argument === "--fail-on-env-change") {
      parsed.failOnEnvChange = true;
      continue;
    }
    if (argument === "--store") {
      const value = optionArgs[index + 1];
      if (value === undefined) throw new UsageError("--store requires a value.");
      parsed.store = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown replay option: ${argument}`);
    }
    if (parsed.runId !== undefined) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }
    parsed.runId = argument;
  }

  return parsed;
}

export function toReplayOptions(
  parsed: ParsedReplayArguments,
  storeFromOption?: string,
): ReplayCommandOptions {
  if (parsed.runId === undefined || parsed.runId.trim() === "") {
    throw new UsageError("replay requires a run id.");
  }

  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
    failOnEnvChange: parsed.failOnEnvChange === true,
    command: parsed.command,
  };
}

export function replayHelp(): string {
  return [
    "Usage: forkpoint replay <run_id> [--store <dir>] [--json] [--strict] [--fail-on-env-change] -- [command...]",
    "",
    "Re-execute the recorded command against the cassette. No model or tool is called live.",
    "",
    "Options:",
    "  --store <dir>    Cassette directory (default: .forkpoint)",
    "  --json           Print the final result as JSON",
    "  --strict         Strict replay (the only mode in v0.1)",
    "  --fail-on-env-change  Fail instead of warning when the whitelisted env changed",
    "  --debug          Print stack traces on failure",
    "",
    "The original command is reused when it was recorded; pass a command after -- to override it.",
  ].join("\n");
}
