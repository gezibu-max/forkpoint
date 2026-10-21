export type ErrorCode =
  | "NON_SERIALIZABLE"
  | "NESTED_RUN"
  | "NO_ACTIVE_RUN"
  | "FIXTURE_MISS"
  | "REQUEST_MISMATCH"
  | "LIVE_CALL_BLOCKED"
  | "RNG_MISMATCH"
  | "RNG_EXHAUSTED"
  | "CLOCK_READ_LIMIT"
  | "ENV_CHANGED"
  | "NONDETERMINISM"
  | "CASSETTE_CORRUPT"
  | "MIGRATION_FAILED"
  | "UNSUPPORTED_STREAM_METHOD"
  | "TOOL_EXECUTION"
  | "RUN_EXISTS"
  | "RUN_NOT_FOUND"
  | "FIXTURE_DUPLICATE"
  | "NOT_IMPLEMENTED"
  | "USAGE";

export interface ForkpointErrorOptions {
  runId?: string;
  seq?: number;
  callsite?: string;
  hint?: string;
  cause?: unknown;
}

export interface NearestFixture {
  key: string;
  callsite?: string;
  diffPaths: string[];
}

export interface ForkpointErrorJson {
  code: ErrorCode;
  message: string;
  runId?: string;
  seq?: number;
  callsite?: string;
  hint?: string;
  [key: string]: unknown;
}

export class ForkpointError extends Error {
  readonly code: ErrorCode;
  readonly runId?: string;
  readonly seq?: number;
  readonly callsite?: string;
  readonly hint?: string;

  constructor(code: ErrorCode, message: string, options: ForkpointErrorOptions = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = new.target.name;
    this.code = code;
    this.runId = options.runId;
    this.seq = options.seq;
    this.callsite = options.callsite;
    this.hint = options.hint;
  }

  toJSON(): ForkpointErrorJson {
    return {
      code: this.code,
      message: this.message,
      ...(this.runId === undefined ? {} : { runId: this.runId }),
      ...(this.seq === undefined ? {} : { seq: this.seq }),
      ...(this.callsite === undefined ? {} : { callsite: this.callsite }),
      ...(this.hint === undefined ? {} : { hint: this.hint }),
    };
  }
}

export class NonSerializableError extends ForkpointError {
  readonly path: string;

  constructor(path: string, detail: string, options: ForkpointErrorOptions = {}) {
    super(
      "NON_SERIALIZABLE",
      `Value at ${path} cannot be stored faithfully: ${detail}`,
      { hint: "Convert it to plain JSON types before recording; Forkpoint does not guess.", ...options },
    );
    this.path = path;
  }

  override toJSON(): ForkpointErrorJson {
    return { ...super.toJSON(), path: this.path };
  }
}

export class NestedRunError extends ForkpointError {
  constructor(options: ForkpointErrorOptions = {}) {
    super("NESTED_RUN", "A Forkpoint run is already active in this process.", {
      hint: "Await the outer fp.run() before starting another one.",
      ...options,
    });
  }
}

export class NoActiveRunError extends ForkpointError {
  constructor(callsite?: string) {
    super("NO_ACTIVE_RUN", "A wrapped boundary was called outside fp.run().", {
      hint: "Wrap the agent entrypoint in await fp.run(name, () => ...).",
      ...(callsite === undefined ? {} : { callsite }),
    });
  }
}

export class FixtureMissError extends ForkpointError {
  readonly expectedKey: string;
  readonly actualKey?: string;
  readonly nearest: NearestFixture[];
  readonly diffPaths: string[];

  constructor(
    expectedKey: string,
    options: ForkpointErrorOptions & {
      actualKey?: string;
      nearest?: NearestFixture[];
      diffPaths?: string[];
    } = {},
  ) {
    super("FIXTURE_MISS", `No fixture recorded for request ${expectedKey.slice(0, 12)}…`, {
      hint: "Re-record the run, or check for code that bypasses the wrappers.",
      ...options,
    });
    this.expectedKey = expectedKey;
    this.actualKey = options.actualKey;
    this.nearest = options.nearest ?? [];
    this.diffPaths = options.diffPaths ?? [];
  }

  override toJSON(): ForkpointErrorJson {
    return {
      ...super.toJSON(),
      expectedKey: this.expectedKey,
      ...(this.actualKey === undefined ? {} : { actualKey: this.actualKey }),
      nearest: this.nearest,
      diffPaths: this.diffPaths,
    };
  }
}

export class RequestMismatchError extends ForkpointError {
  readonly expectedKey: string;
  readonly actualKey: string;
  readonly diffPaths: string[];

  constructor(expectedKey: string, actualKey: string, diffPaths: string[], options: ForkpointErrorOptions = {}) {
    super("REQUEST_MISMATCH", "The replayed request does not match the recorded request.", {
      hint: "Check the highlighted fields, or re-record after the change.",
      ...options,
    });
    this.expectedKey = expectedKey;
    this.actualKey = actualKey;
    this.diffPaths = diffPaths;
  }

  override toJSON(): ForkpointErrorJson {
    return {
      ...super.toJSON(),
      expectedKey: this.expectedKey,
      actualKey: this.actualKey,
      diffPaths: this.diffPaths,
    };
  }
}

export class LiveCallBlockedError extends ForkpointError {
  readonly target: string;

  constructor(target: string, callsite?: string) {
    super("LIVE_CALL_BLOCKED", `A live external call was blocked during replay: ${target}`, {
      hint: "Strict replay only reads the cassette. Re-record if this call is legitimate.",
      ...(callsite === undefined ? {} : { callsite }),
    });
    this.target = target;
  }
}

export class RngMismatchError extends ForkpointError {
  constructor(expected: string, actual: string, options: ForkpointErrorOptions = {}) {
    super("RNG_MISMATCH", `Randomness source mismatch: expected ${expected}, got ${actual}.`, {
      hint: "The agent took a different path than the recorded run.",
      ...options,
    });
  }
}

export class RngExhaustedError extends ForkpointError {
  constructor(options: ForkpointErrorOptions = {}) {
    super("RNG_EXHAUSTED", "The recorded random sequence is exhausted.", {
      hint: "Re-record the run; Forkpoint does not invent random values.",
      ...options,
    });
  }
}

export class ClockReadLimitError extends ForkpointError {
  constructor(limit: number, options: ForkpointErrorOptions = {}) {
    super("CLOCK_READ_LIMIT", `More than ${limit} clock reads in one run.`, {
      hint: "Check for a loop that reads the clock on every iteration.",
      ...options,
    });
  }
}

export class EnvChangedError extends ForkpointError {
  readonly changed: string[];

  constructor(changed: string[], options: ForkpointErrorOptions = {}) {
    super("ENV_CHANGED", `Environment changed since recording: ${changed.join(", ")}.`, {
      hint: "Unset --fail-on-env-change if this is expected.",
      ...options,
    });
    this.changed = changed;
  }
}

export class NondeterminismError extends ForkpointError {
  constructor(message: string, options: ForkpointErrorOptions = {}) {
    super("NONDETERMINISM", message, {
      hint: "The run is not deterministic even with the same cassette; find the un-instrumented boundary.",
      ...options,
    });
  }
}

export class CassetteCorruptError extends ForkpointError {
  constructor(file: string, detail: string, options: ForkpointErrorOptions = {}) {
    super("CASSETTE_CORRUPT", `Cannot read cassette ${file}: ${detail}`, {
      hint: "Restore from a backup or re-record. Forkpoint will not modify a corrupt cassette.",
      ...options,
    });
  }
}

export class MigrationError extends ForkpointError {
  constructor(file: string, detail: string, options: ForkpointErrorOptions = {}) {
    super("MIGRATION_FAILED", `Cannot migrate cassette ${file}: ${detail}`, {
      hint: "The pre-migration file is kept at <cassette>.bak.",
      ...options,
    });
  }
}

export class UnsupportedStreamMethodError extends ForkpointError {
  constructor(method: string, options: ForkpointErrorOptions = {}) {
    super("UNSUPPORTED_STREAM_METHOD", `Streaming method ${method} is not supported in v0.1.`, {
      hint: "Use for await on the stream and controller.abort(), or disable streaming.",
      ...options,
    });
  }
}

export class ToolExecutionError extends ForkpointError {
  constructor(message: string, options: ForkpointErrorOptions = {}) {
    super("TOOL_EXECUTION", message, options);
  }
}

export class RunExistsError extends ForkpointError {
  constructor(runId: string) {
    super("RUN_EXISTS", `Run ${runId} already exists.`, {
      hint: "Use a new run id, or pass the existing run to show/replay.",
      runId,
    });
  }
}

export class RunNotFoundError extends ForkpointError {
  constructor(runId: string, store: string) {
    super("RUN_NOT_FOUND", `Run ${runId} was not found in ${store}.`, {
      hint: "Run `forkpoint ls` to see available runs.",
      runId,
    });
  }
}

export class NotImplementedError extends ForkpointError {
  constructor(feature: string) {
    super("NOT_IMPLEMENTED", `${feature} is not implemented in this build.`, {
      hint: "This is a pre-alpha build; record, replay, ls, and show are available.",
    });
  }
}

export class UsageError extends ForkpointError {
  constructor(message: string) {
    super("USAGE", message, { hint: "Run `forkpoint --help` for usage." });
  }
}

export function isForkpointError(error: unknown): error is ForkpointError {
  return error instanceof ForkpointError;
}

export function errorSummary(error: unknown): { name: string; message: string } {
  if (error instanceof Error) return { name: error.name, message: error.message };
  return { name: typeof error, message: String(error) };
}
