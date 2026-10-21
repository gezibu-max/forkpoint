import type { EventRecord } from "./events.js";
import { fingerprintValue } from "./fingerprint.js";

export interface EventHashReport {
  hash: string;
  eventCount: number;
}

export type EventDifferenceReason = "missing" | "type" | "content";

export interface EventDifference {
  seq: number;
  reason: EventDifferenceReason;
  expected?: { type: string; hash: string };
  actual?: { type: string; hash: string };
}

export function digestEvent(event: EventRecord): string {
  return fingerprintValue({
    seq: event.seq,
    type: event.type,
    spanId: event.spanId ?? null,
    parentSpanId: event.parentSpanId ?? null,
    callsite: event.callsite ?? null,
    requestHash: event.requestHash ?? null,
    responseHash: event.responseHash ?? null,
    payload: event.payload,
  });
}

export function hashEvents(events: EventRecord[]): EventHashReport {
  return {
    hash: fingerprintValue(events.map(digestEvent)),
    eventCount: events.length,
  };
}

export function firstEventDifference(
  expected: EventRecord[],
  actual: EventRecord[],
): EventDifference | undefined {
  const count = Math.max(expected.length, actual.length);

  for (let index = 0; index < count; index += 1) {
    const left = expected[index];
    const right = actual[index];

    if (left === undefined) {
      return {
        seq: right!.seq,
        reason: "missing",
        actual: { type: right!.type, hash: digestEvent(right!) },
      };
    }
    if (right === undefined) {
      return {
        seq: left.seq,
        reason: "missing",
        expected: { type: left.type, hash: digestEvent(left) },
      };
    }

    const expectedHash = digestEvent(left);
    const actualHash = digestEvent(right);
    if (left.type !== right.type) {
      return {
        seq: left.seq,
        reason: "type",
        expected: { type: left.type, hash: expectedHash },
        actual: { type: right.type, hash: actualHash },
      };
    }
    if (expectedHash !== actualHash) {
      return {
        seq: left.seq,
        reason: "content",
        expected: { type: left.type, hash: expectedHash },
        actual: { type: right.type, hash: actualHash },
      };
    }
  }

  return undefined;
}
