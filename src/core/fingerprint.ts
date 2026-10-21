import { createHash } from "node:crypto";
import { NonSerializableError } from "./errors.js";

const MAX_DEPTH = 1000;

export function canonicalize(value: unknown): string {
  return encode(value, "$", 0, new WeakSet<object>());
}

export function fingerprintValue(value: unknown): string {
  return sha256(canonicalize(value));
}

export function sha256(input: string | Uint8Array): string {
  return createHash("sha256").update(input).digest("hex");
}

function encode(value: unknown, path: string, depth: number, seen: WeakSet<object>): string {
  if (depth > MAX_DEPTH) {
    throw new NonSerializableError(path, `nesting exceeds ${MAX_DEPTH} levels`);
  }

  if (value === null) return "null";

  switch (typeof value) {
    case "string":
      return JSON.stringify(value);
    case "boolean":
      return value ? "true" : "false";
    case "number":
      return encodeNumber(value, path);
    case "undefined":
      if (path === "$") throw new NonSerializableError(path, "undefined is not a JSON value");
      return "null";
    case "bigint":
      throw new NonSerializableError(path, "BigInt is not a JSON value");
    case "function":
    case "symbol":
      throw new NonSerializableError(path, `${typeof value} is not a JSON value`);
    case "object":
      return encodeObject(value as object, path, depth, seen);
    default:
      throw new NonSerializableError(path, `unsupported type ${typeof value}`);
  }
}

function encodeNumber(value: number, path: string): string {
  if (!Number.isFinite(value)) {
    throw new NonSerializableError(path, `${String(value)} is not a finite number`);
  }
  if (Object.is(value, -0)) return "0";
  return JSON.stringify(value);
}

function encodeObject(value: object, path: string, depth: number, seen: WeakSet<object>): string {
  if (seen.has(value)) {
    throw new NonSerializableError(path, "circular reference");
  }

  const symbols = Object.getOwnPropertySymbols(value).filter((symbol) =>
    Object.prototype.propertyIsEnumerable.call(value, symbol),
  );
  if (symbols.length > 0) {
    throw new NonSerializableError(path, "object has enumerable symbol keys");
  }

  if (Array.isArray(value)) {
    seen.add(value);
    const parts: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      parts.push(encode(value[index], `${path}[${index}]`, depth + 1, seen));
    }
    seen.delete(value);
    return `[${parts.join(",")}]`;
  }

  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    const name = (prototype as { constructor?: { name?: string } }).constructor?.name ?? "unknown";
    throw new NonSerializableError(path, `object of type ${name} is not a plain JSON object`);
  }

  seen.add(value);
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort();
  const parts: string[] = [];
  for (const key of keys) {
    const child = record[key];
    if (child === undefined) continue;
    parts.push(`${JSON.stringify(key)}:${encode(child, childPath(path, key), depth + 1, seen)}`);
  }
  seen.delete(value);
  return `{${parts.join(",")}}`;
}

function childPath(parent: string, key: string): string {
  return /^[A-Za-z_$][A-Za-z0-9_$]*$/.test(key) ? `${parent}.${key}` : `${parent}[${JSON.stringify(key)}]`;
}
