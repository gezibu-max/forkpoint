import { UsageError } from "./errors.js";

export interface RedactionRule {
  name: string;
  pattern: RegExp;
  replacement: string;
}

export interface StoredRedactionRule {
  name: string;
  source: string;
  flags: string;
  replacement: string;
}

export interface SecretMatch {
  pattern: string;
  field: string;
}

export const REDACTED = "[REDACTED]";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "api-key",
  "x-api-key",
  "cookie",
  "set-cookie",
]);

const SENSITIVE_ENV_SUFFIX = /(_KEY|_TOKEN|_SECRET|_PASSWORD)$/i;

export const SECRET_PATTERNS = [
  { name: "openai-key", pattern: /sk-[A-Za-z0-9_-]{8,}/g },
  { name: "github-token", pattern: /ghp_[A-Za-z0-9]{8,}/g },
  { name: "aws-access-key", pattern: /AKIA[0-9A-Z]{12,}/g },
  { name: "slack-token", pattern: /xox[baprs]-[A-Za-z0-9-]{8,}/g },
] as const;

export function validateRedactionRules(rules: readonly RedactionRule[]): void {
  if (!Array.isArray(rules)) {
    throw new UsageError("redact must be an array of { name, pattern, replacement } rules.");
  }

  rules.forEach((rule, index) => {
    if (typeof rule !== "object" || rule === null) {
      throw new UsageError(`redact[${index}] must be an object.`);
    }
    if (typeof rule.name !== "string" || rule.name.trim() === "") {
      throw new UsageError(`redact[${index}].name must be a non-empty string.`);
    }
    if (!(rule.pattern instanceof RegExp)) {
      throw new UsageError(`redact rule "${rule.name}" must use a RegExp pattern.`);
    }
    if (typeof rule.replacement !== "string") {
      throw new UsageError(`redact rule "${rule.name}" must have a string replacement.`);
    }
    try {
      new RegExp(rule.pattern.source, rule.pattern.flags);
    } catch (error) {
      throw new UsageError(
        `redact rule "${rule.name}" is not a valid regular expression: ${errorMessage(error)}`,
      );
    }
  });
}

export function serializeRedactionRules(rules: readonly RedactionRule[]): StoredRedactionRule[] {
  validateRedactionRules(rules);
  return rules.map((rule) => ({
    name: rule.name,
    source: rule.pattern.source,
    flags: rule.pattern.flags,
    replacement: rule.replacement,
  }));
}

export function deserializeRedactionRules(
  raw: unknown,
  context = "stored redaction rules",
): StoredRedactionRule[] {
  if (raw === undefined || raw === null) return [];
  if (!Array.isArray(raw)) {
    throw new UsageError(`${context} must be an array.`);
  }

  return raw.map((entry, index) => {
    if (typeof entry !== "object" || entry === null) {
      throw new UsageError(`${context}[${index}] must be an object.`);
    }
    const record = entry as Record<string, unknown>;
    const name = record.name;
    const source = record.source;
    const flags = record.flags ?? "";
    const replacement = record.replacement;

    if (typeof name !== "string" || name.trim() === "") {
      throw new UsageError(`${context}[${index}].name must be a non-empty string.`);
    }
    if (typeof source !== "string" || source === "") {
      throw new UsageError(`${context}[${index}] (${name}).source must be a non-empty string.`);
    }
    if (typeof flags !== "string") {
      throw new UsageError(`${context}[${index}] (${name}).flags must be a string.`);
    }
    if (typeof replacement !== "string") {
      throw new UsageError(`${context}[${index}] (${name}).replacement must be a string.`);
    }
    try {
      new RegExp(source, flags);
    } catch (error) {
      throw new UsageError(
        `${context}[${index}] (${name}) is not a valid regular expression: ${errorMessage(error)}`,
      );
    }

    return { name, source, flags, replacement };
  });
}

export function readStoredRedactionRules(config: unknown): StoredRedactionRule[] {
  if (typeof config !== "object" || config === null) return [];
  const raw = (config as Record<string, unknown>).redactionPatterns;
  return deserializeRedactionRules(raw);
}

export function mergeRedactionRules(
  base: readonly StoredRedactionRule[],
  override: readonly StoredRedactionRule[],
): StoredRedactionRule[] {
  if (base.length === 0) return [...override];
  if (override.length === 0) return [...base];

  const merged = new Map<string, StoredRedactionRule>();
  for (const rule of base) merged.set(rule.name, rule);
  for (const rule of override) merged.set(rule.name, rule);
  return [...merged.values()];
}

export interface RedactionOptions {
  redactEnvKeys?: boolean;
}

export function createRedactor(
  rules: readonly StoredRedactionRule[],
): (value: unknown, options?: RedactionOptions) => unknown {
  const compiled = rules.map((rule) => ({
    pattern: globalPattern(rule),
    replacement: rule.replacement,
  }));

  return (value, options = {}) =>
    redactNode(value, compiled, options.redactEnvKeys === true);
}

export function redactValue(
  value: unknown,
  rules: readonly StoredRedactionRule[],
  options: RedactionOptions = {},
): unknown {
  return createRedactor(rules)(value, options);
}

export function scanSecrets(value: unknown): SecretMatch[] {
  const matches: SecretMatch[] = [];
  scanNode(value, "$", matches);
  return matches;
}

interface CompiledRule {
  pattern: RegExp;
  replacement: string;
}

function globalPattern(rule: StoredRedactionRule): RegExp {
  const flags = `${rule.flags.replace(/[gy]/g, "")}g`;
  return new RegExp(rule.source, flags);
}

function redactNode(value: unknown, rules: readonly CompiledRule[], redactEnvKeys: boolean): unknown {
  if (typeof value === "string") return applyRules(value, rules);
  if (Array.isArray(value)) {
    return value.map((item) => redactNode(item, rules, redactEnvKeys));
  }
  if (typeof value !== "object" || value === null) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (SENSITIVE_HEADERS.has(key.toLowerCase()) || (redactEnvKeys && SENSITIVE_ENV_SUFFIX.test(key))) {
      output[key] = REDACTED;
    } else {
      output[key] = redactNode(child, rules, redactEnvKeys);
    }
  }
  return output;
}

function applyRules(value: string, rules: readonly CompiledRule[]): string {
  let result = value;
  for (const rule of rules) result = result.replace(rule.pattern, rule.replacement);
  return result;
}

function scanNode(value: unknown, path: string, matches: SecretMatch[]): void {
  if (typeof value === "string") {
    for (const candidate of SECRET_PATTERNS) {
      candidate.pattern.lastIndex = 0;
      if (candidate.pattern.test(value)) {
        matches.push({ pattern: candidate.name, field: path });
      }
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanNode(item, `${path}[${index}]`, matches));
    return;
  }
  if (typeof value !== "object" || value === null) return;

  for (const [key, child] of Object.entries(value)) {
    const segment = /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;
    scanNode(child, `${path}${segment}`, matches);
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
