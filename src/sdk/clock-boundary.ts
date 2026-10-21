import { realNow, realPerformanceNow } from "../core/clock.js";
import { captureCallsite } from "../core/callsite.js";
import { ClockReadLimitError, NondeterminismError } from "../core/errors.js";
import type { EventRecord } from "../core/events.js";
import type { RunContext } from "./context.js";

const MAX_CLOCK_READS = 10_000;

interface ClockPoint {
  source: string;
  value: number;
}

export function installClockBoundary(context: RunContext): () => void {
  const controlled = context.baselineRunId !== undefined;
  const recorded = controlled ? loadRecordedClock(context) : [];
  const fallback = controlled ? recorded[0]?.value ?? baselineStart(context) : 0;
  let index = 0;
  let reads = 0;
  let last = fallback;
  let warned = false;

  function read(source: string): number {
    if (!controlled) {
      reads += 1;
      if (reads > MAX_CLOCK_READS) throw new ClockReadLimitError(MAX_CLOCK_READS);
      const value = source === "performance" ? realPerformanceNow() : realNow();
      appendClockEvent(context, source, value);
      return value;
    }

    const point = recorded[index];
    if (point === undefined) {
      if (!warned) {
        warned = true;
        appendWarning(
          context,
          recorded.length === 0 ? "CLOCK_NOT_RECORDED" : "CLOCK_EXHAUSTED",
          recorded.length === 0
            ? `No clock reads were recorded; freezing at ${new Date(last).toISOString()}.`
            : "Consumed more clock reads than were recorded; freezing at the last value.",
        );
      }
      return last;
    }

    index += 1;
    if (point.source !== source) {
      throw new NondeterminismError(
        `Clock source mismatch: recorded ${point.source}, replay read ${source}.`,
        { runId: context.runId, callsite: captureCallsite() },
      );
    }
    last = point.value;
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

  return () => {
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

function baselineStart(context: RunContext): number {
  if (context.baselineRunId === undefined) return realNow();
  return context.cassette.getEventsByType(context.baselineRunId, "run.start")[0]?.ts ?? realNow();
}
