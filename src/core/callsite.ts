import path from "node:path";
import { fileURLToPath } from "node:url";

export interface CallsiteOptions {
  label?: string;
  cwd?: string;
}

const DEFAULT_SKIP = [
  /(^|[\\/])node_modules[\\/]/,
  /[\\/]src[\\/](core|boundaries|sdk|store|cli)[\\/]/,
];

export function captureCallsite(options: CallsiteOptions = {}): string {
  if (options.label !== undefined && options.label.length > 0) return options.label;

  const stack = new Error().stack;
  if (!stack) return "unknown";

  for (const line of stack.split("\n").slice(1)) {
    const location = parseFrame(line);
    if (!location) continue;
    if (isInternal(location)) continue;

    const normalized = normalizePath(location.file, options.cwd ?? process.cwd());
    return `${normalized}:${location.line}:${location.column}`;
  }

  return "unknown";
}

interface FrameLocation {
  file: string;
  line: number;
  column: number;
}

function parseFrame(line: string): FrameLocation | undefined {
  const match = /^\s*at\s+(?:.*?\s+\()?(.+?):(\d+):(\d+)\)?\s*$/.exec(line);
  if (!match) return undefined;

  let file = match[1]!;
  if (file.startsWith("async ")) file = file.slice("async ".length);
  if (file.startsWith("file://")) {
    try {
      file = fileURLToPath(new URL(file));
    } catch {
      return undefined;
    }
  }

  return { file, line: Number(match[2]), column: Number(match[3]) };
}

function isInternal(location: FrameLocation): boolean {
  const file = location.file.replaceAll("\\", "/");
  if (file === "unknown" || file === "<anonymous>") return true;
  if (file.startsWith("node:") || file.startsWith("internal/")) return true;
  return DEFAULT_SKIP.some((pattern) => pattern.test(file));
}

function normalizePath(file: string, cwd: string): string {
  const absolute = path.isAbsolute(file) ? file : path.resolve(cwd, file);
  const relative = path.relative(cwd, absolute);
  const selected = relative === "" || relative.startsWith("..") ? absolute : relative;
  return selected.replaceAll("\\", "/");
}
