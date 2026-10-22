# Forkpoint Claude Code plugin

Two modes, with different guarantees:

| Mode | What it does | Replayable |
| --- | --- | --- |
| **Strict** (`/forkpoint:record`, `replay`, `verify`, `diff`, `fork`) | Launches a Forkpoint-instrumented Node agent as a child process. LLM, tool, clock, RNG, and env boundaries are recorded and can be strictly replayed. | Yes |
| **Observe** (hooks, opt-in) | Records Claude Code tool calls from `PreToolUse` / `PostToolUse` / `PostToolUseFailure` into a local trace. | No |

The plugin never claims it can replay Claude Code's own session. Hooks do not expose the host's raw LLM requests/responses or control its clock and RNG, so strict replay of the host is impossible. Observe mode exists for browsing and diffing tool behavior, not for determinism claims.

## Install

From this repository:

```bash
/plugin marketplace add ./
/plugin install forkpoint@forkpoint
```

For local development without installing:

```bash
claude --plugin-dir ./plugin
```

The plugin ships a self-contained CLI bundle at `plugin/lib/cli.mjs`, so a marketplace install needs no separate npm package. It requires Node.js >= 24.

Resolution order:

1. `FORKPOINT_CLI` (explicit path to a CLI entry)
2. `dist/cli/index.js` in this repository, when developing locally
3. the bundled `plugin/lib/cli.mjs`
4. an installed `forkpoint` package in the current project or a parent directory

If none is found, the wrapper prints an actionable error instead of running something else.

## Other Agent Skills hosts

The repository also contains `.agents/skills/forkpoint/SKILL.md`, a byte-identical copy of the plugin skill, for Agent Skills hosts that discover workspace skills from `.agents/skills/`. Qoder already discovers it.

Outside Claude Code there is no plugin root and no hook payload, so the skill falls back to `npx --yes forkpoint` and exposes only the CLI commands: `record`, `replay`, `verify`, `diff`, `fork`, `export`, `ls`, and `show`. Observe mode is Claude Code-only.

Both copies pass the official `skills-ref validate`. Codex CLI and Gemini CLI were not installed on the development machine, so no runtime claim is made for them.

## Strict mode

Strict mode runs a **command**, not the host session:

```bash
/forkpoint:record my-run -- node agent.mjs
/forkpoint:replay <run-id>
/forkpoint:verify <run-id>
/forkpoint:diff <base-run-id> <variant-run-id>
/forkpoint:fork <run-id> --model other-model
/forkpoint:runs
```

The target command must use the Forkpoint SDK:

```ts
import { Forkpoint } from "forkpoint";

const fp = new Forkpoint({ mode: "record" });
const client = fp.wrapOpenAI(new OpenAI());

await fp.run("my-run", async () => {
  // agent code
});
```

The SDK is available from npm with `npm install forkpoint`. The plugin itself already bundles the CLI, so a marketplace install does not depend on the npm package.

`record` re-executes the command with `FORKPOINT_MODE=record`. `replay` and `verify` answer every boundary from the cassette and block live `fetch`. `fork` calls the model live with the requested override while serving tool calls from the baseline cassette.

## Observe mode

Claude Code hooks are registered by the plugin, but **recording is off by default**. Enable it before starting Claude Code:

```bash
export FORKPOINT_OBSERVE=1
claude
```

Recorded events:

- `SessionStart` → creates an observed run (`obs_<session-id>`) and `observe.start`
- `PreToolUse` → `tool.call` with the tool name, input, and a request fingerprint
- `PostToolUse` → `tool.result` with the output and a response fingerprint
- `PostToolUseFailure` → `tool.error` with the error message, plus `isInterrupt` for interrupted tools
- `SessionEnd` → `run.end` with the end reason and final metrics

Observed runs:

- include only tool calls; there are no `llm.*` events;
- are marked `mode=observed` / `status=observed`;
- are rejected by `replay`, `verify`, and `fork` with an explicit error;
- can be listed with `forkpoint ls`, inspected with `show --events`, and compared with `forkpoint diff`.

The default store is `<session cwd>/.forkpoint`; set `FORKPOINT_STORE` (absolute or relative to the session cwd) to write elsewhere.

### Privacy

Observed traces store raw tool input and output. They may contain source code, file contents, shell output, or secrets. Data stays in the local SQLite cassette; the plugin has no telemetry and performs no uploads.

Before sharing a trace, use:

```bash
forkpoint export <run-id> --redact -o trace.jsonl
```

Review the secret-scan findings. The export is explicitly not replayable.

Hooks always exit 0 and never deny a tool, but they are synchronous: Claude Code waits for each hook process. `PreToolUse` adds one Node start-up per tool call (roughly 0.5 s in local measurements). Leave observe off for latency-sensitive sessions. If recording fails, the warning goes to stderr and the session continues. If `SessionEnd` never fires, the run can remain `status=observing`; there is no automatic reconciliation.

The `observe.start` event stores the host's `transcript_path` as an absolute path. Export redaction does not rewrite that path.

## Limits

- Observe mode has no LLM steps, no token accounting, and no host clock/RNG.
- Tool hooks do not fire for every possible host action; only tool calls are traced.
- PreToolUse hooks add a synchronous Node process per tool call; this is not free.
- A missing `SessionEnd` leaves the observed run in `status=observing`.
- Strict mode requires an instrumented child command; it cannot wrap an arbitrary Claude Code session.
- The SDK does not auto-instrument frameworks; wrap OpenAI clients and tool functions explicitly.
- No hosted service, no Web UI, no repair/merge, no MCP protocol capture.

See the repository's `docs/limits.md` and `docs/decisions.md` for the full list.
