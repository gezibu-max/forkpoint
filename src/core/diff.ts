import type { EventRecord, StoredRunMode, RunStatus } from "./events.js";
import { fingerprintValue } from "./fingerprint.js";

export type StepKind = "llm" | "tool";
export type StepStatus =
  | "same"
  | "request_mismatch"
  | "response_changed"
  | "error_changed"
  | "missing_step"
  | "added_step";
export type DivergenceCategory =
  | "request_mismatch"
  | "output_changed"
  | "tool_exception"
  | "unclassified";
export type DivergenceSeverity = "error" | "expected" | "info";

export interface StepError {
  name: string;
  message: string;
}

export interface Step {
  kind: StepKind;
  name: string;
  callsite: string;
  ordinal: number;
  seq: number;
  requestHash: string;
  request: unknown;
  responseHash?: string;
  response?: unknown;
  error?: StepError;
  usage?: Record<string, unknown>;
  finishReason?: string;
  durationMs?: number;
}

export interface FieldChange {
  path: string;
  base: unknown;
  variant: unknown;
}

export interface AlignedStep {
  index: number;
  base?: Step;
  variant?: Step;
  status: StepStatus;
  fields?: FieldChange[];
  category?: DivergenceCategory;
  severity?: DivergenceSeverity;
}

export interface DiffRunInfo {
  id: string;
  name: string;
  mode: StoredRunMode;
  status: RunStatus;
}

export interface RunMetrics {
  llmCalls: number;
  toolCalls: number;
  totalTokens: number;
  durationMs?: number;
  finalAnswer?: string;
}

export interface DiffReport {
  base: DiffRunInfo;
  variant: DiffRunInfo;
  alignmentStrategy: "callsite+ordinal";
  alignments: AlignedStep[];
  firstDivergence?: AlignedStep;
  metrics: { base: RunMetrics; variant: RunMetrics };
  caveats: string[];
}

const CAVEATS = [
  "Steps are paired by callsite and per-callsite ordinal; concurrent in-flight calls are not supported.",
  "Only wrapped LLM and tool boundaries are compared; clock, RNG, and env are reported by verify.",
  "Cost is not estimated in v0.1; tokens and duration come from the cassette.",
];

export function collectSteps(events: EventRecord[]): Step[] {
  const steps: Step[] = [];
  const pending = new Map<StepKind, number>();
  const ordinals = new Map<string, number>();

  for (const event of events) {
    if (event.type === "llm.request") {
      const payload = asRecord(event.payload);
      const request = payload.request;
      const callsite = event.callsite ?? "unknown";
      steps.push({
        kind: "llm",
        name: typeof payload.model === "string" ? payload.model : "llm",
        callsite,
        ordinal: nextOrdinal(ordinals, `llm|${callsite}`),
        seq: event.seq,
        requestHash: event.requestHash ?? fingerprintValue(request),
        request,
      });
      pending.set("llm", steps.length - 1);
      continue;
    }

    if (event.type === "llm.response") {
      const index = pending.get("llm");
      if (index === undefined) continue;
      const step = steps[index]!;
      const payload = asRecord(event.payload);
      step.response = payload.response;
      step.responseHash = event.responseHash ?? fingerprintValue(payload.response);
      step.usage = asRecord(payload.usage);
      step.finishReason = typeof payload.finishReason === "string" ? payload.finishReason : undefined;
      step.durationMs = event.durationMs;
      pending.delete("llm");
      continue;
    }

    if (event.type === "llm.error") {
      const index = pending.get("llm");
      if (index === undefined) continue;
      steps[index]!.error = stepError(event.payload);
      pending.delete("llm");
      continue;
    }

    if (event.type === "tool.call") {
      const payload = asRecord(event.payload);
      const args = payload.args;
      const callsite = event.callsite ?? "unknown";
      const name = typeof payload.name === "string" ? payload.name : "tool";
      steps.push({
        kind: "tool",
        name,
        callsite,
        ordinal: nextOrdinal(ordinals, `tool|${name}|${callsite}`),
        seq: event.seq,
        requestHash: event.requestHash ?? fingerprintValue(args),
        request: args,
      });
      pending.set("tool", steps.length - 1);
      continue;
    }

    if (event.type === "tool.result") {
      const index = pending.get("tool");
      if (index === undefined) continue;
      const step = steps[index]!;
      const payload = asRecord(event.payload);
      step.response = payload.result;
      step.responseHash = event.responseHash ?? fingerprintValue(payload.result);
      step.durationMs = event.durationMs;
      pending.delete("tool");
      continue;
    }

    if (event.type === "tool.error") {
      const index = pending.get("tool");
      if (index === undefined) continue;
      steps[index]!.error = stepError(event.payload, "errorName");
      pending.delete("tool");
    }
  }

  return steps;
}

export function alignSteps(baseSteps: Step[], variantSteps: Step[]): AlignedStep[] {
  const byKey = new Map<string, Step[]>();
  for (const step of variantSteps) {
    const key = alignmentKey(step);
    const list = byKey.get(key);
    if (list === undefined) byKey.set(key, [step]);
    else list.push(step);
  }

  const alignments: AlignedStep[] = [];
  for (const base of baseSteps) {
    const variant = byKey.get(alignmentKey(base))?.shift();
    alignments.push(comparePair(base, variant));
  }

  for (const remaining of byKey.values()) {
    for (const variant of remaining) {
      alignments.push({ index: 0, variant, status: "added_step" });
    }
  }

  alignments.forEach((alignment, index) => {
    alignment.index = index + 1;
  });
  return alignments;
}

export function buildDiff(
  base: DiffRunInfo,
  variant: DiffRunInfo,
  baseEvents: EventRecord[],
  variantEvents: EventRecord[],
): DiffReport {
  const baseSteps = collectSteps(baseEvents);
  const variantSteps = collectSteps(variantEvents);
  const alignments = alignSteps(baseSteps, variantSteps);

  for (const alignment of alignments) {
    if (alignment.status === "same") continue;
    alignment.category = categorize(alignment);
    alignment.severity = severityFor(alignment, base, variant);
  }

  const firstDivergence = alignments.find((alignment) => alignment.status !== "same");
  return {
    base,
    variant,
    alignmentStrategy: "callsite+ordinal",
    alignments,
    ...(firstDivergence === undefined ? {} : { firstDivergence }),
    metrics: {
      base: summarizeRun(baseEvents, baseSteps),
      variant: summarizeRun(variantEvents, variantSteps),
    },
    caveats: CAVEATS,
  };
}

function comparePair(base: Step, variant: Step | undefined): AlignedStep {
  if (variant === undefined) {
    return { index: 0, base, status: "missing_step" };
  }
  if (base.error !== undefined || variant.error !== undefined) {
    const same =
      base.error?.name === variant.error?.name && base.error?.message === variant.error?.message;
    return {
      index: 0,
      base,
      variant,
      status: same ? "same" : "error_changed",
    };
  }
  if (base.requestHash !== variant.requestHash) {
    return {
      index: 0,
      base,
      variant,
      status: "request_mismatch",
      fields: diffFields(base.request, variant.request),
    };
  }
  if (base.responseHash !== variant.responseHash) {
    return {
      index: 0,
      base,
      variant,
      status: "response_changed",
      fields: diffFields(base.response, variant.response),
    };
  }
  return { index: 0, base, variant, status: "same" };
}

function alignmentKey(step: Step): string {
  return step.kind === "tool"
    ? `tool|${step.name}|${step.callsite}|${step.ordinal}`
    : `llm|${step.callsite}|${step.ordinal}`;
}

function categorize(alignment: AlignedStep): DivergenceCategory {
  switch (alignment.status) {
    case "request_mismatch":
      return "request_mismatch";
    case "response_changed":
      return "output_changed";
    case "error_changed":
      return alignment.base?.kind === "tool" || alignment.variant?.kind === "tool"
        ? "tool_exception"
        : "output_changed";
    default:
      return "unclassified";
  }
}

function severityFor(
  alignment: AlignedStep,
  base: DiffRunInfo,
  variant: DiffRunInfo,
): DivergenceSeverity {
  if (alignment.status === "response_changed") return "info";
  if (base.mode === "recorded" && variant.mode === "replayed") return "error";
  if (variant.mode === "forked") return "expected";
  return "info";
}

function summarizeRun(events: EventRecord[], steps: Step[]): RunMetrics {
  let totalTokens = 0;
  for (const step of steps) {
    const usage = step.usage;
    if (usage === undefined) continue;
    const total = usage.total_tokens;
    if (typeof total === "number") {
      totalTokens += total;
      continue;
    }
    const input = usage.prompt_tokens ?? usage.input_tokens;
    const output = usage.completion_tokens ?? usage.output_tokens;
    if (typeof input === "number") totalTokens += input;
    if (typeof output === "number") totalTokens += output;
  }

  const end = [...events].reverse().find((event) => event.type === "run.end");
  const lastLlm = [...steps].reverse().find((step) => step.kind === "llm" && step.response !== undefined);

  return {
    llmCalls: steps.filter((step) => step.kind === "llm").length,
    toolCalls: steps.filter((step) => step.kind === "tool").length,
    totalTokens,
    ...(end?.durationMs === undefined ? {} : { durationMs: end.durationMs }),
    ...(lastLlm === undefined ? {} : withFinalAnswer(lastLlm.response)),
  };
}

function withFinalAnswer(response: unknown): { finalAnswer?: string } {
  const content = responseContent(response);
  return content === undefined ? {} : { finalAnswer: content };
}

export function responseContent(response: unknown): string | undefined {
  const record = asRecord(response);
  const choices = Array.isArray(record.choices) ? record.choices : undefined;
  const first = choices === undefined ? undefined : asRecord(choices[0]);
  const message = first === undefined ? undefined : asRecord(first.message);
  return message !== undefined && typeof message.content === "string" ? message.content : undefined;
}

export function diffFields(base: unknown, variant: unknown, limit = 20): FieldChange[] {
  const changes: FieldChange[] = [];
  walkDiff(base, variant, "$", changes, limit);
  return changes;
}

function walkDiff(
  base: unknown,
  variant: unknown,
  path: string,
  changes: FieldChange[],
  limit: number,
): void {
  if (changes.length >= limit || Object.is(base, variant)) return;

  if (Array.isArray(base) && Array.isArray(variant)) {
    const count = Math.max(base.length, variant.length);
    for (let index = 0; index < count; index += 1) {
      walkDiff(base[index], variant[index], `${path}[${index}]`, changes, limit);
      if (changes.length >= limit) return;
    }
    return;
  }

  const baseRecord = asRecordOrUndefined(base);
  const variantRecord = asRecordOrUndefined(variant);
  if (baseRecord !== undefined && variantRecord !== undefined) {
    const keys = new Set([...Object.keys(baseRecord), ...Object.keys(variantRecord)]);
    for (const key of [...keys].sort()) {
      walkDiff(baseRecord[key], variantRecord[key], `${path}.${key}`, changes, limit);
      if (changes.length >= limit) return;
    }
    return;
  }

  changes.push({ path, base, variant });
}

function nextOrdinal(ordinals: Map<string, number>, key: string): number {
  const next = ordinals.get(key) ?? 0;
  ordinals.set(key, next + 1);
  return next;
}

function stepError(payload: unknown, nameField = "name"): StepError {
  const record = asRecord(payload);
  return {
    name: typeof record[nameField] === "string" ? record[nameField] : "Error",
    message: typeof record.message === "string" ? record.message : "",
  };
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {};
}

function asRecordOrUndefined(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
