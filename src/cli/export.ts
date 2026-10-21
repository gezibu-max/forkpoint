import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { RunNotFoundError, UsageError } from "../core/errors.js";
import type { EventRecord } from "../core/events.js";
import {
  createRedactor,
  readStoredRedactionRules,
  scanSecrets,
  type SecretMatch,
  type StoredRedactionRule,
} from "../core/redact.js";
import {
  openExistingCassette,
  type FixtureRow,
  type RunRow,
} from "../store/cassette.js";
import { printJson } from "./output.js";

export interface ExportCommandOptions {
  runId: string;
  store: string;
  redact: boolean;
  output?: string;
  json: boolean;
  debug: boolean;
}

type ExportRecordKind = "meta" | "event" | "fixture";

export interface ExportFinding extends SecretMatch {
  line: number;
  record: ExportRecordKind;
  ref: string;
}

export interface ExportDocument {
  lines: string[];
  findings: ExportFinding[];
  events: number;
  fixtures: number;
  rules: string[];
}

interface ExportRecord {
  record: ExportRecordKind;
  ref: string;
  value: unknown;
}

export function buildExport(
  run: RunRow,
  events: readonly EventRecord[],
  fixtures: readonly FixtureRow[],
  options: { now?: Date } = {},
): ExportDocument {
  const rules = storedRedactionRules(run);
  const redactor = createRedactor(rules);
  const records: ExportRecord[] = [
    {
      record: "meta",
      ref: "run",
      value: {
        kind: "meta",
        format: "forkpoint-export",
        formatVersion: 1,
        exportedAt: (options.now ?? new Date()).toISOString(),
        redacted: true,
        replayable: false,
        notice: "Redacted export for sharing and inspection. It is not a replayable cassette.",
        run: redactRun(run, redactor),
        redaction: { builtin: true, rules: rules.map((rule) => rule.name) },
      },
    },
  ];

  for (const event of events) {
    records.push({
      record: "event",
      ref: `seq ${event.seq}`,
      value: {
        kind: "event",
        event: {
          ...event,
          payload:
            event.type === "env.snapshot"
              ? redactor(event.payload, { redactEnvKeys: true })
              : redactor(event.payload),
        },
      },
    });
  }

  for (const fixture of fixtures) {
    records.push({
      record: "fixture",
      ref: `${fixture.kind}/${fixture.fixtureKey.slice(0, 12)}/${fixture.occurrence}`,
      value: {
        kind: "fixture",
        fixture: {
          kind: fixture.kind,
          fixtureKey: fixture.fixtureKey,
          occurrence: fixture.occurrence,
          ...(fixture.callsite === undefined ? {} : { callsite: fixture.callsite }),
          ...(fixture.requestJson === undefined
            ? {}
            : { request: redactor(parseJson(fixture.requestJson)) }),
          ...(fixture.response === undefined ? {} : { response: redactor(fixture.response) }),
          ...(fixture.meta === undefined ? {} : { meta: redactor(fixture.meta) }),
        },
      },
    });
  }

  const lines: string[] = [];
  const findings: ExportFinding[] = [];
  records.forEach((entry, index) => {
    lines.push(JSON.stringify(entry.value));
    for (const match of scanSecrets(entry.value)) {
      findings.push({
        ...match,
        line: index + 1,
        record: entry.record,
        ref: entry.ref,
      });
    }
  });

  return {
    lines,
    findings,
    events: events.length,
    fixtures: fixtures.length,
    rules: rules.map((rule) => rule.name),
  };
}

export async function exportCommand(options: ExportCommandOptions): Promise<number> {
  if (!options.redact) {
    throw new UsageError(
      "export requires --redact; Forkpoint does not write raw cassettes to shareable files.",
    );
  }
  if (options.json && options.output === undefined) {
    throw new UsageError("--json requires -o <file>; JSONL is written to stdout otherwise.");
  }

  const store = path.resolve(options.store);
  const cassette = openExistingCassette(store);
  if (cassette === undefined) throw new RunNotFoundError(options.runId, store);

  const cassetteFile = path.resolve(cassette.file);
  let document: ExportDocument;
  try {
    const run = cassette.getRun(options.runId);
    if (run === undefined) throw new RunNotFoundError(options.runId, store);
    if (run.status === "recording") {
      throw new UsageError(`Run ${run.id} is still recording; export after it finishes.`);
    }
    document = buildExport(run, cassette.getEvents(run.id), cassette.listFixtures(run.id));
  } finally {
    cassette.close();
  }

  const jsonl = `${document.lines.join("\n")}\n`;

  if (options.output === undefined) {
    process.stdout.write(jsonl);
    process.stderr.write(`${renderSummary(document, undefined)}\n`);
    return 0;
  }

  const target = path.resolve(options.output);
  if (target === cassetteFile) {
    throw new UsageError("Refusing to overwrite the cassette file; choose another -o path.");
  }
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, jsonl, "utf8");

  if (options.json) {
    printJson({
      ok: true,
      runId: options.runId,
      output: target,
      redacted: true,
      replayable: false,
      events: document.events,
      fixtures: document.fixtures,
      rules: document.rules,
      findings: document.findings,
    });
  } else {
    process.stdout.write(`${renderSummary(document, target)}\n`);
  }
  return 0;
}

function storedRedactionRules(run: RunRow): StoredRedactionRule[] {
  if (run.configJson === undefined) return [];
  let config: unknown;
  try {
    config = JSON.parse(run.configJson) as unknown;
  } catch {
    throw new UsageError(`Run ${run.id} has unreadable config; cannot apply its redaction rules.`);
  }
  return readStoredRedactionRules(config);
}

function redactRun(
  run: RunRow,
  redactor: ReturnType<typeof createRedactor>,
): Record<string, unknown> {
  return {
    id: run.id,
    name: redactor(run.name),
    createdAt: run.createdAt,
    ...(run.parentRunId === undefined ? {} : { parentRunId: run.parentRunId }),
    mode: run.mode,
    status: run.status,
    ...(run.command === undefined ? {} : { command: redactor(run.command) }),
    ...(run.cwd === undefined ? {} : { cwd: redactor(run.cwd) }),
    ...(run.gitSha === undefined ? {} : { gitSha: run.gitSha }),
    ...(run.nodeVersion === undefined ? {} : { nodeVersion: run.nodeVersion }),
    ...(run.platform === undefined ? {} : { platform: run.platform }),
    ...(run.seed === undefined ? {} : { seed: run.seed }),
    ...(run.metricsJson === undefined ? {} : { metrics: redactor(parseJson(run.metricsJson)) }),
    ...(run.envJson === undefined
      ? {}
      : { env: redactor(parseJson(run.envJson), { redactEnvKeys: true }) }),
  };
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return text;
  }
}

function renderSummary(document: ExportDocument, output: string | undefined): string {
  const destination = output === undefined ? "stdout" : output;
  const lines = [
    `Exported ${document.events} events and ${document.fixtures} fixtures to ${destination}.`,
    `Redacted: built-in header/env rules${
      document.rules.length === 0 ? "" : ` + custom rules: ${document.rules.join(", ")}`
    }.`,
    "The exported JSONL is for sharing and inspection; it is not replayable.",
  ];

  if (document.findings.length === 0) {
    lines.push("Secret scan: no known token patterns found.");
    return lines.join("\n");
  }

  lines.push(`Secret scan: ${document.findings.length} potential secret(s) remain:`);
  for (const finding of document.findings) {
    lines.push(
      `  line ${finding.line} ${finding.record} ${finding.ref} ${finding.field} matched ${finding.pattern}`,
    );
  }
  return lines.join("\n");
}

interface ParsedExportArguments {
  runId?: string;
  store?: string;
  redact?: boolean;
  output?: string;
  json?: boolean;
  debug?: boolean;
}

export function parseExportArguments(args: string[]): ParsedExportArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";

  const parsed: ParsedExportArguments = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--redact") {
      parsed.redact = true;
      continue;
    }
    if (argument === "--json") {
      parsed.json = true;
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
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown export option: ${argument}`);
    }
    positional.push(argument);
  }

  if (positional.length > 1) throw new UsageError(`Unexpected argument: ${positional[1]}`);
  parsed.runId = positional[0];
  return parsed;
}

export function toExportOptions(
  parsed: ParsedExportArguments,
  storeFromOption?: string,
): ExportCommandOptions {
  if (parsed.runId === undefined) {
    throw new UsageError(
      "export requires a run id: forkpoint export <run_id> --redact -o <file>",
    );
  }

  return {
    runId: parsed.runId,
    store: parsed.store ?? storeFromOption ?? process.env.FORKPOINT_STORE ?? ".forkpoint",
    redact: parsed.redact === true,
    ...(parsed.output === undefined ? {} : { output: parsed.output }),
    json: parsed.json === true,
    debug: parsed.debug === true,
  };
}

export function exportHelp(): string {
  return [
    "Usage: forkpoint export <run_id> --redact [-o <file>] [--store <dir>] [--json]",
    "",
    "Write a shareable JSONL export: one meta line, then every event, then every fixture.",
    "Built-in header/env redaction is always applied, followed by rules configured via the",
    "SDK's redact option. The file is scanned for known token patterns afterwards.",
    "",
    "The export is redacted for sharing and is not replayable. Raw export is not supported.",
    "",
    "Options:",
    "  --redact            Required; acknowledges that the export is redacted, not raw",
    "  -o, --output <file> Write JSONL to a file (default: stdout)",
    "  --store <dir>       Cassette directory (default: .forkpoint)",
    "  --json              Print a machine-readable summary (requires -o)",
    "  --debug             Print stack traces on failure",
  ].join("\n");
}

function valueOf(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined) throw new UsageError(`${flag} requires a value.`);
  return value;
}
