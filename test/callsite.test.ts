import { describe, expect, it } from "vitest";
import { captureCallsite } from "../src/core/callsite.js";

describe("captureCallsite", () => {
  it("returns this test file relative to cwd with forward slashes", () => {
    const callsite = captureCallsite();
    expect(callsite).toMatch(/^test\/callsite\.test\.ts:\d+:\d+$/);
    expect(callsite).not.toContain("\\");
  });

  it("uses an explicit label without touching the stack", () => {
    expect(captureCallsite({ label: "my-label" })).toBe("my-label");
  });
});
