import { CassetteCorruptError, FixtureMissError, ToolExecutionError } from "../core/errors.js";
import type { FixtureRow } from "../store/cassette.js";
import type { RunContext } from "./context.js";

type UnknownRecord = Record<string, unknown>;

export function getReplayFixture(
  context: RunContext,
  kind: "llm" | "tool",
  fixtureKey: string,
  occurrence: number,
  callsite: string,
): FixtureRow {
  const sourceRunId = context.baselineRunId;
  if (sourceRunId === undefined) {
    throw new ToolExecutionError("Replay has no baseline run id.", { callsite });
  }

  const fixture = context.cassette.getFixture(sourceRunId, kind, fixtureKey, occurrence);
  if (fixture === undefined) {
    throw new FixtureMissError(fixtureKey, {
      runId: sourceRunId,
      callsite,
      hint: `No ${kind} fixture for occurrence ${occurrence} in baseline run ${sourceRunId}. Re-record, or check for a boundary that is not wrapped.`,
    });
  }
  return fixture;
}

export function fixtureResponse(context: RunContext, fixture: FixtureRow): unknown {
  if (fixture.response === undefined) {
    throw new CassetteCorruptError(
      context.cassette.file,
      `fixture ${fixture.kind}/${fixture.fixtureKey.slice(0, 12)}… occurrence ${fixture.occurrence} has no response`,
    );
  }
  return fixture.response;
}

export function recordedError(meta: unknown): Error | undefined {
  if (!isObject(meta) || !isObject(meta.error)) return undefined;
  const name = typeof meta.error.name === "string" ? meta.error.name : "Error";
  const message = typeof meta.error.message === "string" ? meta.error.message : "Recorded error";
  const error = new Error(message);
  error.name = name;
  return error;
}

export function cloneJson<T>(value: T): T {
  return structuredClone(value);
}

export function replayResult<T>(value: T, thenable: boolean): T {
  return (thenable ? Promise.resolve(value) : value) as T;
}

export function replayFailure(error: Error, thenable: boolean): never {
  if (thenable) {
    return Promise.reject(error) as never;
  }
  throw error;
}

export function appendReplayWarning(context: RunContext, code: string, message: string, callsite?: string): void {
  context.cassette.appendEvent(context.runId, {
    type: "replay.warning",
    payload: { code, message },
    ...(callsite === undefined ? {} : { callsite }),
  });
}

export function isObject(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}
