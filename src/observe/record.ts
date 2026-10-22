import path from "node:path";
import { realNow } from "../core/clock.js";
import { fingerprintValue } from "../core/fingerprint.js";
import { RunExistsError, UsageError } from "../core/errors.js";
import type { EventInput } from "../core/events.js";
import { openCassette, type Cassette, type RunRow } from "../store/cassette.js";
import { readGitSha } from "../core/env.js";

export interface ClaudeHookInput {
  session_id?: string;
  transcript_path?: string;
  cwd?: string;
  hook_event_name?: string;
  tool_name?: string;
  tool_input?: unknown;
  tool_output?: unknown;
  tool_response?: unknown;
  tool_use_id?: string;
  source?: string;
  model?: string;
  agent_type?: string;
  session_title?: string;
  reason?: string;
  [key: string]: unknown;
}

export interface ObserveEventOptions {
  store: string;
  input: ClaudeHookInput;
  event?: string;
}

export interface ObserveEventResult {
  runId: string;
  event: string;
  recorded: boolean;
}

const OBSERVE_EVENTS = new Set(["SessionStart", "PreToolUse", "PostToolUse", "SessionEnd"]);
const WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "NotebookEdit", "Bash", "Task"]);

export function recordObserveEvent(options: ObserveEventOptions): ObserveEventResult {
  const event = options.event ?? options.input.hook_event_name;
  if (event === undefined || event === "") {
    throw new UsageError("observe hook input is missing hook_event_name.");
  }
  if (!OBSERVE_EVENTS.has(event)) {
    return { runId: "", event, recorded: false };
  }

  const sessionId = options.input.session_id;
  if (typeof sessionId !== "string" || sessionId === "") {
    throw new UsageError("observe hook input is missing session_id.");
  }

  const cassette = openCassette(options.store);
  try {
    const run = ensureObservedRun(cassette, options.input, sessionId);
    if (event === "SessionStart") {
      appendObserveStart(cassette, run, options.input);
    } else if (event === "PreToolUse") {
      recordToolCall(cassette, run, options.input);
    } else if (event === "PostToolUse") {
      recordToolResult(cassette, run, options.input);
    } else {
      finalizeObservedRun(cassette, run);
    }
    return { runId: run.id, event, recorded: true };
  } finally {
    cassette.close();
  }
}

export function resolveObserveStore(input: ClaudeHookInput, override?: string): string {
  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
  const candidate = override ?? process.env.FORKPOINT_STORE;
  if (candidate === undefined || candidate === "") return path.resolve(cwd, ".forkpoint");
  return path.isAbsolute(candidate) ? candidate : path.resolve(cwd, candidate);
}

function ensureObservedRun(
  cassette: Cassette,
  input: ClaudeHookInput,
  sessionId: string,
): RunRow {
  const runId = `obs_${sessionId}`;
  const existing = cassette.getRun(runId);
  if (existing !== undefined) return existing;

  const cwd = typeof input.cwd === "string" && input.cwd !== "" ? input.cwd : process.cwd();
  const name = observedName(input, sessionId);
  const config = {
    source: "claude-code",
    sessionId,
    ...(typeof input.transcript_path === "string"
      ? { transcriptPath: input.transcript_path }
      : {}),
    ...(typeof input.model === "string" ? { model: input.model } : {}),
    ...(typeof input.agent_type === "string" ? { agentType: input.agent_type } : {}),
    ...(typeof input.source === "string" ? { sessionSource: input.source } : {}),
  };
  const gitSha = readGitSha(cwd);

  try {
    cassette.createRun({
      id: runId,
      name,
      mode: "observed",
      status: "observing",
      command: "claude-code",
      cwd,
      ...(gitSha === undefined ? {} : { gitSha }),
      config,
    });
  } catch (error) {
    if (!(error instanceof RunExistsError)) throw error;
    const raced = cassette.getRun(runId);
    if (raced === undefined) throw error;
    return raced;
  }

  const created = cassette.getRun(runId);
  if (created === undefined) {
    throw new UsageError(`Observed run ${runId} was created but could not be read back.`);
  }
  return created;
}

function appendObserveStart(cassette: Cassette, run: RunRow, input: ClaudeHookInput): void {
  if (run.status !== "observed" && cassette.hasEventType(run.id, "observe.start")) return;
  cassette.appendEventNow(run.id, {
    type: "observe.start",
    payload: {
      name: run.name,
      source: "claude-code",
      sessionId: input.session_id!,
      ...(typeof input.transcript_path === "string"
        ? { transcriptPath: input.transcript_path }
        : {}),
      ...(typeof input.model === "string" ? { model: input.model } : {}),
      ...(typeof input.agent_type === "string" ? { agentType: input.agent_type } : {}),
      ...(typeof input.source === "string" ? { sessionSource: input.source } : {}),
    },
  });
  if (run.status === "observed") cassette.updateRunStatus(run.id, "observing");
}

function recordToolCall(cassette: Cassette, run: RunRow, input: ClaudeHookInput): void {
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName === "") return;

  const args = input.tool_input ?? null;
  const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : undefined;
  const event: EventInput = {
    type: "tool.call",
    payload: {
      name: toolName,
      args,
      isWrite: WRITE_TOOLS.has(toolName),
      ...(toolUseId === undefined ? {} : { toolUseId }),
    },
    callsite: `claude-code:${toolName}`,
    requestHash: fingerprintValue(args),
    ...(toolUseId === undefined ? {} : { spanId: toolUseId }),
  };
  cassette.appendEventNow(run.id, event);
}

function recordToolResult(cassette: Cassette, run: RunRow, input: ClaudeHookInput): void {
  const toolName = input.tool_name;
  if (typeof toolName !== "string" || toolName === "") return;

  const output = input.tool_output ?? input.tool_response ?? null;
  const toolUseId = typeof input.tool_use_id === "string" ? input.tool_use_id : undefined;
  const event: EventInput = {
    type: "tool.result",
    payload: {
      name: toolName,
      result: output,
      ...(toolUseId === undefined ? {} : { toolUseId }),
    },
    callsite: `claude-code:${toolName}`,
    responseHash: fingerprintValue(output),
    ...(toolUseId === undefined ? {} : { spanId: toolUseId }),
  };
  cassette.appendEventNow(run.id, event);
}

function finalizeObservedRun(cassette: Cassette, run: RunRow): void {
  if (run.status === "observed") return;

  const now = realNow();
  const startedAt = Date.parse(run.createdAt);
  const durationMs = Number.isFinite(startedAt) ? Math.max(0, now - startedAt) : undefined;
  cassette.appendEventNow(run.id, {
    type: "run.end",
    payload: { status: "ok" },
    ...(durationMs === undefined ? {} : { durationMs }),
  });
  cassette.updateRunStatus(run.id, "observed", {
    ...(durationMs === undefined ? {} : { durationMs }),
    events: cassette.countEvents(run.id),
    toolCalls: cassette.getEventsByType(run.id, "tool.call").length,
  });
}

function observedName(input: ClaudeHookInput, sessionId: string): string {
  const title =
    typeof input.session_title === "string" && input.session_title.trim() !== ""
      ? input.session_title.trim()
      : sessionId.slice(0, 8);
  return `claude-code: ${title.slice(0, 80)}`;
}
