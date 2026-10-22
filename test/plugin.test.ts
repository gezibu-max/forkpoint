import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const pluginRoot = path.join(repoRoot, "plugin");

function readJson(relative: string): Record<string, unknown> {
  const file = path.join(repoRoot, relative);
  expect(existsSync(file), `${relative} is missing`).toBe(true);
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

function readText(relative: string): string {
  const file = path.join(repoRoot, relative);
  expect(existsSync(file), `${relative} is missing`).toBe(true);
  return readFileSync(file, "utf8");
}

const COMMANDS = ["record", "replay", "verify", "diff", "fork", "runs", "observe"];
const HOOK_EVENTS = [
  "SessionStart",
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "SessionEnd",
];

describe("Claude Code plugin package", () => {
  it("publishes a marketplace whose plugin source is the plugin directory", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json");
    expect(marketplace.name).toBe("forkpoint");
    expect(marketplace.owner).toEqual({ name: "gezibu-max" });
    expect(Array.isArray(marketplace.plugins)).toBe(true);

    const plugins = marketplace.plugins as Array<Record<string, unknown>>;
    expect(plugins).toHaveLength(1);
    const entry = plugins[0]!;
    expect(entry.name).toBe("forkpoint");
    expect(entry.source).toBe("./plugin");
    expect(entry.license).toBe("Apache-2.0");
    expect(existsSync(path.join(repoRoot, String(entry.source)))).toBe(true);
  });

  it("declares a matching plugin manifest", () => {
    const marketplace = readJson(".claude-plugin/marketplace.json");
    const entry = (marketplace.plugins as Array<Record<string, unknown>>)[0]!;
    const manifest = readJson("plugin/.claude-plugin/plugin.json");

    expect(manifest.name).toBe("forkpoint");
    expect(manifest.version).toBe(entry.version);
    expect(manifest.license).toBe("Apache-2.0");
    expect(manifest.homepage).toBe("https://github.com/gezibu-max/forkpoint");
  });

  it("ships prompt commands that call the wrapper", () => {
    for (const name of COMMANDS) {
      const body = readText(`plugin/commands/${name}.md`);
      expect(body.startsWith("---\n"), `${name} is missing frontmatter`).toBe(true);
      expect(body).toMatch(/\ndescription: .+/);
      expect(body).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs");
      expect(body).toContain("$ARGUMENTS");
    }
  });

  it("registers observe hooks only, with a timeout", () => {
    const config = readJson("plugin/hooks/hooks.json");
    const hooks = config.hooks as Record<string, unknown>;
    expect(Object.keys(hooks).sort()).toEqual([...HOOK_EVENTS].sort());

    for (const event of HOOK_EVENTS) {
      const groups = hooks[event] as Array<Record<string, unknown>>;
      expect(groups).toHaveLength(1);
      expect(groups[0]!.matcher).toBe("");
      const handlers = groups[0]!.hooks as Array<Record<string, unknown>>;
      expect(handlers).toHaveLength(1);
      expect(handlers[0]!.type).toBe("command");
      expect(String(handlers[0]!.command)).toContain("${CLAUDE_PLUGIN_ROOT}/scripts/observe.mjs");
      expect(Number(handlers[0]!.timeout)).toBeGreaterThan(0);
    }
  });

  it("keeps hook recording opt-in and non-blocking", () => {
    const script = readText("plugin/scripts/observe.mjs");
    expect(script).toContain('process.env.FORKPOINT_OBSERVE !== "1"');
    expect(script).toContain("process.exit(0)");
    expect(script).not.toContain("process.exit(2)");
  });

  it("resolves the CLI from the project or an explicit override", () => {
    const resolver = readText("plugin/scripts/resolve-cli.mjs");
    expect(resolver).toContain("FORKPOINT_CLI");
    expect(resolver).toContain('"node_modules", "forkpoint"');
    expect(resolver).toContain('"dist", "cli", "index.js"');
    expect(resolver).toContain('"lib", "cli.mjs"');

    const wrapper = readText("plugin/scripts/cli.mjs");
    expect(wrapper).toContain("process.argv.slice(2)");
    expect(wrapper).toContain("stdio: \"inherit\"");
  });

  it("ships a runnable bundled CLI for marketplace installs", () => {
    const bundle = path.join(pluginRoot, "lib", "cli.mjs");
    expect(existsSync(bundle), "plugin/lib/cli.mjs is missing; run npm run build:plugin").toBe(true);

    const result = spawnSync(process.execPath, [bundle, "--help"], {
      encoding: "utf8",
      timeout: 30_000,
    });
    expect(result.status, result.stderr).toBe(0);
    expect(result.stdout).toContain("Usage: forkpoint");
    expect(result.stdout).toContain("observe");
  });

  it("documents the two modes without overclaiming observe replay", () => {
    const readme = readText("plugin/README.md");
    expect(readme).toContain("Observe");
    expect(readme).toContain("not replayable");
    expect(readme).toContain("FORKPOINT_OBSERVE=1");

    const skill = readText("plugin/skills/forkpoint/SKILL.md");
    expect(skill.startsWith("---\n")).toBe(true);
    expect(skill).toMatch(/\nname: forkpoint/);
    expect(skill).toContain("Observed runs are not replayable");
  });

  it("ships every file referenced by the plugin manifest", () => {
    expect(existsSync(path.join(pluginRoot, ".claude-plugin", "plugin.json"))).toBe(true);
    expect(existsSync(path.join(pluginRoot, "README.md"))).toBe(true);
    for (const name of COMMANDS) {
      expect(existsSync(path.join(pluginRoot, "commands", `${name}.md`))).toBe(true);
    }
    for (const name of ["cli.mjs", "observe.mjs", "resolve-cli.mjs"]) {
      expect(existsSync(path.join(pluginRoot, "scripts", name))).toBe(true);
    }
    expect(existsSync(path.join(pluginRoot, "lib", "cli.mjs"))).toBe(true);
  });
});
