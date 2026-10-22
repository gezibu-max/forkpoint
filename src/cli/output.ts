import { FixtureMissError, ForkpointError, isForkpointError } from "../core/errors.js";
import type { RunRow } from "../store/cassette.js";

export function printError(error: unknown, options: { json?: boolean; debug?: boolean } = {}): number {
  const exitCode = exitCodeFor(error);
  if (options.json === true) {
    const body = isForkpointError(error)
      ? { ok: false, error: error.toJSON() }
      : {
          ok: false,
          error: {
            code: "UNEXPECTED",
            message: error instanceof Error ? error.message : String(error),
          },
        };
    process.stderr.write(`${JSON.stringify(body)}\n`);
  } else {
    if (isForkpointError(error)) {
      process.stderr.write(`forkpoint: ${error.code}: ${error.message}\n`);
      if (error.callsite !== undefined) process.stderr.write(`  at ${error.callsite}\n`);
      if (error instanceof FixtureMissError) {
        if (error.diffPaths.length > 0) {
          process.stderr.write(`  changed: ${error.diffPaths.join(", ")}\n`);
        }
        for (const candidate of error.nearest) {
          const location = candidate.callsite === undefined ? "" : ` at ${candidate.callsite}`;
          const detail =
            candidate.diffPaths.length === 0
              ? "identical request"
              : candidate.diffPaths.join(", ");
          process.stderr.write(
            `  nearest: ${candidate.key.slice(0, 12)}…${location} (${detail})\n`,
          );
        }
      }
      if (error.hint !== undefined) process.stderr.write(`  hint: ${error.hint}\n`);
    } else {
      process.stderr.write(`forkpoint: ${error instanceof Error ? error.message : String(error)}\n`);
    }
  }

  if (options.debug === true && error instanceof Error && error.stack !== undefined) {
    process.stderr.write(`${error.stack}\n`);
  };

  return exitCode;
}

export function exitCodeFor(error: unknown): number {
  if (error instanceof ForkpointError) {
    return error.code === "USAGE" ? 2 : 1;
  }
  return 1;
}

export function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

export function formatRunTable(runs: RunRow[]): string {
  if (runs.length === 0) return "No runs.";
  const header = ["RUN ID", "CREATED", "STATUS", "NAME"];
  const rows = runs.map((run) => [
    run.id,
    run.createdAt,
    run.status,
    truncate(run.name, 48),
  ]);
  const widths = header.map((title, index) =>
    Math.max(title.length, ...rows.map((row) => row[index]!.length)),
  );

  return [header, ...rows]
    .map((row) => row.map((cell, index) => cell.padEnd(widths[index]!)).join("  ").trimEnd())
    .join("\n");
}

export function truncate(value: string, length: number): string {
  return value.length <= length ? value : `${value.slice(0, Math.max(0, length - 1))}…`;
}
