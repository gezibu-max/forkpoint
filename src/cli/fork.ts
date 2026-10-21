import { readFileSync } from "node:fs";
import path from "node:path";
import { collectRunMetadata, formatCommand } from "../core/env.js";
import type { RunStatus } from "../core/events.js";
import { UsageError } from "../core/errors.js";
import { createRunId } from "../core/ulid.js";
import {
  hasForkOverrides,
  validateForkOverrides,
  type ForkOverrides,
} from "../sdk/overrides.js";
import { openCassette } from "../store/cassette.js";
import { finalizeChildRun, spawnChild } from "./child.js";
import { printJson } from "./output.js";
import { readBaseline, resolveCommand } from "./replay.js";

export interface ForkCommandOptions {
  runId: string;
  store: string;
  json: boolean;
  debug: boolean;
  name?: string;
  overrides: ForkOverrides;
  command: string[];
}

export interface ForkCommandResult {
  runId: string;
  baselineRunId: string;
  status: RunStatus;
  childExitCode: number;
}

export interface ExecuteForkOptions extends ForkCommandOptions {
  quiet?: boolean;
}

export async function executeFork(options: ExecuteForkOptions): Promise<ForkCommandResult> {
  if (!hasForkOverrides(options.overrides)) {
    throw new UsageError(
      "fork requires at least one override: --model, --temperature, or --system-prompt-file.",
    );
  }

  const store = path.resolve(options.store);
  const baseline = readBaseline(store, options.runId);
  if (baseline.status === "recording") {
    throw new UsageError(`Run ${baseline.id} is still recording; let it finish before forking.`);
  }

  const resolved = resolveCommand(baseline, options.command, "fork");
  const commandText = formatCommand(resolved.command, resolved.args);
  const variantId = createRunId();
  const metadata = collectRunMetadata(commandText);
  const name = options.name?.trim() === "" ? undefined : options.name;

  const cassette = openCassette(store);
  try {
    cassette.createRun({
      id: variantId,
      name: name ?? baseline.name,
      parentRunId: baseline.id,
      mode: "forked",
      status: "recording",
      command: commandText,
      cwd: metadata.cwd,
      ...(metadata.gitSha === undefined ? {} : { gitSha: metadata.gitSha }),
      nodeVersion: metadata.nodeVersion,
      platform: metadata.platform,
      config: {
        forkedFrom: baseline.id,
        overrides: options.overrides,
        argv: [resolved.command, ...resolved.args],
      },
    });
  } finally {
    cassette.close();
  }

  const outcome = await spawnChild({
    command: resolved.command,
    args: resolved.args,
    store,
    mode: "fork",
    runId: variantId,
    baselineRunId: baseline.id,
    commandText,
    quiet: options.quiet === true,
    extraEnv: { FORKPOINT_OVERRIDES: JSON.stringify(options.overrides) },
  });
  const finalized = finalizeChildRun({
    runId: variantId,
    store,
    outcome,
    finalStatus: "forked",
    json: options.json,
    debug: options.debug,
    missingStartMessage:
      "forkpoint: the child process never started a fork. Did it call fp.run()?",
    incompleteMessage:
      "forkpoint: the child exited without a complete fork; no run.end was recorded.",
  });

  return {
    runId: variantId,
    baselineRunId: baseline.id,
    status: finalized.status,
    childExitCode: finalized.childExitCode,
  };
}

export async function forkCommand(options: ForkCommandOptions): Promise<number> {
  const result = await executeFork(options);

  if (options.json) {
    printJson({ ok: result.status === "forked", ...result });
  } else if (result.status === "forked") {
    process.stdout.write(`Forked run ${result.runId} from ${result.baselineRunId}\n`);
  } else {
    process.stdout.write(`Fork failed; partial cassette kept for run ${result.runId}\n`);
  }

  if (result.childExitCode === 2) return 2;
  if (result.childExitCode !== 0) return result.childExitCode;
  return result.status === "forked" ? 0 : 1;
}

interface ParsedForkArguments {
  runId?: string;
  store?: string;
  json?: boolean;
  debug?: boolean;
  name?: string;
  model?: string;
  temperature?: number;
  systemPromptFile?: string;
  command: string[];
}

export function parseForkArguments(args: string[]): ParsedForkArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";

  const separator = args.indexOf("--");
  const optionArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const parsed: ParsedForkArguments = { command };

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
    if (argument === "--store") {
      parsed.store = requireValue(optionArgs, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument === "--name") {
      parsed.name = requireValue(optionArgs, index, "--name");
      index += 1;
      continue;
    }
    if (argument.startsWith("--name=")) {
      parsed.name = argument.slice("--name=".length);
      continue;
    }
    if (argument === "--model") {
      parsed.model = requireValue(optionArgs, index, "--model");
      index += 1;
      continue;
    }
    if (argument.startsWith("--model=")) {
      parsed.model = argument.slice("--model=".length);
      continue;
    }
    if (argument === "--temperature") {
      parsed.temperature = parseTemperature(requireValue(optionArgs, index, "--temperature"));
      index += 1;
      continue;
    }
    if (argument.startsWith("--temperature=")) {
      parsed.temperature = parseTemperature(argument.slice("--temperature=".length));
      continue;
    }
    if (argument === "--system-prompt-file") {
      parsed.systemPromptFile = requireValue(optionArgs, index, "--system-prompt-file");
      index += 1;
      continue;
    }
    if (argument.startsWith("--system-prompt-file=")) {
      parsed.systemPromptFile = argument.slice("--system-prompt-file=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown fork option: ${argument}`);
    }
    if (parsed.runId !== undefined) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }
    parsed.runId = argument;
  }

  return parsed;
}

export function toForkOptions(
  parsed: ParsedForkArguments,
  storeFromOption?: string,
): ForkCommandOptions {
  if (parsed.runId === undefined || parsed.runId.trim() === "") {
    throw new UsageError("fork requires a run id.");
  }

  const overrides = validateForkOverrides({
    ...(parsed.model === undefined ? {} : { model: parsed.model }),
    ...(parsed.temperature === undefined ? {} : { temperature: parsed.temperature }),
    ...(parsed.systemPromptFile === undefined
      ? {}
      : { systemPrompt: readSystemPrompt(parsed.systemPromptFile) }),
  });
  if (!hasForkOverrides(overrides)) {
    throw new UsageError(
      "fork requires at least one override: --model, --temperature, or --system-prompt-file.",
    );
  }

  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
    ...(parsed.name === undefined ? {} : { name: parsed.name }),
    overrides,
    command: parsed.command,
  };
}

export function forkHelp(): string {
  return [
    "Usage: forkpoint fork <run_id> [--model <name>] [--temperature <n>] [--system-prompt-file <path>]",
    "                      [--name <name>] [--store <dir>] [--json] -- [command...]",
    "",
    "Re-execute the run with live model calls. Tool calls are served from the baseline",
    "cassette and never executed, so a fork isolates how the model responds to a change.",
    "",
    "Options:",
    "  --model <name>             Override the model on every LLM call",
    "  --temperature <n>          Override the sampling temperature (0..2)",
    "  --system-prompt-file <p>   Replace the system prompt on every LLM call",
    "  --name <name>              Name the forked run",
    "  --store <dir>              Cassette directory (default: .forkpoint)",
    "  --json                     Print the final result as JSON",
    "  --debug                    Print stack traces on failure",
    "",
    "At least one override is required. The original command is reused unless one is passed after --.",
  ].join("\n");
}

function requireValue(args: string[], index: number, option: string): string {
  const value = args[index + 1];
  if (value === undefined) throw new UsageError(`${option} requires a value.`);
  return value;
}

function parseTemperature(raw: string): number {
  if (raw.trim() === "") {
    throw new UsageError("--temperature must be a number between 0 and 2.");
  }
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new UsageError("--temperature must be a number between 0 and 2.");
  }
  return value;
}

function readSystemPrompt(file: string): string {
  try {
    return readFileSync(path.resolve(file), "utf8");
  } catch (error) {
    throw new UsageError(
      `Cannot read --system-prompt-file ${file}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
