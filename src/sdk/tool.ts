import { elapsedMs, monotonicNow } from "../core/clock.js";
import { captureCallsite } from "../core/callsite.js";
import { CassetteCorruptError, errorSummary, NoActiveRunError, NotImplementedError } from "../core/errors.js";
import { canonicalize, fingerprintValue } from "../core/fingerprint.js";
import { currentRun, isArmed, nextOccurrence, type RunContext } from "./context.js";
import {
  appendReplayWarning,
  cloneJson,
  fixtureResponse,
  getReplayFixture,
  isObject,
  recordedError,
  replayFailure,
  replayResult,
} from "./replay.js";

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

    if (context.mode === "fork") {
      throw new NotImplementedError(`Fork for tool "${name}"`);
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

    if (context.mode === "replay") {
      return replayToolCall(context, name, isWrite, requestHash, occurrence, callsite) as Result;
    }

    const startedAt = monotonicNow();
    let result: Result;
    try {
      result = fn.apply(this, args);
    } catch (error) {
      recordToolError(context, name, requestHash, requestJson, occurrence, callsite, isWrite, false, error, elapsedMs(startedAt));
      throw error;
    }

    if (isThenable(result)) {
      return Promise.resolve(result).then(
        (value) => {
          const durationMs = elapsedMs(startedAt);
          recordToolResult(context, name, requestHash, requestJson, occurrence, callsite, isWrite, true, value, durationMs);
          return value;
        },
        (error: unknown) => {
          recordToolError(context, name, requestHash, requestJson, occurrence, callsite, isWrite, true, error, elapsedMs(startedAt));
          throw error;
        },
      ) as Result;
    }

    recordToolResult(context, name, requestHash, requestJson, occurrence, callsite, isWrite, false, result, elapsedMs(startedAt));
    return result;
  };
}

function replayToolCall(
  context: RunContext,
  name: string,
  isWrite: boolean,
  requestHash: string,
  occurrence: number,
  callsite: string,
): unknown {
  const fixture = getReplayFixture(context, "tool", requestHash, occurrence, callsite);
  const meta = isObject(fixture.meta) ? fixture.meta : {};
  const thenable = meta.thenable === true;

  const recorded = recordedError(meta);
  if (recorded !== undefined) {
    context.cassette.appendEvent(context.runId, {
      type: "tool.error",
      payload: { name, errorName: recorded.name, message: recorded.message },
      callsite,
    });
    return replayFailure(recorded, thenable);
  }

  const response = fixtureResponse(context, fixture);
  if (!isObject(response) || !("result" in response)) {
    throw new CassetteCorruptError(
      context.cassette.file,
      `tool fixture ${requestHash.slice(0, 12)}… does not contain a result`,
    );
  }

  const result = cloneJson(response.result);
  if (isWrite) {
    appendReplayWarning(
      context,
      "WRITE_TOOL_NOT_EXECUTED",
      `Tool "${name}" is marked write:true; replay returned the recorded result without executing it.`,
      callsite,
    );
  }

  context.cassette.appendEvent(context.runId, {
    type: "tool.result",
    payload: { name, result },
    callsite,
    responseHash: fingerprintValue(result),
  });
  return replayResult(result, thenable);
}

function recordToolResult(
  context: RunContext,
  name: string,
  requestHash: string,
  requestJson: string,
  occurrence: number,
  callsite: string,
  isWrite: boolean,
  thenable: boolean,
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
    meta: { write: isWrite, thenable },
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
  thenable: boolean,
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
    meta: { write: isWrite, thenable, error: summary },
  });
}

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value !== null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as { then?: unknown }).then === "function"
  );
}
