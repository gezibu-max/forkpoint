import path from "node:path";
import { elapsedMs, monotonicNow } from "../core/clock.js";
import {
  captureEnvironment,
  collectRunMetadata,
  DEFAULT_ENV_WHITELIST,
  formatCommand,
  resolveMode,
} from "../core/env.js";
import type { Mode } from "../core/events.js";
import { errorSummary, NestedRunError, NotImplementedError, RunExistsError, UsageError } from "../core/errors.js";
import { isRunId, createRunId } from "../core/ulid.js";
import { openCassette, type Cassette } from "../store/cassette.js";
import {
  armInstance,
  currentRun,
  disarmInstance,
  runWithContext,
  type RunContext,
} from "./context.js";
import { wrapOpenAI } from "./llm.js";

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
  redact?: RedactionRule[];
  envWhitelist?: string[];
  pricing?: PricingTable;
}

export class Forkpoint {
  readonly mode: Mode;
  readonly storeDir: string;
  readonly envWhitelist: string[];
  readonly redact: RedactionRule[];
  readonly pricing: PricingTable;

  constructor(options: ForkpointOptions = {}) {
    this.mode = resolveMode(options.mode);
    this.storeDir = path.resolve(options.store ?? process.env.FORKPOINT_STORE ?? ".forkpoint");
    this.envWhitelist = [...(options.envWhitelist ?? DEFAULT_ENV_WHITELIST)];
    this.redact = [...(options.redact ?? [])];
    this.pricing = { ...(options.pricing ?? {}) };

    if (this.mode !== "off") armInstance(this);
  }

  wrapOpenAI<T extends object>(client: T): T {
    if (this.mode === "off") return client;
    return wrapOpenAI(client);
  }

  async run<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    if (name.trim() === "") throw new UsageError("Run name must not be empty.");
    if (currentRun() !== undefined) throw new NestedRunError();
    if (this.mode === "off") return await fn();
    if (this.mode !== "record") throw new NotImplementedError(`Mode "${this.mode}"`);
    if (typeof fn !== "function") throw new UsageError("fp.run() expects a function.");

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
        }
      });
    } finally {
      cassette.close();
    }
  }

  dispose(): void {
    disarmInstance(this);
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
