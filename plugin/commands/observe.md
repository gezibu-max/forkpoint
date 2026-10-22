---
description: Inspect observe-only traces of Claude Code tool calls
argument-hint: [--store <dir>]
allowed-tools: Bash
---

Explain and inspect Forkpoint observe mode.

`forkpoint observe` records Claude Code tool calls from hooks into a local observed trace. It is **observe-only**:

- Only tool calls (`PreToolUse` / `PostToolUse` / `PostToolUseFailure`) are recorded.
- Claude Code's LLM requests, responses, clock, and RNG are not exposed to plugins.
- Observed runs cannot be replayed, verified, or forked. They are for browsing and `diff`.

Recording is off by default. Enable it by setting `FORKPOINT_OBSERVE=1` in the environment before starting Claude Code; unset it to stop. Hooks exit 0 even when recording fails, so they never deny a tool. They are still synchronous: `PreToolUse` adds a Node process per tool call. The default store is `<session cwd>/.forkpoint`; set `FORKPOINT_STORE` to override it. If `SessionEnd` never fires, the run can stay in `status=observing`.

Run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" ls $ARGUMENTS
```

Show the run table and identify the runs with `status=observed` (use `show <run-id>` to confirm `mode=observed`). To compare two observed traces:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" diff <base-run-id> <variant-run-id>
```

Warn the user that observed traces contain raw tool input and output, which may include secrets. They are stored locally and never uploaded. Before sharing, use `forkpoint export <run-id> --redact -o <file>` and review the secret-scan findings.
