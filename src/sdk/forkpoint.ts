import path from "node:path";
import { captureCallsite } from "../core/callsite.js";
import { elapsedMs, monotonicNow } from "../core/clock.js";
import {
  captureEnvironment,
  collectRunMetadata,
  DEFAULT_ENV_WHITELIST,
  formatCommand,
  resolveMode,
} from "../core/env.js";
import type { Mode } from "../core/events.js";
import {
  EnvChangedError,
  errorSummary,
  LiveCallBlockedError,
  NestedRunError,
  NotImplementedError,
  RunExistsError,
  RunNotFoundError,
  UsageError,
} from "../core/errors.js";
import { isRunId, createRunId } from "../core/ulid.js";
import { openCassette, type Cassette } from "../store/cassette.js";
import { installClockBoundary } from "./clock-boundary.js";
import {
  armInstance,
  currentRun,
  disarmInstance,
  runWithContext,
  type RunContext,
} from "./context.js";
import { wrapOpenAI } from "./llm.js";
import { installRngBoundary } from "./rng-boundary.js";

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface PricingEntry {
  inputPer1M?: number;
  outputPer1M?: number;
  [key: string]: unknown;
}

export type PricingTable = Record<string, PricingEntry>;

export interface ForkpointOptions {
  store?: string;
  mode?: Mode;
  baselineRunId?: string;
  runId?: string;
  redact?: RedactionRule[];
  envWhitelist?: string[];
  pricing?: PricingTable;
  failOnEnvChange?: boolean;
}

export class Forkpoint {
  readonly mode: Mode;
  readonly storeDir: string;
  readonly baselineRunId?: string;
  readonly runId?: string;
  readonly envWhitelist: string[];
  readonly redact: RedactionRule[];
  readonly pricing: PricingTable;
  readonly failOnEnvChange: boolean;

  constructor(options: ForkpointOptions = {}) {
    this.mode = resolveMode(options.mode);
    this.storeDir = path.resolve(options.store ?? process.env.FORKPOINT_STORE ?? ".forkpoint");
    this.baselineRunId = options.baselineRunId;
    this.runId = options.runId;
    this.envWhitelist = [...(options.envWhitelist ?? DEFAULT_ENV_WHITELIST)];
    this.redact = [...(options.redact ?? [])];
    this.pricing = { ...(options.pricing ?? {}) };
    this.failOnEnvChange =
      options.failOnEnvChange ?? process.env.FORKPOINT_FAIL_ON_ENV_CHANGE === "1";

    if (this.mode !== "off") armInstance(this);
  }

  wrapOpenAI<T extends object>(client: T): T {
    if (this.mode === "off") return client;
    return wrapOpenAI(client);
  }

  async run<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    if (name.trim() === "") throw new UsageError("Run name must not be empty.");
    if (currentRun() !== undefined) throw new NestedRunError();
    if (typeof fn !== "function") throw new UsageError("fp.run() expects a function.");
    if (this.mode === "off") return await fn();
    if (this.mode === "record") return this.runRecord(name, fn);
    if (this.mode === "replay") return this.runReplay(name, fn);
    throw new NotImplementedError(`Mode "${this.mode}"`);
  }

  dispose(): void {
    disarmInstance(this);
  }

  private async runRecord<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const cassette = openCassette(this.storeDir);
    try {
      const runId = resolveRunId();
      const command =
        process.env.FORKPOINT_COMMAND ??
        formatCommand(process.argv[0] ?? "node", process.argv.slice(1));
      const metadata = collectRunMetadata(command);
      const environment = captureEnvironment(this.envWhitelist);

      const existing = cassette.getRun(runId);
      if (existing === undefined) {
        cassette.createRun({
          id: runId,
          name,
          mode: "recorded",
          status: "recording",
          command: metadata.command,
          cwd: metadata.cwd,
          ...(metadata.gitSha === undefined ? {} : { gitSha: metadata.gitSha }),
          nodeVersion: metadata.nodeVersion,
          platform: metadata.platform,
          config: {
            argv: process.argv,
            envWhitelist: this.envWhitelist,
            redactionRules: this.redact.map((rule) => rule.name),
            ...(metadata.lockfileHash === undefined ? {} : { lockfileHash: metadata.lockfileHash }),
          },
          env: environment.env,
        });
      } else {
        if (existing.status !== "recording") throw new RunExistsError(runId);
        cassette.updateRunEnvironment(runId, environment.env);
      }

      const effectiveName = existing?.name ?? name;
      cassette.appendEvent(runId, {
        type: "run.start",
        payload: { name: effectiveName, mode: "record" },
      });
      cassette.appendEvent(runId, {
        type: "env.snapshot",
        payload: {
          env: environment.env,
          ...(environment.lockfileHash === undefined
            ? {}
            : { lockfileHash: environment.lockfileHash }),
        },
      });

      const startedAt = monotonicNow();
      const context: RunContext = {
        runId,
        name: effectiveName,
        mode: "record",
        cassette,
        occurrences: new Map(),
        counters: { llmCalls: 0, toolCalls: 0 },
      };

      return await runWithContext(context, async () => {
        const restoreClock = installClockBoundary(context);
        const restoreRng = installRngBoundary(context);
        try {
          const result = await fn();
          const durationMs = elapsedMs(startedAt);
          cassette.appendEvent(runId, {
            type: "run.end",
            payload: { status: "ok" },
            durationMs,
          });
          cassette.flush();
          cassette.updateRunStatus(runId, "recorded", buildMetrics(cassette, runId, context, durationMs));
          return result;
        } catch (error) {
          const durationMs = elapsedMs(startedAt);
          const summary = errorSummary(error);
          try {
            cassette.appendEvent(runId, {
              type: "run.end",
              payload: { status: "failed", error: `${summary.name}: ${summary.message}` },
              durationMs,
            });
            cassette.flush();
            cassette.updateRunStatus(runId, "failed", buildMetrics(cassette, runId, context, durationMs));
          } catch {
            // Preserve the error that failed the run.
          }
          throw error;
        } finally {
          restoreRng();
          restoreClock();
        }
      });
    } finally {
      cassette.close();
    }
  }

  private async runReplay<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const baselineRunId = this.baselineRunId ?? process.env.FORKPOINT_BASELINE_RUN_ID;
    if (baselineRunId === undefined || baselineRunId === "") {
      throw new UsageError(
        "Replay requires a baseline run id. Use `forkpoint replay <run_id>` or set FORKPOINT_BASELINE_RUN_ID.",
      );
    }
    if (!isRunId(baselineRunId)) {
      throw new UsageError(`Not a valid Forkpoint run id: ${baselineRunId}`);
    }

    const cassette = openCassette(this.storeDir);
    try {
      const baseline = cassette.getRun(baselineRunId);
      if (baseline === undefined) throw new RunNotFoundError(baselineRunId, this.storeDir);

      const runId = this.runId ?? process.env.FORKPOINT_RUN_ID ?? createRunId();
      if (!isRunId(runId)) throw new UsageError(`Not a valid Forkpoint run id: ${runId}`);
      if (runId === baseline.id) {
        throw new UsageError("Replay needs a new run id; refusing to overwrite the baseline run.");
      }

      const effectiveName = baseline.name;
      const command =
        process.env.FORKPOINT_COMMAND ??
        baseline.command ??
        formatCommand(process.argv[0] ?? "node", process.argv.slice(1));
      const metadata = collectRunMetadata(command);
      const environment = captureEnvironment(this.envWhitelist);

      const existing = cassette.getRun(runId);
      if (existing === undefined) {
        cassette.createRun({
          id: runId,
          name: effectiveName,
          parentRunId: baseline.id,
          mode: "replayed",
          status: "recording",
          command: metadata.command,
          cwd: metadata.cwd,
          ...(metadata.gitSha === undefined ? {} : { gitSha: metadata.gitSha }),
          nodeVersion: metadata.nodeVersion,
          platform: metadata.platform,
          config: {
            argv: process.argv,
            replayedFrom: baseline.id,
            envWhitelist: this.envWhitelist,
            redactionRules: this.redact.map((rule) => rule.name),
            ...(metadata.lockfileHash === undefined ? {} : { lockfileHash: metadata.lockfileHash }),
          },
          env: environment.env,
        });
      } else {
        if (existing.status !== "recording" || existing.mode !== "replayed") {
          throw new RunExistsError(runId);
        }
        cassette.updateRunEnvironment(runId, environment.env);
      }

      cassette.appendEvent(runId, {
        type: "run.start",
        payload: { name: effectiveName, mode: "replay", parentRunId: baseline.id },
      });
      cassette.appendEvent(runId, {
        type: "env.snapshot",
        payload: {
          env: environment.env,
          ...(environment.lockfileHash === undefined
            ? {}
            : { lockfileHash: environment.lockfileHash }),
        },
      });

      const changed = environmentChanges(baseline.envJson, environment.env);
      const startedAt = monotonicNow();
      const context: RunContext = {
        runId,
        baselineRunId: baseline.id,
        name: effectiveName,
        mode: "replay",
        cassette,
        occurrences: new Map(),
        counters: { llmCalls: 0, toolCalls: 0 },
      };

      const restoreFetch = installLiveGuard();
      try {
        return await runWithContext(context, async () => {
          const restoreClock = installClockBoundary(context);
          const restoreRng = installRngBoundary(context);
          try {
            if (changed.length > 0) {
              if (this.failOnEnvChange) {
                throw new EnvChangedError(changed, { runId, callsite: captureCallsite() });
              }
              cassette.appendEvent(runId, {
                type: "replay.warning",
                payload: {
                  code: "ENV_CHANGED",
                  message: `Environment changed since recording: ${changed.join(", ")}.`,
                },
                callsite: captureCallsite(),
              });
            }
            const result = await fn();
            const durationMs = elapsedMs(startedAt);
            cassette.appendEvent(runId, {
              type: "run.end",
              payload: { status: "ok" },
              durationMs,
            });
            cassette.flush();
            cassette.updateRunStatus(runId, "replayed", buildMetrics(cassette, runId, context, durationMs));
            return result;
          } catch (error) {
            const durationMs = elapsedMs(startedAt);
            const summary = errorSummary(error);
            try {
              cassette.appendEvent(runId, {
                type: "run.end",
                payload: { status: "failed", error: `${summary.name}: ${summary.message}` },
                durationMs,
              });
              cassette.flush();
              cassette.updateRunStatus(runId, "failed", buildMetrics(cassette, runId, context, durationMs));
            } catch {
              // Preserve the error that failed the replay.
            }
            throw error;
          } finally {
            restoreRng();
            restoreClock();
          }
        });
      } finally {
        restoreFetch();
      }
    } finally {
      cassette.close();
    }
  }
}

function resolveRunId(): string {
  const fromEnvironment = process.env.FORKPOINT_RUN_ID;
  if (fromEnvironment === undefined || fromEnvironment === "") return createRunId();
  if (!isRunId(fromEnvironment)) {
    throw new UsageError(`FORKPOINT_RUN_ID is not a valid Forkpoint run id: ${fromEnvironment}`);
  }
  return fromEnvironment;
}

function buildMetrics(
  cassette: Cassette,
  runId: string,
  context: RunContext,
  durationMs: number,
): Record<string, number> {
  return {
    durationMs,
    events: cassette.countEvents(runId),
    llmCalls: context.counters.llmCalls,
    toolCalls: context.counters.toolCalls,
  };
}

function environmentChanges(
  baselineEnvJson: string | undefined,
  current: Record<string, string>,
): string[] {
  if (baselineEnvJson === undefined) return [];
  let baseline: unknown;
  try {
    baseline = JSON.parse(baselineEnvJson);
  } catch {
    return [];
  }
  if (typeof baseline !== "object" || baseline === null) return [];

  const recorded = baseline as Record<string, unknown>;
  const changed: string[] = [];
  for (const key of new Set([...Object.keys(recorded), ...Object.keys(current)])) {
    if (recorded[key] !== current[key]) changed.push(key);
  }
  return changed.sort();
}

function cassetteContext(
  cassette: Cassette,
  runId: string,
  baselineRunId: string,
  name: string,
): RunContext {
  return {
    runId,
    baselineRunId,
    name,
    mode: "replay",
    cassette,
    occurrences: new Map(),
    counters: { llmCalls: 0, toolCalls: 0 },
  };
}

function installLiveGuard(): () => void {
  const originalFetch = globalThis.fetch;
  const guardedFetch = ((input: unknown) => {
    throw new LiveCallBlockedError(requestTarget(input), captureCallsite());
  }) as unknown as typeof fetch;

  globalThis.fetch = guardedFetch;
  return () => {
    if (globalThis.fetch === guardedFetch) globalThis.fetch = originalFetch;
  };
}

function requestTarget(input: unknown): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  if (typeof input === "object" && input !== null) {
    const url = (input as { url?: unknown }).url;
    if (typeof url === "string") return url;
  }
  return String(input);
}
