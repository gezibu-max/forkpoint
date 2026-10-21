import { describe, expect, it } from "vitest";
import {
  digestEvent,
  firstEventDifference,
  hashEvents,
} from "../src/core/event-hash.js";
import type { EventRecord, EventType } from "../src/core/events.js";

function event(
  seq: number,
  type: EventType,
  payload: unknown,
  extra: Partial<EventRecord> = {},
): EventRecord {
  return { runId: "r_test", seq, type, ts: 1_000 + seq, payload, ...extra };
}

describe("event hashing", () => {
  it("excludes timestamps and durations", () => {
    const first = [
      event(0, "run.start", { name: "demo", mode: "replay" }),
      event(1, "tool.result", { name: "add", result: 5 }, { durationMs: 1 }),
    ];
    const second = [
      { ...first[0]!, ts: 9_999 },
      { ...first[1]!, ts: 9_999, durationMs: 250 },
    ];

    expect(digestEvent(first[1]!)).toBe(digestEvent(second[1]!));
    expect(hashEvents(first)).toEqual(hashEvents(second));
    expect(firstEventDifference(first, second)).toBeUndefined();
  });

  it("includes callsite and request metadata", () => {
    const first = [event(0, "llm.request", { model: "m" }, { requestHash: "aaa", callsite: "a.ts:1:1" })];
    const second = [event(0, "llm.request", { model: "m" }, { requestHash: "aaa", callsite: "b.ts:2:2" })];

    const difference = firstEventDifference(first, second);
    expect(difference?.reason).toBe("content");
    expect(difference?.seq).toBe(0);
  });

  it("reports the first changed payload", () => {
    const first = [
      event(0, "run.start", { name: "demo", mode: "replay" }),
      event(1, "tool.result", { name: "add", result: 5 }),
      event(2, "run.end", { status: "ok" }),
    ];
    const second = [
      event(0, "run.start", { name: "demo", mode: "replay" }),
      event(1, "tool.result", { name: "add", result: 6 }),
      event(2, "run.end", { status: "ok" }),
    ];

    const difference = firstEventDifference(first, second);
    expect(difference).toMatchObject({
      seq: 1,
      reason: "content",
      expected: { type: "tool.result" },
      actual: { type: "tool.result" },
    });
    expect(hashEvents(first).hash).not.toBe(hashEvents(second).hash);
  });

  it("reports a changed event type", () => {
    const first = [event(0, "tool.result", { name: "add" })];
    const second = [event(0, "tool.error", { name: "add" })];

    expect(firstEventDifference(first, second)).toMatchObject({
      seq: 0,
      reason: "type",
      expected: { type: "tool.result" },
      actual: { type: "tool.error" },
    });
  });

  it("reports a missing trailing event", () => {
    const first = [
      event(0, "run.start", { name: "demo", mode: "replay" }),
      event(1, "run.end", { status: "ok" }),
    ];
    const second = [event(0, "run.start", { name: "demo", mode: "replay" })];

    expect(firstEventDifference(first, second)).toMatchObject({
      seq: 1,
      reason: "missing",
      expected: { type: "run.end" },
    });
    expect(firstEventDifference(second, first)).toMatchObject({
      seq: 1,
      reason: "missing",
      actual: { type: "run.end" },
    });
  });

  it("returns a stable lowercase SHA-256 hash", () => {
    const events = [event(0, "run.start", { name: "demo", mode: "replay" })];
    const report = hashEvents(events);

    expect(report.eventCount).toBe(1);
    expect(report.hash).toMatch(/^[0-9a-f]{64}$/);
  });
});
