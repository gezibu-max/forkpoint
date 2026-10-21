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
import {
  readStoredRedactionRules,
  serializeRedactionRules,
  type RedactionRule,
  type StoredRedactionRule,
} from "../core/redact.js";
import { isRunId, createRunId } from "../core/ulid.js";
import { openCassette, type Cassette, type RunRow } from "../store/cassette.js";
import { installClockBoundary } from "./clock-boundary.js";
import {
  armInstance,
  currentRun,
  disarmInstance,
  runWithContext,
  type RunContext,
} from "./context.js";
import { wrapOpenAI } from "./llm.js";
import {
  hasForkOverrides,
  parseForkOverrides,
  validateForkOverrides,
  type ForkOverrides,
} from "./overrides.js";
import { installRngBoundary } from "./rng-boundary.js";

export type { RedactionRule };

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
  overrides?: ForkOverrides;
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
  readonly overrides: ForkOverrides;

  constructor(options: ForkpointOptions = {}) {
    this.mode = resolveMode(options.mode);
    this.storeDir = path.resolve(options.store ?? process.env.FORKPOINT_STORE ?? ".forkpoint");
    this.baselineRunId = options.baselineRunId;
    this.runId = options.runId;
    this.envWhitelist = [...(options.envWhitelist ?? DEFAULT_ENV_WHITELIST)];
    this.redact = [...(options.redact ?? [])];
    serializeRedactionRules(this.redact);
    this.pricing = { ...(options.pricing ?? {}) };
    this.failOnEnvChange =
      options.failOnEnvChange ?? process.env.FORKPOINT_FAIL_ON_ENV_CHANGE === "1";
    this.overrides =
      options.overrides !== undefined
        ? validateForkOverrides(options.overrides)
        : this.mode === "fork"
          ? parseForkOverrides(process.env.FORKPOINT_OVERRIDES)
          : {};

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
    if (this.mode === "replay") return this.runVariant("replay", name, fn);
    if (this.mode === "fork") return this.runVariant("fork", name, fn);
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
      const redactionRules = serializeRedactionRules(this.redact);

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
            redactionRules: redactionRules.map((rule) => rule.name),
            ...(redactionRules.length === 0 ? {} : { redactionPatterns: redactionRules }),
            ...(metadata.lockfileHash === undefined ? {} : { lockfileHash: metadata.lockfileHash }),
          },
          env: environment.env,
        });
      } else {
        if (existing.status !== "recording") throw new RunExistsError(runId);
        cassette.updateRunEnvironment(runId, environment.env);
        cassette.updateRunConfig(
          runId,
          mergeRunConfig(existing.configJson, {
            envWhitelist: this.envWhitelist,
            redactionRules: redactionRules.map((rule) => rule.name),
            ...(redactionRules.length === 0 ? {} : { redactionPatterns: redactionRules }),
            ...(metadata.lockfileHash === undefined ? {} : { lockfileHash: metadata.lockfileHash }),
          }),
        );
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

  private async runVariant<T>(
    kind: "replay" | "fork",
    name: string,
    fn: () => Promise<T> | T,
  ): Promise<T> {
    const label = kind === "replay" ? "Replay" : "Fork";
    const storedMode = kind === "replay" ? "replayed" : "forked";
    const baselineRunId = this.baselineRunId ?? process.env.FORKPOINT_BASELINE_RUN_ID;
    if (baselineRunId === undefined || baselineRunId === "") {
      throw new UsageError(
        `${label} requires a baseline run id. Use \`forkpoint ${kind} <run_id>\` or set FORKPOINT_BASELINE_RUN_ID.`,
      );
    }
    if (!isRunId(baselineRunId)) {
      throw new UsageError(`Not a valid Forkpoint run id: ${baselineRunId}`);
    }
    if (kind === "fork" && !hasForkOverrides(this.overrides)) {
      throw new UsageError(
        "Fork requires at least one override: model, temperature, or systemPrompt.",
      );
    }

    const cassette = openCassette(this.storeDir);
    try {
      const baseline = cassette.getRun(baselineRunId);
      if (baseline === undefined) throw new RunNotFoundError(baselineRunId, this.storeDir);

      const runId = this.runId ?? process.env.FORKPOINT_RUN_ID ?? createRunId();
      if (!isRunId(runId)) throw new UsageError(`Not a valid Forkpoint run id: ${runId}`);
      if (runId === baseline.id) {
        throw new UsageError(`${label} needs a new run id; refusing to overwrite the baseline run.`);
      }

      const command =
        process.env.FORKPOINT_COMMAND ??
        baseline.command ??
        formatCommand(process.argv[0] ?? "node", process.argv.slice(1));
      const metadata = collectRunMetadata(command);
      const environment = captureEnvironment(this.envWhitelist);
      const baselineOverrides = storedOverrides(baseline);
      const overrides =
        kind === "fork"
          ? { ...(baselineOverrides ?? {}), ...this.overrides }
          : baselineOverrides;
      const ownRules = serializeRedactionRules(this.redact);
      const redactionRules = ownRules.length > 0 ? ownRules : storedRedactionRules(baseline);

      const existing = cassette.getRun(runId);
      const effectiveName = existing?.name ?? baseline.name;
      if (existing === undefined) {
        cassette.createRun({
          id: runId,
          name: effectiveName,
          parentRunId: baseline.id,
          mode: storedMode,
          status: "recording",
          command: metadata.command,
          cwd: metadata.cwd,
          ...(metadata.gitSha === undefined ? {} : { gitSha: metadata.gitSha }),
          nodeVersion: metadata.nodeVersion,
          platform: metadata.platform,
          config: {
            argv: process.argv,
            ...(kind === "replay"
              ? { replayedFrom: baseline.id }
              : { forkedFrom: baseline.id, overrides }),
            envWhitelist: this.envWhitelist,
            redactionRules: redactionRules.map((rule) => rule.name),
            ...(redactionRules.length === 0 ? {} : { redactionPatterns: redactionRules }),
            ...(metadata.lockfileHash === undefined ? {} : { lockfileHash: metadata.lockfileHash }),
          },
          env: environment.env,
        });
      } else {
        if (existing.status !== "recording" || existing.mode !== storedMode) {
          throw new RunExistsError(runId);
        }
        cassette.updateRunEnvironment(runId, environment.env);
        cassette.updateRunConfig(
          runId,
          mergeRunConfig(existing.configJson, {
            envWhitelist: this.envWhitelist,
            redactionRules: redactionRules.map((rule) => rule.name),
            ...(redactionRules.length === 0 ? {} : { redactionPatterns: redactionRules }),
            ...(metadata.lockfileHash === undefined ? {} : { lockfileHash: metadata.lockfileHash }),
          }),
        );
      }

      cassette.appendEvent(runId, {
        type: "run.start",
        payload: { name: effectiveName, mode: kind, parentRunId: baseline.id },
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
        mode: kind,
        cassette,
        occurrences: new Map(),
        counters: { llmCalls: 0, toolCalls: 0 },
        ...(overrides === undefined ? {} : { forkOverrides: overrides }),
      };

      const restoreFetch = kind === "replay" ? installLiveGuard() : () => {};
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
            if (kind === "fork") {
              cassette.appendEvent(runId, {
                type: "replay.warning",
                payload: {
                  code: "FORK_TOOLS_FROZEN",
                  message:
                    "Tool calls are answered from baseline fixtures; no tool executes during a fork.",
                },
              });
              if (baselineOverrides !== undefined) {
                cassette.appendEvent(runId, {
                  type: "replay.warning",
                  payload: {
                    code: "FORK_OVERRIDES_INHERITED",
                    message:
                      "The baseline is a forked run; its overrides were inherited, with new overrides taking precedence.",
                  },
                });
              }
            } else if (overrides !== undefined) {
              cassette.appendEvent(runId, {
                type: "replay.warning",
                payload: {
                  code: "FORK_OVERRIDES_APPLIED",
                  message:
                    "The baseline is a forked run; its model overrides were applied to match the recorded requests.",
                },
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
            cassette.updateRunStatus(runId, storedMode, buildMetrics(cassette, runId, context, durationMs));
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

function storedOverrides(run: RunRow): ForkOverrides | undefined {
  if (run.mode !== "forked" || run.configJson === undefined) return undefined;

  let config: unknown;
  try {
    config = JSON.parse(run.configJson) as unknown;
  } catch {
    throw new UsageError(`Run ${run.id} has unreadable fork config.`);
  }
  if (typeof config !== "object" || config === null) return undefined;

  const raw = (config as Record<string, unknown>).overrides;
  if (raw === undefined) return undefined;
  const overrides = validateForkOverrides(raw);
  return hasForkOverrides(overrides) ? overrides : undefined;
}

function mergeRunConfig(
  configJson: string | undefined,
  patch: Record<string, unknown>,
): Record<string, unknown> {
  if (configJson === undefined) return patch;
  let config: unknown;
  try {
    config = JSON.parse(configJson) as unknown;
  } catch {
    return patch;
  }
  return typeof config === "object" && config !== null
    ? { ...(config as Record<string, unknown>), ...patch }
    : patch;
}

function storedRedactionRules(run: RunRow): StoredRedactionRule[] {
  if (run.configJson === undefined) return [];
  let config: unknown;
  try {
    config = JSON.parse(run.configJson) as unknown;
  } catch {
    return [];
  }
  return readStoredRedactionRules(config);
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
