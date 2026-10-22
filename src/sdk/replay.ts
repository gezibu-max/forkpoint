import { diffFields } from "../core/diff.js";
import {
  CassetteCorruptError,
  FixtureMissError,
  ToolExecutionError,
  type NearestFixture,
} from "../core/errors.js";
import type { FixtureRow } from "../store/cassette.js";
import type { RunContext } from "./context.js";

type UnknownRecord = Record<string, unknown>;

export function getReplayFixture(
  context: RunContext,
  kind: "llm" | "tool",
  fixtureKey: string,
  occurrence: number,
  callsite: string,
  requestJson: string,
): FixtureRow {
  const sourceRunId = context.baselineRunId;
  if (sourceRunId === undefined) {
    throw new ToolExecutionError("Replay has no baseline run id.", { callsite });
  }

  const fixture = context.cassette.getFixture(sourceRunId, kind, fixtureKey, occurrence);
  if (fixture === undefined) {
    const nearest = nearestFixtures(context, sourceRunId, kind, requestJson);
    throw new FixtureMissError(fixtureKey, {
      runId: sourceRunId,
      callsite,
      hint: `No ${kind} fixture for occurrence ${occurrence} in baseline run ${sourceRunId}. Re-record, or check for a boundary that is not wrapped.`,
      ...(nearest[0] === undefined ? {} : { actualKey: nearest[0].key }),
      nearest,
      diffPaths: nearest[0]?.diffPaths ?? [],
    });
  }
  return fixture;
}

function nearestFixtures(
  context: RunContext,
  sourceRunId: string,
  kind: "llm" | "tool",
  requestJson: string,
): NearestFixture[] {
  const actual = parseJson(requestJson);
  if (actual === undefined) return [];

  const seen = new Set<string>();
  const candidates: Array<NearestFixture & { score: number }> = [];
  for (const fixture of context.cassette.listFixtures(sourceRunId)) {
    if (fixture.kind !== kind || fixture.requestJson === undefined) continue;
    if (seen.has(fixture.fixtureKey)) continue;
    const recorded = parseJson(fixture.requestJson);
    if (recorded === undefined) continue;

    seen.add(fixture.fixtureKey);
    const changes = diffFields(recorded, actual, 50);
    candidates.push({
      key: fixture.fixtureKey,
      ...(fixture.callsite === undefined ? {} : { callsite: fixture.callsite }),
      diffPaths: changes.slice(0, 5).map((change) => change.path),
      score: changes.length,
    });
  }

  candidates.sort((left, right) => left.score - right.score || left.key.localeCompare(right.key));
  return candidates.slice(0, 3).map(({ key, callsite, diffPaths }) => ({
    key,
    ...(callsite === undefined ? {} : { callsite }),
    diffPaths,
  }));
}

function parseJson(value: string): unknown {
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
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

const RECORDED_ERROR_FIELDS = ["status", "code", "type", "param", "request_id"] as const;

export function recordedError(meta: unknown): Error | undefined {
  if (!isObject(meta) || !isObject(meta.error)) return undefined;
  const raw = meta.error;
  const name = typeof raw.name === "string" ? raw.name : "Error";
  const message = typeof raw.message === "string" ? raw.message : "Recorded error";
  const error = new Error(message) as Error & Record<string, unknown>;
  error.name = name;
  for (const field of RECORDED_ERROR_FIELDS) {
    const value = raw[field];
    if (
      typeof value === "string" ||
      (typeof value === "number" && Number.isFinite(value))
    ) {
      error[field] = value;
    }
  }
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
