import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));
const pluginRoot = path.resolve(scriptsDir, "..");
const repoRoot = path.resolve(pluginRoot, "..");

function isFile(candidate) {
  return typeof candidate === "string" && existsSync(candidate);
}

export function resolveCliEntry() {
  const configured = process.env.FORKPOINT_CLI;
  if (configured !== undefined && configured !== "") {
    const resolved = path.resolve(configured);
    if (!isFile(resolved)) {
      throw new Error(`FORKPOINT_CLI does not point to a file: ${resolved}`);
    }
    return resolved;
  }

  for (const candidate of [
    path.join(repoRoot, "dist", "cli", "index.js"),
    path.join(pluginRoot, "lib", "cli.mjs"),
    path.join(pluginRoot, "dist", "cli", "index.js"),
  ]) {
    if (isFile(candidate)) return candidate;
  }

  const installed = findInstalledCli(process.cwd());
  if (installed !== undefined) return installed;

  throw new Error(
    "cannot find the forkpoint CLI. Run `npm run build` in the forkpoint repository, install a published forkpoint package in this project, or set FORKPOINT_CLI to the CLI entry.",
  );
}

function findInstalledCli(start) {
  let directory = path.resolve(start);
  while (true) {
    const manifestPath = path.join(directory, "node_modules", "forkpoint", "package.json");
    if (isFile(manifestPath)) {
      const entry = readBinEntry(manifestPath);
      if (entry !== undefined) return entry;
    }
    const parent = path.dirname(directory);
    if (parent === directory) return undefined;
    directory = parent;
  }
}

function readBinEntry(manifestPath) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch {
    return undefined;
  }

  const root = path.dirname(manifestPath);
  const bin =
    typeof manifest.bin === "string"
      ? manifest.bin
      : typeof manifest.bin?.forkpoint === "string"
        ? manifest.bin.forkpoint
        : undefined;
  if (bin !== undefined) {
    const entry = path.resolve(root, bin);
    if (isFile(entry)) return entry;
  }

  const fallback = path.join(root, "dist", "cli", "index.js");
  return isFile(fallback) ? fallback : undefined;
}
