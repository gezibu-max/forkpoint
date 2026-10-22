import { AsyncLocalStorage } from "node:async_hooks";
import type { Mode } from "../core/events.js";
import { NestedRunError, NoActiveRunError } from "../core/errors.js";
import type { Cassette } from "../store/cassette.js";
import type { ForkOverrides } from "./overrides.js";

export interface RunCounters {
  llmCalls: number;
  toolCalls: number;
}

export interface RunContext {
  runId: string;
  baselineRunId?: string;
  name: string;
  mode: Mode;
  cassette: Cassette;
  occurrences: Map<string, number>;
  counters: RunCounters;
  boundaryError?: Error;
  forkOverrides?: ForkOverrides;
}

export function fixtureRunId(context: RunContext): string {
  return context.baselineRunId ?? context.runId;
}

const storage = new AsyncLocalStorage<RunContext>();
const realSourceStorage = new AsyncLocalStorage<true>();
let armed: { mode: Mode } | undefined;
let exclusiveRunActive = false;

// Live SDK and tool internals (clock reads, randomness) must not enter the cassette;
// only reads made by agent code are recorded and replayed.
export function runWithRealSource<T>(fn: () => T): T {
  return realSourceStorage.run(true, fn);
}

export function inRealSource(): boolean {
  return realSourceStorage.getStore() === true;
}

export function beginExclusiveRun(): void {
  if (exclusiveRunActive) throw new NestedRunError();
  exclusiveRunActive = true;
}

export function endExclusiveRun(): void {
  exclusiveRunActive = false;
}

export function currentRun(): RunContext | undefined {
  return storage.getStore();
}

export function runWithContext<T>(context: RunContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function armInstance(instance: { mode: Mode }): void {
  if (instance.mode !== "off") armed = instance;
}

export function disarmInstance(instance: { mode: Mode }): void {
  if (armed === instance) armed = undefined;
}

export function isArmed(): boolean {
  return armed !== undefined;
}

export function requireRun(callsite?: string): RunContext {
  const context = currentRun();
  if (context !== undefined) return context;
  throw new NoActiveRunError(callsite);
}

export function nextOccurrence(context: RunContext, kind: string, key: string): number {
  const composite = `${kind}:${key}`;
  const occurrence = context.occurrences.get(composite) ?? 0;
  context.occurrences.set(composite, occurrence + 1);
  return occurrence;
}
