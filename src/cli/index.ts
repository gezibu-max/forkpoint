#!/usr/bin/env node
import { Command, CommanderError } from "commander";
import { VERSION } from "../core/version.js";
import { RunNotFoundError, UsageError } from "../core/errors.js";
import type { EventRecord } from "../core/events.js";
import { openExistingCassette } from "../store/cassette.js";
import type { RunRow } from "../store/cassette.js";
import { formatRunTable, printError, printJson, truncate } from "./output.js";
import {
  parseRecordArguments,
  recordCommand,
  recordHelp,
  toRecordOptions,
} from "./record.js";
import {
  parseReplayArguments,
  replayCommand,
  replayHelp,
  toReplayOptions,
} from "./replay.js";
import {
  parseVerifyArguments,
  toVerifyOptions,
  verifyCommand,
  verifyHelp,
} from "./verify.js";
import {
  diffCommand,
  diffHelp,
  parseDiffArguments,
  toDiffOptions,
} from "./diff.js";

interface CommonOptions {
  store?: string;
  json?: boolean;
  verbose?: boolean;
  debug?: boolean;
}

interface ShowOptions extends CommonOptions {
  events?: boolean;
}

const argv = process.argv.slice(2);

if (argv[0] === "record") {
  await runRecord(argv.slice(1));
} else if (argv[0] === "replay") {
  await runReplay(argv.slice(1));
} else if (argv[0] === "verify") {
  await runVerify(argv.slice(1));
} else if (argv[0] === "diff") {
  await runDiff(argv.slice(1));
} else if (argv.length === 0) {
  buildProgram().outputHelp();
} else {
  await runProgram(argv);
}

async function runRecord(args: string[]): Promise<void> {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseRecordArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${recordHelp()}\n`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await recordCommand(toRecordOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}

async function runReplay(args: string[]): Promise<void> {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseReplayArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${replayHelp()}\n`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await replayCommand(toReplayOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}

async function runVerify(args: string[]): Promise<void> {
  const wantsJson = args.includes("--json");
  try {
    const parsed = parseVerifyArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${verifyHelp()}\n`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await verifyCommand(toVerifyOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}

async function runDiff(args: string[]): Promise<void> {
  const formatIndex = args.indexOf("--format");
  const wantsJson =
    args.includes("--json") ||
    args.includes("--format=json") ||
    (formatIndex !== -1 && args[formatIndex + 1] === "json");
  try {
    const parsed = parseDiffArguments(args);
    if (parsed === "help") {
      process.stdout.write(`${diffHelp()}\n`);
      process.exitCode = 0;
      return;
    }
    process.exitCode = await diffCommand(toDiffOptions(parsed));
  } catch (error) {
    process.exitCode = printError(error, { json: wantsJson, debug: args.includes("--debug") });
  }
}

function buildProgram(): Command {
  const program = new Command();
  program
    .name("forkpoint")
    .description("Record once. Replay deterministically. Find the fork.")
    .version(VERSION, "-v, --version")
    .option("--store <dir>", "cassette directory", ".forkpoint")
    .option("--json", "machine-readable output")
    .option("--verbose", "verbose output")
    .option("--debug", "print stack traces")
    .showHelpAfterError()
    .exitOverride();

  program
    .command("record")
    .description("Record an agent run by re-executing a command")
    .option("--name <name>", "run name")
    .option("--store <dir>", "cassette directory")
    .option("--json", "machine-readable output")
    .option("--debug", "print stack traces")
    .allowUnknownOption(true)
    .action(() => {
      throw new UsageError(
        "record must be the first argument: forkpoint record --name <name> -- <command...>",
      );
    });

  program
    .command("replay")
    .description("Replay a recorded run against the cassette")
    .allowUnknownOption(true)
    .action(() => {
      throw new UsageError(
        "replay must be the first argument: forkpoint replay <run_id> [-- <command...>]",
      );
    });

  program
    .command("verify")
    .description("Replay a run twice and compare stable event hashes")
    .allowUnknownOption(true)
    .action(() => {
      throw new UsageError(
        "verify must be the first argument: forkpoint verify <run_id>",
      );
    });

  program
    .command("diff")
    .description("Compare two runs and locate the first divergence")
    .allowUnknownOption(true)
    .action(() => {
      throw new UsageError(
        "diff must be the first argument: forkpoint diff <base> <variant>",
      );
    });

  program
    .command("ls")
    .description("List recorded runs")
    .option("--limit <count>", "maximum number of runs", "20")
    .option("--store <dir>", "cassette directory")
    .option("--json", "machine-readable output")
    .option("--debug", "print stack traces")
    .action((options: { limit: string; store?: string; json?: boolean; debug?: boolean }, command: Command) => {
      const merged = mergeOptions(command);
      const limit = Number(options.limit);
      if (!Number.isInteger(limit) || limit < 1) {
        throw new UsageError("--limit must be a positive integer.");
      }
      const cassette = openExistingCassette(merged.store);
      if (cassette === undefined) {
        if (merged.json) printJson({ runs: [] });
        else process.stdout.write("No runs.\n");
        return;
      }
      try {
        const runs = cassette.listRuns(limit);
        if (merged.json) {
          printJson({ runs });
        } else {
          process.stdout.write(`${formatRunTable(runs)}\n`);
        }
      } finally {
        cassette.close();
      }
    });

  program
    .command("show")
    .description("Show a recorded run")
    .argument("<runId>", "run id")
    .option("--events", "include the event list")
    .option("--store <dir>", "cassette directory")
    .option("--json", "machine-readable output")
    .option("--debug", "print stack traces")
    .action((runId: string, options: ShowOptions, command: Command) => {
      const merged = mergeOptions(command);
      const cassette = openExistingCassette(merged.store);
      if (cassette === undefined) throw new RunNotFoundError(runId, merged.store);

      try {
        const run = cassette.getRun(runId);
        if (run === undefined) throw new RunNotFoundError(runId, merged.store);
        const events = options.events === true ? cassette.getEvents(runId) : undefined;

        if (merged.json) {
          printJson(events === undefined ? { run } : { run, events });
        } else {
          showRun(run, events);
        }
      } finally {
        cassette.close();
      }
    });

  return program;
}

async function runProgram(args: string[]): Promise<void> {
  const program = buildProgram();
  try {
    await program.parseAsync(["node", "forkpoint", ...args]);
  } catch (error) {
    if (error instanceof CommanderError) {
      process.exitCode = error.exitCode === 0 ? 0 : 2;
      return;
    }
    process.exitCode = printError(error, {
      json: args.includes("--json"),
      debug: args.includes("--debug"),
    });
  }
}

function mergeOptions(command: Command): Required<Pick<CommonOptions, "store">> & CommonOptions {
  const local = command.opts<CommonOptions>();
  const global = command.parent?.opts<CommonOptions>() ?? {};
  return {
    store: local.store ?? global.store ?? ".forkpoint",
    json: local.json ?? global.json,
    verbose: local.verbose ?? global.verbose,
    debug: local.debug ?? global.debug,
  };
}

function showRun(run: RunRow, events: EventRecord[] | undefined): void {
  const lines = [
    `Run ${run.id}`,
    `  name:      ${run.name}`,
    `  status:    ${run.status}`,
    `  mode:      ${run.mode}`,
    `  created:   ${run.createdAt}`,
  ];
  if (run.command !== undefined) lines.push(`  command:   ${run.command}`);
  if (run.cwd !== undefined) lines.push(`  cwd:       ${run.cwd}`);
  if (run.gitSha !== undefined) lines.push(`  git:       ${run.gitSha}`);
  if (run.nodeVersion !== undefined) lines.push(`  node:      ${run.nodeVersion}`);
  if (run.platform !== undefined) lines.push(`  platform:  ${run.platform}`);
  if (run.parentRunId !== undefined) lines.push(`  parent:    ${run.parentRunId}`);
  if (run.metricsJson !== undefined) lines.push(`  metrics:   ${run.metricsJson}`);
  if (run.envJson !== undefined) lines.push(`  env:       ${run.envJson}`);

  process.stdout.write(`${lines.join("\n")}\n`);

  if (events === undefined) return;
  process.stdout.write(`\nEvents (${events.length}):\n`);
  if (events.length === 0) {
    process.stdout.write("  (none)\n");
    return;
  }

  const header = "SEQ   TYPE                 CALLSITE                                      DURATION";
  process.stdout.write(`  ${header}\n`);
  for (const event of events) {
    const duration = event.durationMs === undefined ? "" : `${event.durationMs.toFixed(1)}ms`;
    process.stdout.write(
      `  ${String(event.seq).padEnd(5)} ${event.type.padEnd(20)} ${truncate(
        event.callsite ?? "-",
        44,
      ).padEnd(44)} ${duration}\n`,
    );
  }
}
