import { describe, expect, it } from "vitest";
import { UsageError } from "../src/core/errors.js";
import {
  createRedactor,
  deserializeRedactionRules,
  readStoredRedactionRules,
  scanSecrets,
  serializeRedactionRules,
  type RedactionRule,
} from "../src/core/redact.js";

function stored(rules: RedactionRule[]) {
  return serializeRedactionRules(rules);
}

describe("redaction", () => {
  it("applies custom rules in order without mutating the input", () => {
    const input = {
      message: "customer int_abc123",
      nested: ["int_zzz999", 42],
      name: "keep",
    };
    const redactor = createRedactor(
      stored([{ name: "internal-id", pattern: /int_[a-z0-9]+/g, replacement: "[INTERNAL]" }]),
    );

    const output = redactor(input);

    expect(output).toEqual({
      message: "customer [INTERNAL]",
      nested: ["[INTERNAL]", 42],
      name: "keep",
    });
    expect(input.message).toBe("customer int_abc123");
  });

  it("redacts sensitive headers everywhere and sensitive env keys only in env scope", () => {
    const redactor = createRedactor([]);

    expect(
      redactor({
        headers: { Authorization: "Bearer sk-secret", "x-api-key": "abc" },
        cookie: "session=1",
        body: "ok",
      }),
    ).toEqual({
      headers: { Authorization: "[REDACTED]", "x-api-key": "[REDACTED]" },
      cookie: "[REDACTED]",
      body: "ok",
    });

    expect(
      redactor(
        { OPENAI_API_KEY: "sk-secret", NODE_ENV: "test", api_token: "t" },
        { redactEnvKeys: true },
      ),
    ).toEqual({ OPENAI_API_KEY: "[REDACTED]", NODE_ENV: "test", api_token: "[REDACTED]" });

    expect(redactor({ OPENAI_API_KEY: "sk-secret" })).toEqual({ OPENAI_API_KEY: "sk-secret" });
  });

  it("scans known token patterns and reports JSON paths", () => {
    const matches = scanSecrets({
      event: { payload: { token: "sk-test-planted-123456", other: "ghp_abcdefgh12345678" } },
      aws: "AKIAABCDEFGHIJKLMNOP",
      slack: "xoxb-1234567890-abcdef",
    });

    expect(matches).toEqual([
      { pattern: "openai-key", field: "$.event.payload.token" },
      { pattern: "github-token", field: "$.event.payload.other" },
      { pattern: "aws-access-key", field: "$.aws" },
      { pattern: "slack-token", field: "$.slack" },
    ]);
  });

  it("rejects invalid rules and invalid stored definitions", () => {
    expect(() =>
      serializeRedactionRules([{ name: "", pattern: /x/g, replacement: "" }]),
    ).toThrow(UsageError);
    expect(() =>
      serializeRedactionRules([
        { name: "bad", pattern: "x" as unknown as RegExp, replacement: "" },
      ]),
    ).toThrow(UsageError);
    expect(() =>
      serializeRedactionRules([{ name: "bad", pattern: /x/g, replacement: 1 as unknown as string }]),
    ).toThrow(UsageError);
    expect(() =>
      deserializeRedactionRules([{ name: "bad", source: "(", flags: "g", replacement: "" }]),
    ).toThrow(UsageError);
    expect(() => deserializeRedactionRules({})).toThrow(UsageError);
  });

  it("round-trips rules through the stored config format", () => {
    const rules = stored([{ name: "internal-id", pattern: /int_[a-z]+/gi, replacement: "[X]" }]);

    expect(rules).toEqual([
      { name: "internal-id", source: "int_[a-z]+", flags: "gi", replacement: "[X]" },
    ]);
    expect(readStoredRedactionRules({ redactionPatterns: rules })).toEqual(rules);
    expect(readStoredRedactionRules({})).toEqual([]);
    expect(readStoredRedactionRules(undefined)).toEqual([]);
  });

  it("always applies a rule globally, even when the source pattern was not global", () => {
    const redactor = createRedactor(
      stored([{ name: "id", pattern: /int_[a-z]+/, replacement: "[X]" }]),
    );
    expect(redactor("int_abc int_def")).toBe("[X] [X]");
  });
});
