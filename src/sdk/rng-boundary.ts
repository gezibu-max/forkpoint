import { captureCallsite } from "../core/callsite.js";
import { NondeterminismError, RngExhaustedError, RngMismatchError, UsageError } from "../core/errors.js";
import type { EventRecord } from "../core/events.js";
import { inRealSource, type RunContext } from "./context.js";

interface RngPoint {
  source: string;
  value: string;
}

export interface RngBoundaryControl {
  restore(): void;
  audit(): NondeterminismError | undefined;
}

export function installRngBoundary(context: RunContext): RngBoundaryControl {
  const controlled = context.baselineRunId !== undefined;
  // A fork runs live code, so its random draw count can exceed the baseline's.
  const extensible = context.mode === "fork";
  const recorded = controlled ? loadRecordedRng(context) : [];
  let index = 0;
  let extended = false;
  let sourceWarned = false;

  function next(source: string, produce: () => string): string {
    if (inRealSource()) return produce();

    if (!controlled) {
      const value = produce();
      appendRngEvent(context, source, value);
      return value;
    }

    const point = recorded[index];
    if (point === undefined) {
      if (!extensible) {
        throw new RngExhaustedError({ runId: context.runId, callsite: captureCallsite() });
      }
      const value = produce();
      appendRngEvent(context, source, value);
      if (!extended) {
        extended = true;
        appendWarning(
          context,
          "RNG_EXTENDED",
          "The fork consumed more random values than the baseline recorded; new values were drawn and recorded.",
        );
      }
      return value;
    }
    if (point.source !== source) {
      if (extensible) {
        const value = produce();
        appendRngEvent(context, source, value);
        if (!sourceWarned) {
          sourceWarned = true;
          appendWarning(
            context,
            "RNG_SOURCE_MISMATCH",
            `The fork read ${source} where the baseline recorded ${point.source}; fresh values were recorded.`,
          );
        }
        return value;
      }
      throw new RngMismatchError(point.source, source, {
        runId: context.runId,
        callsite: captureCallsite(),
      });
    }
    index += 1;
    appendRngEvent(context, source, point.value);
    return point.value;
  }

  const originalMathRandom = Math.random;
  Math.random = () => Number(next("math.random", () => originalMathRandom().toString()));

  const cryptoObject = globalThis.crypto;
  const originalRandomUUID = cryptoObject.randomUUID;
  const originalGetRandomValues = cryptoObject.getRandomValues;

  replaceMethod(cryptoObject, "randomUUID", function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
    return next("crypto.randomUUID", () => originalRandomUUID.call(cryptoObject)) as `${string}-${string}-${string}-${string}-${string}`;
  });

  const patchedGetRandomValues = function getRandomValues(
    array: ArrayBufferView | null,
  ): ArrayBufferView | null {
    if (array === null) return array;
    if (inRealSource()) return originalGetRandomValues.call(cryptoObject, array as never);
    const bytes = new Uint8Array(array.buffer, array.byteOffset, array.byteLength);
    if (controlled) {
      const value = next("crypto.getRandomValues", () => {
        const fresh = new Uint8Array(bytes.length);
        originalGetRandomValues.call(cryptoObject, fresh as never);
        return Buffer.from(fresh).toString("base64");
      });
      const recordedBytes = Buffer.from(value, "base64");
      if (recordedBytes.length !== bytes.length) {
        throw new RngMismatchError(
          `crypto.getRandomValues(${recordedBytes.length} bytes)`,
          `crypto.getRandomValues(${bytes.length} bytes)`,
          { runId: context.runId, callsite: captureCallsite() },
        );
      }
      bytes.set(recordedBytes);
      return array;
    }

    const result = originalGetRandomValues.call(cryptoObject, array as never);
    appendRngEvent(context, "crypto.getRandomValues", Buffer.from(bytes).toString("base64"));
    return result;
  } as unknown as typeof cryptoObject.getRandomValues;

  replaceMethod(cryptoObject, "getRandomValues", patchedGetRandomValues);

  return {
    restore() {
      Math.random = originalMathRandom;
      try {
        replaceMethod(cryptoObject, "randomUUID", originalRandomUUID);
        replaceMethod(cryptoObject, "getRandomValues", originalGetRandomValues);
      } catch {
        // Restoring is best-effort; the process is exiting a replay.
      }
    },
    audit() {
      if (context.mode !== "replay" || index >= recorded.length) return undefined;
      return new NondeterminismError(
        `Strict replay consumed ${index} of ${recorded.length} recorded random values.`,
        {
          runId: context.runId,
          callsite: captureCallsite(),
          hint: "The replay took a different path or skipped a boundary, so later recorded values were never applied.",
        },
      );
    },
  };
}

function appendRngEvent(context: RunContext, source: string, value: string): void {
  context.cassette.appendEvent(context.runId, {
    type: "rng.value",
    payload: { source, value },
    callsite: captureCallsite(),
  });
}

function appendWarning(context: RunContext, code: string, message: string): void {
  context.cassette.appendEvent(context.runId, {
    type: "replay.warning",
    payload: { code, message },
    callsite: captureCallsite(),
  });
}

function loadRecordedRng(context: RunContext): RngPoint[] {
  if (context.baselineRunId === undefined) return [];
  const points: RngPoint[] = [];
  for (const event of context.cassette.getEventsByType(context.baselineRunId, "rng.value")) {
    const point = readPoint(event);
    if (point !== undefined) points.push(point);
  }
  return points;
}

function readPoint(event: EventRecord): RngPoint | undefined {
  if (typeof event.payload !== "object" || event.payload === null) return undefined;
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.source !== "string" || typeof payload.value !== "string") return undefined;
  return { source: payload.source, value: payload.value };
}

function replaceMethod(target: object, name: string, value: unknown): void {
  try {
    Object.defineProperty(target, name, {
      configurable: true,
      writable: true,
      value,
    });
  } catch (error) {
    throw new UsageError(
      `Cannot patch ${name} for deterministic replay: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}
