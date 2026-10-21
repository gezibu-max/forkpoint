export type Mode = "record" | "replay" | "fork" | "off";
export type StoredRunMode = "recorded" | "replayed" | "forked";
export type RunStatus = "recording" | "recorded" | "replayed" | "failed";

export interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
  total_tokens?: number;
  input_tokens?: number;
  output_tokens?: number;
  [key: string]: unknown;
}

export type Event =
  | { type: "run.start"; payload: { name: string; mode: Mode; parentRunId?: string } }
  | { type: "run.end"; payload: { status: "ok" | "failed"; error?: string } }
  | {
      type: "llm.request";
      payload: { provider: string; model: string; stream: boolean; request: unknown };
    }
  | {
      type: "llm.response";
      payload: {
        response: unknown;
        usage?: Usage;
        finishReason?: string;
        responseId?: string;
        stream: boolean;
      };
    }
  | { type: "llm.chunk"; payload: { index: number; chunk: unknown } }
  | { type: "llm.error"; payload: { name: string; message: string; aborted: boolean } }
  | { type: "tool.call"; payload: { name: string; args: unknown; isWrite: boolean } }
  | { type: "tool.result"; payload: { name: string; result: unknown } }
  | { type: "tool.error"; payload: { name: string; errorName: string; message: string } }
  | { type: "clock.now"; payload: { source: string; value: number } }
  | { type: "rng.value"; payload: { source: string; value: string } }
  | { type: "env.snapshot"; payload: { env: Record<string, string>; lockfileHash?: string } }
  | { type: "replay.warning"; payload: { code: string; message: string } }
  | { type: "stream.aborted"; payload: { consumed: number } };

export type EventType = Event["type"];

export interface EventInput {
  type: EventType;
  payload: unknown;
  ts?: number;
  durationMs?: number;
  spanId?: string;
  parentSpanId?: string;
  callsite?: string;
  requestHash?: string;
  responseHash?: string;
}

export interface EventRecord extends EventInput {
  runId: string;
  seq: number;
  ts: number;
}
