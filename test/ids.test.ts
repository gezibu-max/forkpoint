import { describe, expect, it } from "vitest";
import { createRunId, isRunId } from "../src/core/ulid.js";

describe("run ids", () => {
  it("creates a sortable 26-character Crockford Base32 ulid", () => {
    const id = createRunId(1_700_000_000_000);
    expect(id).toMatch(/^r_[0-9a-hjkmnp-tv-z]{26}$/);
    expect(isRunId(id)).toBe(true);
    expect(createRunId(1_700_000_000_001) > id).toBe(true);
  });

  it("does not collide across 1,000 ids", () => {
    const ids = new Set(Array.from({ length: 1_000 }, () => createRunId()));
    expect(ids.size).toBe(1_000);
  });
});
