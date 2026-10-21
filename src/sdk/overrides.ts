import { UsageError } from "../core/errors.js";

export interface ForkOverrides {
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

const ALLOWED_KEYS = new Set(["model", "temperature", "systemPrompt"]);

export function parseForkOverrides(raw: string | undefined): ForkOverrides {
  if (raw === undefined || raw.trim() === "") return {};

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new UsageError(
      `FORKPOINT_OVERRIDES is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return validateForkOverrides(parsed);
}

export function validateForkOverrides(input: unknown): ForkOverrides {
  if (!isRecord(input)) {
    throw new UsageError("Fork overrides must be a JSON object.");
  }
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) {
      throw new UsageError(`Unknown fork override: ${key}. Allowed: model, temperature, systemPrompt.`);
    }
  }

  const overrides: ForkOverrides = {};
  if (input.model !== undefined) {
    if (typeof input.model !== "string" || input.model.trim() === "") {
      throw new UsageError("Fork override model must be a non-empty string.");
    }
    overrides.model = input.model;
  }
  if (input.temperature !== undefined) {
    if (
      typeof input.temperature !== "number" ||
      !Number.isFinite(input.temperature) ||
      input.temperature < 0 ||
      input.temperature > 2
    ) {
      throw new UsageError("Fork override temperature must be a number between 0 and 2.");
    }
    overrides.temperature = input.temperature;
  }
  if (input.systemPrompt !== undefined) {
    if (typeof input.systemPrompt !== "string") {
      throw new UsageError("Fork override systemPrompt must be a string.");
    }
    overrides.systemPrompt = input.systemPrompt;
  }

  return overrides;
}

export function hasForkOverrides(overrides: ForkOverrides): boolean {
  return (
    overrides.model !== undefined ||
    overrides.temperature !== undefined ||
    overrides.systemPrompt !== undefined
  );
}

export function applyForkOverrides(
  api: "chat.completions" | "responses",
  request: Record<string, unknown>,
  overrides: ForkOverrides,
): Record<string, unknown> {
  const next = { ...request };

  if (overrides.model !== undefined) next.model = overrides.model;
  if (overrides.temperature !== undefined) next.temperature = overrides.temperature;
  if (overrides.systemPrompt !== undefined) {
    if (api === "chat.completions") {
      const messages = Array.isArray(request.messages) ? request.messages : [];
      next.messages = [
        { role: "system", content: overrides.systemPrompt },
        ...messages.filter((message) => !isSystemMessage(message)),
      ];
    } else {
      next.instructions = overrides.systemPrompt;
      if (Array.isArray(request.input)) {
        next.input = request.input.filter((message) => !isSystemMessage(message));
      }
    }
  }

  return next;
}

function isSystemMessage(value: unknown): boolean {
  return isRecord(value) && value.role === "system";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
