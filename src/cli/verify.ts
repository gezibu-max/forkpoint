import {
  firstEventDifference,
  hashEvents,
  type EventDifference,
} from "../core/event-hash.js";
import type { EventRecord } from "../core/events.js";
import { UsageError } from "../core/errors.js";
import { openExistingCassette } from "../store/cassette.js";
import { printJson } from "./output.js";
import { executeReplay, type ReplayCommandResult } from "./replay.js";

const REPLAY_COUNT = 2;
const CONSUMED_TYPES = new Set(["llm.response", "llm.error", "tool.result", "tool.error"]);

export interface VerifyCommandOptions {
  runId: string;
  store: string;
  json: boolean;
  debug: boolean;
}

export async function verifyCommand(options: VerifyCommandOptions): Promise<number> {
  const executions: ReplayCommandResult[] = [];

  for (let index = 0; index < REPLAY_COUNT; index += 1) {
    const execution = await executeReplay({
      runId: options.runId,
      store: options.store,
      json: false,
      debug: options.debug,
      failOnEnvChange: false,
      command: [],
      quiet: true,
    });
    executions.push(execution);
    if (execution.status !== "replayed") {
      return reportReplayFailure(options, executions, execution);
    }
  }

  const first = executions[0]!;
  const second = executions[1]!;
  const baselineData = readRun(options.store, first.baselineRunId, true);
  const firstData = readRun(options.store, first.runId, false);
  const secondData = readRun(options.store, second.runId, false);
  if (firstData === undefined || secondData === undefined) {
    throw new Error("The cassette disappeared while verifying; re-run the command.");
  }

  const firstReport = hashEvents(firstData.events);
  const secondReport = hashEvents(secondData.events);
  const difference =
    firstEventDifference(firstData.events, secondData.events) ??
    (firstReport.hash === secondReport.hash
      ? undefined
      : {
          seq: Math.min(firstData.events.length, secondData.events.length),
          reason: "content" as const,
          expected: { type: "sequence", hash: firstReport.hash },
          actual: { type: "sequence", hash: secondReport.hash },
        });
  const ok = difference === undefined;
  const unconsumed = Math.max(
    0,
    (baselineData?.fixtureCount ?? 0) - countConsumed(firstData.events),
  );

  if (options.json) {
    printJson({
      ok,
      baselineRunId: first.baselineRunId,
      deterministic: ok,
      eventCount: firstReport.eventCount,
      hash: firstReport.hash,
      replays: executions.map((execution) => ({
        runId: execution.runId,
        status: execution.status,
      })),
      ...(difference === undefined ? {} : { difference }),
      ...(unconsumed === 0 ? {} : { unconsumedFixtures: unconsumed }),
    });
  } else if (ok) {
    process.stdout.write(
      `Deterministic: ${firstReport.eventCount} events across ${REPLAY_COUNT} replays (${firstReport.hash.slice(0, 12)})\n`,
    );
    if (unconsumed > 0) {
      process.stdout.write(`Warning: ${unconsumed} baseline fixture(s) were not consumed.\n`);
    }
  } else {
    process.stdout.write(
      `Not deterministic: first difference at seq ${difference.seq} (${difference.reason})\n`,
    );
    process.stdout.write(`  expected: ${describeSide(difference.expected)}\n`);
    process.stdout.write(`  actual:   ${describeSide(difference.actual)}\n`);
  }

  return ok ? 0 : 1;
}

function reportReplayFailure(
  options: VerifyCommandOptions,
  executions: ReplayCommandResult[],
  failed: ReplayCommandResult,
): number {
  if (options.json) {
    printJson({
      ok: false,
      baselineRunId: failed.baselineRunId,
      deterministic: false,
      replays: executions.map((execution) => ({
        runId: execution.runId,
        status: execution.status,
      })),
      error: `replay ${String(executions.length)} ended with status ${failed.status}`,
    });
  } else {
    process.stdout.write(
      `Verify failed: replay ${String(executions.length)} ended with status ${failed.status} (run ${failed.runId}).\n`,
    );
    process.stdout.write(`Inspect it with: forkpoint show ${failed.runId} --events\n`);
  }
  return 1;
}

function readRun(
  store: string,
  runId: string,
  includeFixtures: boolean,
): { events: EventRecord[]; fixtureCount?: number } | undefined {
  const cassette = openExistingCassette(store);
  if (cassette === undefined) return undefined;
  try {
    return {
      events: cassette.getEvents(runId),
      ...(includeFixtures ? { fixtureCount: cassette.countFixtures(runId) } : {}),
    };
  } finally {
    cassette.close();
  }
}

function countConsumed(events: EventRecord[]): number {
  return events.filter((event) => CONSUMED_TYPES.has(event.type)).length;
}

function describeSide(side: EventDifference["expected"]): string {
  if (side === undefined) return "(none)";
  return `${side.type} ${side.hash.slice(0, 12)}`;
}

interface ParsedVerifyArguments {
  runId?: string;
  store?: string;
  json?: boolean;
  debug?: boolean;
}

export function parseVerifyArguments(args: string[]): ParsedVerifyArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";

  const parsed: ParsedVerifyArguments = {};
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--store") {
      const value = args[index + 1];
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
      throw new UsageError(`Unknown verify option: ${argument}`);
    }
    if (parsed.runId !== undefined) {
      throw new UsageError(`Unexpected argument: ${argument}`);
    }
    parsed.runId = argument;
  }

  return parsed;
}

export function toVerifyOptions(
  parsed: ParsedVerifyArguments,
  storeFromOption?: string,
): VerifyCommandOptions {
  if (parsed.runId === undefined || parsed.runId.trim() === "") {
    throw new UsageError("verify requires a run id.");
  }

  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    json: parsed.json === true,
    debug: parsed.debug === true,
  };
}

export function verifyHelp(): string {
  return [
    "Usage: forkpoint verify <run_id> [--store <dir>] [--json] [--debug]",
    "",
    "Replay a recorded run twice in isolated variant runs and compare stable event hashes.",
    "Timestamps and durations are excluded. The command fails on the first differing event.",
    "",
    "Options:",
    "  --store <dir>    Cassette directory (default: .forkpoint)",
    "  --json           Print the report as JSON",
    "  --debug          Print stack traces on failure",
  ].join("\n");
}
