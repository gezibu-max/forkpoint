import { readFileSync } from "node:fs";
import { UsageError } from "../core/errors.js";
import {
  recordObserveEvent,
  resolveObserveStore,
  type ClaudeHookInput,
} from "../observe/record.js";
import { printJson } from "./output.js";

export interface ObserveHookOptions {
  event?: string;
  store?: string;
  json: boolean;
}

export async function observeHookCommand(options: ObserveHookOptions): Promise<number> {
  const input = parseHookInput(readStdin());
  const store = resolveObserveStore(input, options.store);
  const result = recordObserveEvent({
    store,
    input,
    ...(options.event === undefined ? {} : { event: options.event }),
  });

  if (options.json) printJson({ ok: true, store, ...result });
  return 0;
}

function readStdin(): string {
  if (process.stdin.isTTY) {
    throw new UsageError(
      "observe hook reads a Claude Code hook payload from stdin; pipe JSON or use it from hooks.json.",
    );
  }
  return readFileSync(0, "utf8");
}

function parseHookInput(raw: string): ClaudeHookInput {
  if (raw.trim() === "") {
    throw new UsageError("observe hook input is empty; expected a JSON object on stdin.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new UsageError("observe hook input is not valid JSON.");
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new UsageError("observe hook input must be a JSON object.");
  }
  return parsed as ClaudeHookInput;
}

interface ParsedObserveArguments {
  subcommand?: string;
  event?: string;
  store?: string;
  json?: boolean;
}

export function parseObserveArguments(args: string[]): ParsedObserveArguments | "help" {
  if (args.includes("--help") || args.includes("-h")) return "help";

  const parsed: ParsedObserveArguments = {};
  const positional: string[] = [];

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index]!;
    if (argument === "--json") {
      parsed.json = true;
      continue;
    }
    if (argument === "--event") {
      parsed.event = valueOf(args, index, "--event");
      index += 1;
      continue;
    }
    if (argument.startsWith("--event=")) {
      parsed.event = argument.slice("--event=".length);
      continue;
    }
    if (argument === "--store") {
      parsed.store = valueOf(args, index, "--store");
      index += 1;
      continue;
    }
    if (argument.startsWith("--store=")) {
      parsed.store = argument.slice("--store=".length);
      continue;
    }
    if (argument.startsWith("-")) {
      throw new UsageError(`Unknown observe option: ${argument}`);
    }
    positional.push(argument);
  }

  if (positional.length > 1) throw new UsageError(`Unexpected argument: ${positional[1]}`);
  parsed.subcommand = positional[0];
  return parsed;
}

export function toObserveOptions(parsed: ParsedObserveArguments): ObserveHookOptions {
  if (parsed.subcommand !== "hook") {
    throw new UsageError(
      "observe requires the hook subcommand: forkpoint observe hook [--event <name>]",
    );
  }
  if (parsed.event !== undefined && parsed.event.trim() === "") {
    throw new UsageError("--event must not be empty.");
  }
  return {
    ...(parsed.event === undefined ? {} : { event: parsed.event }),
    ...(parsed.store === undefined ? {} : { store: parsed.store }),
    json: parsed.json === true,
  };
}

export function observeHelp(): string {
  return [
    "Usage: forkpoint observe hook [--event <name>] [--store <dir>] [--json]",
    "",
    "Read a Claude Code hook payload from stdin and append it to an observed trace.",
    "",
    "Observed traces record tool calls from a Claude Code session. They are not replayable",
    "and never take part in verify: the host session's LLM traffic, clock, and RNG are",
    "outside the plugin's control. Use `forkpoint diff` to compare observed runs.",
    "",
    "Options:",
    "  --event <name>  Override hook_event_name from the payload",
    "  --store <dir>   Cassette directory (default: <hook cwd>/.forkpoint)",
    "  --json          Print a machine-readable result (hooks should stay quiet)",
    "",
    "Records SessionStart, PreToolUse, PostToolUse, PostToolUseFailure, and SessionEnd; other events are ignored.",
  ].join("\n");
}

function valueOf(args: string[], index: number, flag: string): string {
  const value = args[index + 1];
  if (value === undefined) throw new UsageError(`${flag} requires a value.`);
  return value;
}
