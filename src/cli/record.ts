import path from "node:path";
import { collectRunMetadata, formatCommand } from "../core/env.js";
import type { RunStatus } from "../core/events.js";
import { UsageError } from "../core/errors.js";
import { createRunId } from "../core/ulid.js";
import { openCassette } from "../store/cassette.js";
import { finalizeChildRun, spawnChild } from "./child.js";
import { printJson } from "./output.js";

export interface RecordCommandOptions {
  name: string;
  store: string;
  json: boolean;
  debug: boolean;
  command: string;
  args: string[];
}

export interface RecordCommandResult {
  runId: string;
  status: RunStatus;
  childExitCode: number;
}

export async function recordCommand(options: RecordCommandOptions): Promise<number> {
  const store = path.resolve(options.store);
  const commandText = formatCommand(options.command, options.args);
  const runId = createRunId();
  const metadata = collectRunMetadata(commandText);

  const cassette = openCassette(store);
  try {
    cassette.createRun({
      id: runId,
      name: options.name,
      mode: "recorded",
      status: "recording",
      command: commandText,
      cwd: metadata.cwd,
      ...(metadata.gitSha === undefined ? {} : { gitSha: metadata.gitSha }),
      nodeVersion: metadata.nodeVersion,
      platform: metadata.platform,
      config: { argv: [options.command, ...options.args] },
    });
  } finally {
    cassette.close();
  }

  const outcome = await spawnChild({
    command: options.command,
    args: options.args,
    store,
    mode: "record",
    runId,
    commandText,
  });
  const finalized = finalizeChildRun({
    runId,
    store,
    outcome,
    finalStatus: "recorded",
    json: options.json,
    debug: options.debug,
    missingStartMessage:
      "forkpoint: the child process never started a run. Did it call fp.run()?",
    incompleteMessage:
      "forkpoint: the child exited without a complete run; no run.end was recorded.",
  });

  if (options.json) {
    printJson({ ok: finalized.status === "recorded", ...finalized });
  } else {
    if (finalized.status === "recorded") {
      process.stdout.write(`Recorded run ${runId}\n`);
    } else {
      process.stdout.write(`Recording failed; partial cassette kept for run ${runId}\n`);
    }
  }

  if (outcome.error !== undefined) return 2;
  if (outcome.code !== 0) return outcome.code ?? 1;
  return finalized.status === "recorded" ? 0 : 1;
}

interface ParsedRecordArguments {
  name?: string;
  store?: string;
  json?: boolean;
  debug?: boolean;
  command: string[];
}

export function parseRecordArguments(args: string[]): ParsedRecordArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";

  const separator = args.indexOf("--");
  const optionArgs = separator === -1 ? args : args.slice(0, separator);
  const command = separator === -1 ? [] : args.slice(separator + 1);
  const parsed: ParsedRecordArguments = { command };

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
    if (argument === "--verbose") {
      continue;
    }
    if (argument === "--name" || argument === "--store") {
      const value = optionArgs[index + 1];
      if (value === undefined) throw new UsageError(`${argument} requires a value.`);
      if (argument === "--name") parsed.name = value;
      else parsed.store = value;
      index += 1;
      continue;
    }
    if (argument.startsWith("--name=")) {
      parsed.name = argument.slice("--name=".length);
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    throw new UsageError(`Unknown record option: ${argument}`);
  }

  return parsed;
}

export function toRecordOptions(
  parsed: ParsedRecordArguments,
  storeFromOption?: string,
): RecordCommandOptions {
  if (parsed.name === undefined || parsed.name.trim() === "") {
    throw new UsageError("record requires --name <name>.");
  }
  if (parsed.command.length === 0) {
    throw new UsageError("record requires a command after --.");
  }

  const command = parsed.command[0]!;
  return {
    name: parsed.name,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
    command,
    args: parsed.command.slice(1),
  };
}

export function recordHelp(): string {
  return [
    "Usage: forkpoint record --name <name> [--store <dir>] [--json] -- <command...>",
    "",
    "Re-execute an agent command and record its LLM and tool boundaries.",
    "",
    "Options:",
    "  --name <name>    Run name shown by `forkpoint ls` and `show`",
    "  --store <dir>    Cassette directory (default: .forkpoint)",
    "  --json           Print the final result as JSON",
    "  --debug          Print stack traces on failure",
    "",
    "Everything after -- is passed to the child process unchanged.",
  ].join("\n");
}
