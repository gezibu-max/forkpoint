import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const portable = new URL("../.agents/skills/forkpoint/SKILL.md", import.meta.url);
const pluginCopy = new URL("../plugin/skills/forkpoint/SKILL.md", import.meta.url);

function read(url: URL): string {
  return readFileSync(url, "utf8");
}

function frontmatter(source: string): string {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) throw new Error("missing YAML frontmatter");
  return match[1]!;
}

describe("Agent Skills packaging", () => {
  it("keeps the portable and plugin copies identical", () => {
    expect(read(portable)).toBe(read(pluginCopy));
  });

  it("uses a spec-valid name, description, and compatibility field", () => {
    const front = frontmatter(read(portable));
    expect(front).toMatch(/^name: forkpoint$/m);

    const description = /^description: (.+)$/m.exec(front)?.[1] ?? "";
    expect(description.length).toBeGreaterThan(0);
    expect(description.length).toBeLessThanOrEqual(1024);

    const compatibility = /^compatibility: (.+)$/m.exec(front)?.[1] ?? "";
    expect(compatibility.length).toBeGreaterThan(0);
    expect(compatibility.length).toBeLessThanOrEqual(500);
  });

  it("states the host boundary and the portable CLI fallback", () => {
    const source = read(portable);
    expect(source).toContain("Claude Code plugin only");
    expect(source).toContain("Other Agent Skills hosts do not expose the same hook payloads");
    expect(source).toContain("npx --yes forkpoint");
  });
});
