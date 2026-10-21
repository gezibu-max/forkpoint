import { randomBytes } from "node:crypto";
import { realNow } from "./clock.js";

const ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz";

export function createRunId(now: number = realNow()): string {
  return `r_${encodeTime(now)}${encodeRandom()}`;
}

export function isRunId(value: string): boolean {
  return /^r_[0-9a-hjkmnp-tv-z]{26}$/.test(value);
}

function encodeTime(now: number): string {
  let remaining = Math.max(0, Math.trunc(now));
  let out = "";
  for (let index = 0; index < 10; index += 1) {
    out = ALPHABET[remaining % 32]! + out;
    remaining = Math.floor(remaining / 32);
  }
  return out;
}

function encodeRandom(): string {
  const bytes = randomBytes(16);
  let out = "";
  for (const byte of bytes) {
    out += ALPHABET[byte & 31]!;
  }
  return out;
}
