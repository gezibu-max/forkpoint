import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  buildDiff,
  type AlignedStep,
  type DiffReport,
  type Step,
} from "../core/diff.js";
import { RunNotFoundError, UsageError } from "../core/errors.js";
import { openExistingCassette, type RunRow } from "../store/cassette.js";

export interface DiffCommandOptions {
  baseId: string;
  variantId: string;
  store: string;
  format: "md" | "json";
  output?: string;
  debug: boolean;
}

export async function diffCommand(options: DiffCommandOptions): Promise<number> {
  if (options.baseId === options.variantId) {
    throw new UsageError("Cannot diff a run against itself.");
  }

  const store = path.resolve(options.store);
  const cassette = openExistingCassette(store);
  if (cassette === undefined) throw new RunNotFoundError(options.baseId, store);

  let report: DiffReport;
  try {
    const base = cassette.getRun(options.baseId);
    if (base === undefined) throw new RunNotFoundError(options.baseId, store);
    const variant = cassette.getRun(options.variantId);
    if (variant === undefined) throw new RunNotFoundError(options.variantId, store);

    report = buildDiff(
      runInfo(base),
      runInfo(variant),
      cassette.getEvents(base.id),
      cassette.getEvents(variant.id),
    );
  } finally {
    cassette.close();
  }

  const output = options.format === "json" ? renderJson(report) : renderMarkdown(report);
  if (options.output === undefined) {
    process.stdout.write(output);
    return 0;
  }

  const target = path.resolve(options.output);
  writeFileSync(target, output, "utf8");
  process.stdout.write(`Wrote ${target}\n`);
  return 0;
}

function runInfo(run: RunRow) {
  return { id: run.id, name: run.name, mode: run.mode, status: run.status };
}

export function renderMarkdown(report: DiffReport): string {
  const lines: string[] = [
    "# Forkpoint diff",
    "",
    `- Base: \`${report.base.id}\` (${report.base.mode}, ${report.base.status}) — ${report.base.name}`,
    `- Variant: \`${report.variant.id}\` (${report.variant.mode}, ${report.variant.status}) — ${report.variant.name}`,
    `- Alignment: ${report.alignmentStrategy}`,
    "",
    "## First divergence",
    "",
  ];

  const divergence = report.firstDivergence;
  if (divergence === undefined) {
    lines.push(`No behavioral divergence across ${report.alignments.length} aligned steps.`, "");
  } else {
    lines.push(
      `- Step: ${divergence.index} (${describeStep(divergence.base ?? divergence.variant!)})`,
      `- Callsite: \`${divergence.base?.callsite ?? divergence.variant?.callsite ?? "unknown"}\``,
      `- Status: ${divergence.status}`,
      `- Category: ${divergence.category ?? "unclassified"}`,
      `- Severity: ${divergence.severity ?? "info"}`,
      "",
    );

    const fields = divergence.fields ?? [];
    if (fields.length > 0) {
      lines.push("| Field | Base | Variant |", "|---|---|---|");
      for (const field of fields.slice(0, 8)) {
        lines.push(`| \`${field.path}\` | ${cell(field.base)} | ${cell(field.variant)} |`);
      }
      if (fields.length > 8) lines.push("", `(${fields.length - 8} more field change(s) omitted.)`);
      lines.push("");
    }
  }

  const finalAnswer = finalAnswerChange(report);
  if (finalAnswer !== undefined) {
    lines.push("## Final output", "", "Base:", "", quote(finalAnswer.base), "", "Variant:", "", quote(finalAnswer.variant), "");
  }

  lines.push("## Timeline", "", "| # | Step | Callsite | Status |", "|---:|---|---|---|");
  for (const alignment of report.alignments) {
    const step = alignment.base ?? alignment.variant!;
    lines.push(
      `| ${alignment.index} | ${describeStep(step)} | \`${escapeCell(step.callsite)}\` | ${alignment.status} |`,
    );
  }
  lines.push("");

  lines.push(
    "## Metrics",
    "",
    "| Metric | Base | Variant |",
    "|---|---:|---:|",
    `| LLM calls | ${report.metrics.base.llmCalls} | ${report.metrics.variant.llmCalls} |`,
    `| Tool calls | ${report.metrics.base.toolCalls} | ${report.metrics.variant.toolCalls} |`,
    `| Tokens | ${report.metrics.base.totalTokens} | ${report.metrics.variant.totalTokens} |`,
    `| Duration | ${formatDuration(report.metrics.base.durationMs)} | ${formatDuration(report.metrics.variant.durationMs)} |`,
    "",
    "## Caveats",
    "",
    ...report.caveats.map((caveat) => `- ${caveat}`),
    "",
  );

  return lines.join("\n");
}

export function renderJson(report: DiffReport): string {
  const payload = {
    base: report.base,
    variant: report.variant,
    alignmentStrategy: report.alignmentStrategy,
    firstDivergence:
      report.firstDivergence === undefined
        ? null
        : serializeAlignment(report.firstDivergence),
    steps: report.alignments.map(serializeAlignment),
    finalOutput: finalAnswerChange(report) ?? null,
    metrics: report.metrics,
    caveats: report.caveats,
  };
  return `${JSON.stringify(payload, null, 2)}\n`;
}

function serializeAlignment(alignment: AlignedStep) {
  return {
    index: alignment.index,
    status: alignment.status,
    ...(alignment.category === undefined ? {} : { category: alignment.category }),
    ...(alignment.severity === undefined ? {} : { severity: alignment.severity }),
    ...(alignment.base === undefined ? {} : { base: serializeStep(alignment.base) }),
    ...(alignment.variant === undefined ? {} : { variant: serializeStep(alignment.variant) }),
    ...(alignment.fields === undefined
      ? {}
      : {
          fields: alignment.fields.map((field) => ({
            path: field.path,
            base: preview(field.base),
            variant: preview(field.variant),
          })),
        }),
  };
}

function serializeStep(step: Step) {
  return {
    kind: step.kind,
    name: step.name,
    callsite: step.callsite,
    seq: step.seq,
    requestHash: step.requestHash,
    ...(step.responseHash === undefined ? {} : { responseHash: step.responseHash }),
    ...(step.error === undefined ? {} : { error: step.error }),
    ...(step.durationMs === undefined ? {} : { durationMs: step.durationMs }),
  };
}

function finalAnswerChange(report: DiffReport): { base: string; variant: string } | undefined {
  const base = report.metrics.base.finalAnswer;
  const variant = report.metrics.variant.finalAnswer;
  if (base === undefined && variant === undefined) return undefined;
  if (base === variant) return undefined;
  return { base: base ?? "(none)", variant: variant ?? "(none)" };
}

function describeStep(step: Step): string {
  return step.kind === "llm" ? `llm ("${step.name}")` : `tool ("${step.name}")`;
}

function cell(value: unknown): string {
  return `\`${escapeCell(preview(value))}\``;
}

function escapeCell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

function preview(value: unknown): string {
  const text = typeof value === "string" ? value : JSON.stringify(value) ?? String(value);
  const singleLine = text.replace(/\s+/g, " ").trim();
  return singleLine.length > 160 ? `${singleLine.slice(0, 159)}…` : singleLine;
}

function quote(value: string): string {
  const truncated = value.length > 600 ? `${value.slice(0, 599)}…` : value;
  return truncated
    .split(/\r?\n/)
    .map((line) => `> ${line}`)
    .join("\n");
}

function formatDuration(value: number | undefined): string {
  return value === undefined ? "-" : `${value.toFixed(1)} ms`;
}

interface ParsedDiffArguments {
  baseId?: string;
  variantId?: string;
  store?: string;
  format?: "md" | "json";
  output?: string;
  debug?: boolean;
}

export function parseDiffArguments(args: string[]): ParsedDiffArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";

  const parsed: ParsedDiffArguments = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      parsed.format = "json";
      continue;
    }
    if (argument === "--debug") {
      parsed.debug = true;
      continue;
    }
    if (argument === "--store") {
      parsed.store = valueOf(args, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument === "-o" || argument === "--output") {
      parsed.output = valueOf(args, index, argument);
      index += 1;
      continue;
    }
    if (argument === "--format") {
      parsed.format = parseFormat(valueOf(args, index, "--format"));
      index += 1;
      continue;
    }
    if (argument.startsWith("--format=")) {
      parsed.format = parseFormat(argument.slice("--format=".length));
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown diff option: ${argument}`);
    }
    positional.push(argument);
  }

  if (positional.length > 2) throw new UsageError(`Unexpected argument: ${positional[2]}`);
  [parsed.baseId, parsed.variantId] = positional;
  return parsed;
}

export function toDiffOptions(
  parsed: ParsedDiffArguments,
  storeFromOption?: string,
): DiffCommandOptions {
  if (parsed.baseId === undefined || parsed.variantId === undefined) {
    throw new UsageError("diff requires two run ids: forkpoint diff <base> <variant>");
  }

  return {
    baseId: parsed.baseId,
    variantId: parsed.variantId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    format: parsed.format ?? "md",
    ...(parsed.output === undefined ? {} : { output: parsed.output }),
    debug: parsed.debug === true,
  };
}

export function diffHelp(): string {
  return [
    "Usage: forkpoint diff <base> <variant> [--store <dir>] [--format md|json] [-o <file>]",
    "",
    "Align LLM and tool steps by callsite and per-callsite ordinal, then report the first",
    "behavioral divergence with field-level changes and token/latency metrics.",
    "",
    "Options:",
    "  --store <dir>       Cassette directory (default: .forkpoint)",
    "  --format md|json    Output format (default: md)",
    "  --json              Shortcut for --format json",
    "  -o, --output <file> Write the report to a file",
    "  --debug             Print stack traces on failure",
  ].join("\n");
}

function valueOf(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined) throw new UsageError(`${flag} requires a value.`);
  return value;
}

function parseFormat(value: string): "md" | "json" {
  if (value === "md" || value === "json") return value;
  throw new UsageError(`--format must be "md" or "json", got "${value}".`);
}
