import { elapsedMs, monotonicNow } from "../core/clock.js";
import { captureCallsite } from "../core/callsite.js";
import { errorSummary, NoActiveRunError, NotImplementedError } from "../core/errors.js";
import { canonicalize, fingerprintValue } from "../core/fingerprint.js";
import { currentRun, isArmed, nextOccurrence, type RunContext } from "./context.js";

export interface ToolOptions {
  write?: boolean;
  label?: string;
}

export function tool<Args extends unknown[], Result>(
  name: string,
  fn: (...args: Args) => Result,
  options: ToolOptions = {},
): (...args: Args) => Result {
  if (name.trim() === "") throw new Error("Tool name must not be empty.");
  const isWrite = options.write === true;

  return function wrappedTool(this: unknown, ...args: Args): Result {
    const context = currentRun();
    if (context === undefined) {
      if (isArmed()) throw new NoActiveRunError(captureCallsite({ label: options.label }));
      return fn.apply(this, args);
    }

    if (context.mode !== "record") {
      throw new NotImplementedError(`Boundary replay for tool "${name}"`);
    }

    const callsite = captureCallsite({ label: options.label });
    const toolArgs = args.length === 1 ? args[0] : args;
    const requestHash = fingerprintValue({ tool: name, args: toolArgs });
    const requestJson = canonicalize({ tool: name, args: toolArgs });
    const occurrence = nextOccurrence(context, "tool", requestHash);
    context.counters.toolCalls += 1;

    context.cassette.appendEvent(context.runId, {
      type: "tool.call",
      payload: { name, args: toolArgs, isWrite },
      callsite,
      requestHash,
    });

    const startedAt = monotonicNow();
    let result: Result;
    try {
      result = fn.apply(this, args);
    } catch (error) {
      recordToolError(context, name, requestHash, requestJson, occurrence, callsite, isWrite, error, elapsedMs(startedAt));
      throw error;
    }

    if (isThenable(result)) {
      return Promise.resolve(result).then(
        (value) => {
          const durationMs = elapsedMs(startedAt);
          recordToolResult(context, name, requestHash, requestJson, occurrence, callsite, isWrite, value, durationMs);
          return value;
        },
        (error: unknown) => {
          recordToolError(context, name, requestHash, requestJson, occurrence, callsite, isWrite, error, elapsedMs(startedAt));
          throw error;
        },
      ) as Result;
    }

    recordToolResult(context, name, requestHash, requestJson, occurrence, callsite, isWrite, result, elapsedMs(startedAt));
    return result;
  };
}

function recordToolResult(
  context: RunContext,
  name: string,
  requestHash: string,
  requestJson: string,
  occurrence: number,
  callsite: string,
  isWrite: boolean,
  result: unknown,
  durationMs: number,
): void {
  canonicalize(result);
  context.cassette.appendEvent(context.runId, {
    type: "tool.result",
    payload: { name, result },
    callsite,
    responseHash: fingerprintValue(result),
    durationMs,
  });
  context.cassette.putFixture(context.runId, {
    kind: "tool",
    fixtureKey: requestHash,
    occurrence,
    callsite,
    requestJson,
    response: { result },
    meta: { write: isWrite },
  });
}

function recordToolError(
  context: RunContext,
  name: string,
  requestHash: string,
  requestJson: string,
  occurrence: number,
  callsite: string,
  isWrite: boolean,
  error: unknown,
  durationMs: number,
): void {
  const summary = errorSummary(error);
  context.cassette.appendEvent(context.runId, {
    type: "tool.error",
    payload: { name, errorName: summary.name, message: summary.message },
    callsite,
    durationMs,
  });
  context.cassette.putFixture(context.runId, {
    kind: "tool",
    fixtureKey: requestHash,
    occurrence,
    callsite,
    requestJson,
    meta: { write: isWrite, error: summary },
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
