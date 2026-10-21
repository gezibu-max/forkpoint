import spawn from "cross-spawn";
import type { RunStatus } from "../core/events.js";
import { openExistingCassette } from "../store/cassette.js";
import { printError } from "./output.js";

export interface ChildOutcome {
  code: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

export interface SpawnSpec {
  command: string;
  args: string[];
  store: string;
  mode: "record" | "replay" | "fork";
  runId: string;
  commandText: string;
  baselineRunId?: string;
  extraEnv?: Record<string, string>;
  quiet?: boolean;
}

export function spawnChild(spec: SpawnSpec): Promise<ChildOutcome> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: ChildOutcome): void => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const child = spawn(spec.command, spec.args, {
      stdio: spec.quiet === true ? "ignore" : "inherit",
      cwd: process.cwd(),
      env: {
        ...process.env,
        FORKPOINT_MODE: spec.mode,
        FORKPOINT_RUN_ID: spec.runId,
        FORKPOINT_STORE: spec.store,
        FORKPOINT_COMMAND: spec.commandText,
        ...(spec.baselineRunId === undefined
          ? {}
          : { FORKPOINT_BASELINE_RUN_ID: spec.baselineRunId }),
        ...spec.extraEnv,
      },
    });

    child.once("error", (error) => {
      settle({ code: null, signal: null, error });
    });
    child.once("exit", (code, signal) => {
      settle({ code, signal });
    });
  });
}

export interface FinalizeOptions {
  runId: string;
  store: string;
  outcome: ChildOutcome;
  finalStatus: "recorded" | "replayed" | "forked";
  json: boolean;
  debug: boolean;
  missingStartMessage: string;
  incompleteMessage: string;
}

export interface FinalizeResult {
  runId: string;
  status: RunStatus;
  childExitCode: number;
}

export function finalizeChildRun(options: FinalizeOptions): FinalizeResult {
  const cassette = openExistingCassette(options.store);
  if (cassette === undefined) {
    printError(new Error(`cassette disappeared from ${options.store}`), options);
    return {
      runId: options.runId,
      status: "failed",
      childExitCode: options.outcome.error === undefined ? options.outcome.code ?? 1 : 2,
    };
  }

  try {
    const run = cassette.getRun(options.runId);
    if (run === undefined) {
      printError(new Error(`run row ${options.runId} disappeared`), options);
      return {
        runId: options.runId,
        status: "failed",
        childExitCode: options.outcome.error === undefined ? options.outcome.code ?? 1 : 2,
      };
    }

    if (run.status === "recording" || run.status === options.finalStatus) {
      const failed =
        options.outcome.error !== undefined ||
        options.outcome.signal !== null ||
        options.outcome.code !== 0;
      const hasStart = cassette.hasEventType(options.runId, "run.start");
      const hasEnd = cassette.hasEventType(options.runId, "run.end");

      if (!hasStart) {
        process.stderr.write(`${options.missingStartMessage}\n`);
      }

      if (failed) {
        if (hasStart && !hasEnd) {
          cassette.appendEvent(options.runId, {
            type: "run.end",
            payload: {
              status: "failed",
              error:
                options.outcome.error?.message ??
                (options.outcome.signal === null
                  ? `child exited with code ${String(options.outcome.code)} before completing the run`
                  : `child terminated by ${options.outcome.signal}`),
            },
          });
        }
        cassette.flush();
        cassette.updateRunStatus(options.runId, "failed");
      } else if (!hasStart || !hasEnd) {
        process.stderr.write(`${options.incompleteMessage}\n`);
        cassette.flush();
        cassette.updateRunStatus(options.runId, "failed");
      } else {
        cassette.flush();
        const current = cassette.getRun(options.runId);
        if (current?.status === "recording") {
          cassette.updateRunStatus(options.runId, options.finalStatus);
        }
      }
    }

    const finalRun = cassette.getRun(options.runId);
    return {
      runId: options.runId,
      status: finalRun?.status ?? "failed",
      childExitCode: options.outcome.error === undefined ? options.outcome.code ?? 1 : 2,
    };
  } finally {
    cassette.close();
  }
}
