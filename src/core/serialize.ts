import { NonSerializableError } from "./errors.js";

export function toJsonText(value: unknown, path = "$"): string {
  try {
    const text = JSON.stringify(value);
    if (text === undefined) throw new NonSerializableError(path, "value serialized to undefined");
    return text;
  } catch (error) {
    if (error instanceof NonSerializableError) throw error;
    const detail = error instanceof Error ? error.message : String(error);
    throw new NonSerializableError(path, detail, { cause: error });
  }
}

export function parseJsonText<T = unknown>(text: string): T {
  return JSON.parse(text) as T;
}
