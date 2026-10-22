import { realNow, realPerformanceNow } from "../core/clock.js";
import { captureCallsite } from "../core/callsite.js";
import { ClockReadLimitError, NondeterminismError } from "../core/errors.js";
import type { EventRecord } from "../core/events.js";
import { inRealSource, type RunContext } from "./context.js";

const MAX_CLOCK_READS = 10_000;

interface ClockPoint {
  source: string;
  value: number;
}

export interface BoundaryControl {
  restore(): void;
  audit(): NondeterminismError | undefined;
}

export function installClockBoundary(context: RunContext): BoundaryControl {
  const controlled = context.baselineRunId !== undefined;
  // Agent code may take a different path than the baseline; fork samples new values instead of failing.
  const extensible = context.mode === "fork";
  const recorded = controlled ? loadRecordedClock(context) : [];
  let index = 0;
  let reads = 0;
  let warned = false;
  let sourceWarned = false;

  function read(source: string): number {
    if (inRealSource()) return freshClock(source);

    if (!controlled) {
      reads += 1;
      if (reads > MAX_CLOCK_READS) throw new ClockReadLimitError(MAX_CLOCK_READS);
      const value = freshClock(source);
      appendClockEvent(context, source, value);
      return value;
    }

    const point = recorded[index];
    if (point === undefined) {
      if (extensible) {
        const value = freshClock(source);
        appendClockEvent(context, source, value);
        if (!warned) {
          warned = true;
          appendWarning(
            context,
            "CLOCK_EXTENDED",
            "The fork consumed more clock reads than the baseline recorded; fresh values were recorded.",
          );
        }
        return value;
      }
      throw new NondeterminismError(
        recorded.length === 0
          ? "Strict replay read the clock, but the baseline recorded no clock reads."
          : `Strict replay consumed more clock reads than the baseline recorded (${recorded.length}).`,
        {
          runId: context.runId,
          callsite: captureCallsite(),
          hint: "The replay took a different path than the recording. Re-record the baseline or align the code path.",
        },
      );
    }

    if (point.source !== source) {
      if (extensible) {
        const value = freshClock(source);
        appendClockEvent(context, source, value);
        if (!sourceWarned) {
          sourceWarned = true;
          appendWarning(
            context,
            "CLOCK_SOURCE_MISMATCH",
            `The fork read ${source} where the baseline recorded ${point.source}; fresh values were recorded.`,
          );
        }
        return value;
      }
      throw new NondeterminismError(
        `Clock source mismatch: recorded ${point.source}, replay read ${source}.`,
        { runId: context.runId, callsite: captureCallsite() },
      );
    }
    index += 1;
    appendClockEvent(context, source, point.value);
    return point.value;
  }

  const originalDate = globalThis.Date;
  const patchedDate = new Proxy(originalDate, {
    apply(target, thisArg, args) {
      return new originalDate(read("date.ctor")).toString();
    },
    construct(target, args, newTarget) {
      if (args.length === 0) {
        return Reflect.construct(target, [read("date.ctor")], newTarget);
      }
      return Reflect.construct(target, args, newTarget);
    },
    get(target, property, receiver) {
      if (property === "now") return () => read("date.now");
      return Reflect.get(target, property, receiver);
    },
  });
  globalThis.Date = patchedDate;

  const originalPerformanceNow = performance.now;
  let patchedPerformance = false;
  try {
    Object.defineProperty(performance, "now", {
      configurable: true,
      writable: true,
      value: () => read("performance"),
    });
    patchedPerformance = performance.now !== originalPerformanceNow;
  } catch {
    // Some runtimes expose a non-configurable performance object; replay still has Date.
  }

  return {
    restore() {
      if (globalThis.Date === patchedDate) globalThis.Date = originalDate;
      if (patchedPerformance) {
        try {
          Object.defineProperty(performance, "now", {
            configurable: true,
            writable: true,
            value: originalPerformanceNow,
          });
        } catch {
          // Restoring is best-effort; the patched value still reads the cassette.
        }
      }
    },
    audit() {
      if (context.mode !== "replay" || index >= recorded.length) return undefined;
      return new NondeterminismError(
        `Strict replay consumed ${index} of ${recorded.length} recorded clock reads.`,
        {
          runId: context.runId,
          callsite: captureCallsite(),
          hint: "The replay took a different path or skipped a boundary, so later recorded values were never applied.",
        },
      );
    },
  };
}

function appendClockEvent(context: RunContext, source: string, value: number): void {
  context.cassette.appendEvent(context.runId, {
    type: "clock.now",
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

function loadRecordedClock(context: RunContext): ClockPoint[] {
  if (context.baselineRunId === undefined) return [];
  const points: ClockPoint[] = [];
  for (const event of context.cassette.getEventsByType(context.baselineRunId, "clock.now")) {
    const point = readPoint(event);
    if (point !== undefined) points.push(point);
  }
  return points;
}

function readPoint(event: EventRecord): ClockPoint | undefined {
  if (typeof event.payload !== "object" || event.payload === null) return undefined;
  const payload = event.payload as Record<string, unknown>;
  if (typeof payload.source !== "string" || typeof payload.value !== "number") return undefined;
  return { source: payload.source, value: payload.value };
}

function freshClock(source: string): number {
  return source === "performance" ? realPerformanceNow() : realNow();
}
