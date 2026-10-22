import { elapsedMs, monotonicNow } from "../core/clock.js";
import { captureCallsite } from "../core/callsite.js";
import {
  CassetteCorruptError,
  errorSummary,
  FixtureMissError,
  NoActiveRunError,
} from "../core/errors.js";
import { canonicalize, fingerprintValue } from "../core/fingerprint.js";
import { currentRun, isArmed, nextOccurrence, runWithRealSource, type RunContext } from "./context.js";
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
    if (context.boundaryError !== undefined) throw context.boundaryError;

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

    if (context.mode === "replay" || context.mode === "fork") {
      return replayToolCall(
        context,
        name,
        isWrite,
        requestHash,
        occurrence,
        callsite,
        requestJson,
      ) as Result;
    }

    const startedAt = monotonicNow();
    let result: Result;
    try {
      result = runWithRealSource(() => fn.apply(this, args));
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
  requestJson: string,
): unknown {
  let fixture: ReturnType<typeof getReplayFixture>;
  try {
    fixture = getReplayFixture(context, "tool", requestHash, occurrence, callsite, requestJson);
  } catch (error) {
    if (error instanceof FixtureMissError) {
      context.boundaryError = error;
      const summary = errorSummary(error);
      context.cassette.appendEvent(context.runId, {
        type: "tool.error",
        payload: { name, errorName: summary.name, message: summary.message },
        callsite,
      });
    }
    throw error;
  }
  const meta = isObject(fixture.meta) ? fixture.meta : {};
  const thenable = meta.thenable === true;
  const fork = context.mode === "fork";

  const recorded = recordedError(meta);
  if (recorded !== undefined) {
    context.cassette.appendEvent(context.runId, {
      type: "tool.error",
      payload: { name, errorName: recorded.name, message: recorded.message },
      callsite,
    });
    copyToolFixture(context, fixture, requestJson, callsite);
    return replayFailure(recorded, thenable);  }

  const response = fixtureResponse(context, fixture);
  if (!isObject(response) || !("result" in response)) {
    throw new CassetteCorruptError(
      context.cassette.file,
      `tool fixture ${requestHash.slice(0, 12)}… does not contain a result`,
    );
  }

  const result = cloneJson(response.result);
  if (isWrite && !fork) {
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
  copyToolFixture(context, fixture, requestJson, callsite);
  return replayResult(result, thenable);
}

function copyToolFixture(
  context: RunContext,
  fixture: ReturnType<typeof getReplayFixture>,
  requestJson: string,
  callsite: string,
): void {
  context.cassette.putFixture(context.runId, {
    kind: "tool",
    fixtureKey: fixture.fixtureKey,
    occurrence: fixture.occurrence,
    callsite,
    requestJson,
    ...(fixture.response === undefined ? {} : { response: fixture.response }),
    ...(fixture.meta === undefined ? {} : { meta: fixture.meta }),
  });
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
