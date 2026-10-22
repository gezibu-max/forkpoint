# Forkpoint Claude Code plugin

Two modes, with different guarantees:

| Mode | What it does | Replayable |
| --- | --- | --- |
| **Strict** (`/forkpoint:record`, `replay`, `verify`, `diff`, `fork`) | Launches a Forkpoint-instrumented Node agent as a child process. LLM, tool, clock, RNG, and env boundaries are recorded and can be strictly replayed. | Yes |
| **Observe** (hooks, opt-in) | Records Claude Code tool calls from `PreToolUse` / `PostToolUse` into a local trace. | No |

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

The plugin needs Node.js >= 24 and a resolvable Forkpoint CLI. Resolution order:

1. `FORKPOINT_CLI` (path to `dist/cli/index.js`)
2. `dist/cli/index.js` in this repository
3. an installed `forkpoint` package in the current project or a parent directory

If none is found, the wrapper prints an actionable error instead of running something else.

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
- `SessionEnd` → `run.end` and final metrics

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

Hooks always exit 0 and never block tool execution. If recording fails, the warning goes to stderr and the session continues.

## Limits

- Observe mode has no LLM steps, no token accounting, and no host clock/RNG.
- Tool hooks do not fire for every possible host action; only tool calls are traced.
- Strict mode requires an instrumented child command; it cannot wrap an arbitrary Claude Code session.
- The SDK does not auto-instrument frameworks; wrap OpenAI clients and tool functions explicitly.
- No hosted service, no Web UI, no repair/merge, no MCP protocol capture.

See the repository's `docs/limits.md` and `docs/decisions.md` for the full list.
