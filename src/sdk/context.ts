import { AsyncLocalStorage } from "node:async_hooks";
import type { Mode } from "../core/events.js";
import { NoActiveRunError } from "../core/errors.js";
import type { Cassette } from "../store/cassette.js";

export interface RunCounters {
  llmCalls: number;
  toolCalls: number;
}

export interface RunContext {
  runId: string;
  name: string;
  mode: Mode;
  cassette: Cassette;
  occurrences: Map<string, number>;
  counters: RunCounters;
}

const storage = new AsyncLocalStorage<RunContext>();
let armed: { mode: Mode } | undefined;

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
