import { elapsedMs, monotonicNow } from "../core/clock.js";
import { captureCallsite } from "../core/callsite.js";
import {
  errorSummary,
  FixtureMissError,
  NoActiveRunError,
  UnsupportedStreamMethodError,
} from "../core/errors.js";
import { canonicalize, fingerprintValue } from "../core/fingerprint.js";
import { toJsonText } from "../core/serialize.js";
import { currentRun, isArmed, nextOccurrence, runWithRealSource, type RunContext } from "./context.js";
import { applyForkOverrides } from "./overrides.js";
import {
  cloneJson,
  fixtureResponse,
  getReplayFixture,
  isObject,
  recordedError,
} from "./replay.js";

type UnknownRecord = Record<string, unknown>;

const wrappedClients = new WeakSet<object>();
const TRANSPORT_KEYS = new Set([
  "signal",
  "timeout",
  "maxRetries",
  "headers",
  "extra_headers",
  "httpAgent",
  "fetch",
  "body",
]);
const FINGERPRINT_EXCLUDED = new Set([
  "model",
  "messages",
  "input",
  "tools",
  "stream",
  "response_format",
  "text",
  ...TRANSPORT_KEYS,
]);

export function wrapOpenAI<T extends object>(client: T): T {
  if (wrappedClients.has(client)) return client;

  const proxy = new Proxy(client, {
    get(target, property, receiver) {
      if (property === "chat") {
        const chat = Reflect.get(target, property, receiver);
        return isObject(chat) ? wrapChat(chat) : chat;
      }
      if (property === "responses") {
        const responses = Reflect.get(target, property, receiver);
        return isObject(responses) ? wrapResponses(responses) : responses;
      }
      return bindMember(target, property, receiver);
    },
  });

  wrappedClients.add(proxy);
  return proxy;
}

function wrapChat(chat: object): object {
  return new Proxy(chat, {
    get(target, property, receiver) {
      if (property === "completions") {
        const completions = Reflect.get(target, property, receiver);
        return isObject(completions) ? wrapCompletions(completions) : completions;
      }
      return bindMember(target, property, receiver);
    },
  });
}

function wrapCompletions(completions: object): object {
  return new Proxy(completions, {
    get(target, property, receiver) {
      if (property === "create") {
        const create = Reflect.get(target, property, receiver);
        if (typeof create !== "function") return create;
        return function wrappedCreate(this: unknown, ...args: unknown[]): Promise<unknown> {
          return handleLlmCall("chat.completions", target, create, args, args[0]);
        };
      }
      return bindMember(target, property, receiver);
    },
  });
}

function wrapResponses(responses: object): object {
  return new Proxy(responses, {
    get(target, property, receiver) {
      if (property === "create") {
        const create = Reflect.get(target, property, receiver);
        if (typeof create !== "function") return create;
        return function wrappedCreate(this: unknown, ...args: unknown[]): Promise<unknown> {
          return handleLlmCall("responses", target, create, args, args[0]);
        };
      }
      return bindMember(target, property, receiver);
    },
  });
}

async function handleLlmCall(
  api: "chat.completions" | "responses",
  owner: object,
  original: (...args: unknown[]) => unknown,
  args: unknown[],
  rawRequest: unknown,
): Promise<unknown> {
  const context = currentRun();
  if (context === undefined) {
    if (isArmed()) throw new NoActiveRunError(captureCallsite());
    return original.apply(owner, args);
  }
  if (context.boundaryError !== undefined) throw context.boundaryError;

  if (!isObject(rawRequest)) {
    throw new Error(`${api}.create expects a request object.`);
  }

  const callsite = captureCallsite();
  if (rawRequest.stream === true) {
    throw new UnsupportedStreamMethodError(`${api}.create with stream: true`, { callsite });
  }

  const effectiveRequest =
    context.forkOverrides !== undefined
      ? applyForkOverrides(api, rawRequest, context.forkOverrides)
      : rawRequest;
  const callArgs = effectiveRequest === rawRequest ? args : [effectiveRequest, ...args.slice(1)];
  const request = sanitizeRequest(effectiveRequest);
  const requestHash = fingerprintValue(buildFingerprintInput(api, request));
  const requestJson = canonicalize(request);
  const occurrence = nextOccurrence(context, "llm", requestHash);
  const model = typeof request.model === "string" ? request.model : "unknown";
  const stream = request.stream === true;

  context.counters.llmCalls += 1;
  context.cassette.appendEvent(context.runId, {
    type: "llm.request",
    payload: { provider: "openai-compatible", model, stream, request },
    callsite,
    requestHash,
  });

  if (context.mode === "replay") {
    return replayLlmCall(context, requestHash, requestJson, occurrence, callsite, stream);
  }

  const startedAt = monotonicNow();
  let response: unknown;
  try {
    response = await runWithRealSource(() => original.apply(owner, callArgs));
  } catch (error) {
    const summary = errorSummary(error);
    const aborted = isAborted(error, rawRequest);
    context.cassette.appendEvent(context.runId, {
      type: "llm.error",
      payload: { name: summary.name, message: summary.message, aborted },
      callsite,
      requestHash,
      durationMs: elapsedMs(startedAt),
    });
    try {
      context.cassette.putFixture(context.runId, {
        kind: "llm",
        fixtureKey: requestHash,
        occurrence,
        callsite,
        requestJson,
        meta: { api, stream, error: summary, aborted },
      });
    } catch {
      // The original failure is more useful than a secondary recording failure.
    }
    throw error;
  }

  const responseText = toJsonText(response, "$.response");
  const plainResponse = JSON.parse(responseText) as unknown;
  const responseHash = fingerprintValue(plainResponse);
  const usage = isObject(plainResponse) && isObject(plainResponse.usage) ? plainResponse.usage : undefined;
  const finishReason = readFinishReason(plainResponse);
  const responseId =
    isObject(plainResponse) && typeof plainResponse.id === "string" ? plainResponse.id : undefined;

  context.cassette.appendEvent(context.runId, {
    type: "llm.response",
    payload: {
      response: plainResponse,
      ...(usage === undefined ? {} : { usage }),
      ...(finishReason === undefined ? {} : { finishReason }),
      ...(responseId === undefined ? {} : { responseId }),
      stream,
    },
    callsite,
    requestHash,
    responseHash,
    durationMs: elapsedMs(startedAt),
  });
  context.cassette.putFixture(context.runId, {
    kind: "llm",
    fixtureKey: requestHash,
    occurrence,
    callsite,
    requestJson,
    response: plainResponse,
    meta: { api, stream },
  });

  return response;
}

async function replayLlmCall(
  context: RunContext,
  requestHash: string,
  requestJson: string,
  occurrence: number,
  callsite: string,
  stream: boolean,
): Promise<unknown> {
  let fixture;
  try {
    fixture = getReplayFixture(context, "llm", requestHash, occurrence, callsite, requestJson);
  } catch (error) {
    if (error instanceof FixtureMissError) {
      context.boundaryError = error;
      const summary = errorSummary(error);
      context.cassette.appendEvent(context.runId, {
        type: "llm.error",
        payload: { name: summary.name, message: summary.message, aborted: false },
        callsite,
        requestHash,
      });
    }
    throw error;
  }
  const meta = isObject(fixture.meta) ? fixture.meta : {};

  const recorded = recordedError(meta);
  if (recorded !== undefined) {
    context.cassette.appendEvent(context.runId, {
      type: "llm.error",
      payload: { name: recorded.name, message: recorded.message, aborted: meta.aborted === true },
      callsite,
      requestHash,
    });
    copyLlmFixture(context, fixture, requestJson, callsite);
    throw recorded;
  }

  const plainResponse = cloneJson(fixtureResponse(context, fixture));
  const responseHash = fingerprintValue(plainResponse);
  const usage = isObject(plainResponse) && isObject(plainResponse.usage) ? plainResponse.usage : undefined;
  const finishReason = readFinishReason(plainResponse);
  const responseId =
    isObject(plainResponse) && typeof plainResponse.id === "string" ? plainResponse.id : undefined;

  context.cassette.appendEvent(context.runId, {
    type: "llm.response",
    payload: {
      response: plainResponse,
      ...(usage === undefined ? {} : { usage }),
      ...(finishReason === undefined ? {} : { finishReason }),
      ...(responseId === undefined ? {} : { responseId }),
      stream,
    },
    callsite,
    requestHash,
    responseHash,
  });

  copyLlmFixture(context, fixture, requestJson, callsite);
  return plainResponse;
}

function copyLlmFixture(
  context: RunContext,
  fixture: ReturnType<typeof getReplayFixture>,
  requestJson: string,
  callsite: string,
): void {
  context.cassette.putFixture(context.runId, {
    kind: "llm",
    fixtureKey: fixture.fixtureKey,
    occurrence: fixture.occurrence,
    callsite,
    requestJson,
    ...(fixture.response === undefined ? {} : { response: fixture.response }),
    ...(fixture.meta === undefined ? {} : { meta: fixture.meta }),
  });
}

function sanitizeRequest(request: UnknownRecord): UnknownRecord {
  const sanitized: UnknownRecord = {};
  for (const [key, value] of Object.entries(request)) {
    if (TRANSPORT_KEYS.has(key)) continue;
    if (value === undefined) continue;
    sanitized[key] = value;
  }
  return sanitized;
}

function buildFingerprintInput(api: "chat.completions" | "responses", request: UnknownRecord): UnknownRecord {
  const sampling: UnknownRecord = {};
  for (const [key, value] of Object.entries(request)) {
    if (FINGERPRINT_EXCLUDED.has(key)) continue;
    if (value === undefined) continue;
    sampling[key] = value;
  }

  return {
    model: request.model,
    messages: api === "chat.completions" ? request.messages : request.input,
    tools: normalizeTools(request.tools),
    sampling,
    responseFormat: request.response_format ?? request.text ?? null,
    stream: request.stream === true,
  };
}

function normalizeTools(tools: unknown): unknown {
  if (tools === undefined) return null;
  if (!Array.isArray(tools)) return tools;

  return [...tools].sort((left, right) => {
    const byName = compareStrings(toolName(left), toolName(right));
    if (byName !== 0) return byName;
    return compareStrings(canonicalize(left), canonicalize(right));
  });
}

function toolName(tool: unknown): string {
  if (!isObject(tool)) return "";
  if (typeof tool.name === "string") return tool.name;
  if (isObject(tool.function) && typeof tool.function.name === "string") return tool.function.name;
  return "";
}

function compareStrings(left: string, right: string): number {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function readFinishReason(response: unknown): string | undefined {
  if (!isObject(response)) return undefined;
  if (Array.isArray(response.choices)) {
    const first = response.choices[0];
    if (isObject(first) && typeof first.finish_reason === "string") return first.finish_reason;
  }
  if (typeof response.status === "string") return response.status;
  return undefined;
}

function isAborted(error: unknown, request: UnknownRecord): boolean {
  if (error instanceof Error && error.name === "AbortError") return true;
  const signal = request.signal;
  return isObject(signal) && signal.aborted === true;
}

function bindMember(target: object, property: PropertyKey, receiver: unknown): unknown {
  const value = Reflect.get(target, property, receiver);
  return typeof value === "function" ? value.bind(target) : value;
}
