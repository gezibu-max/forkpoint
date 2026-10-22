---
name: forkpoint
description: Work with Forkpoint cassettes and Claude Code session traces. Use when the user wants to record, strictly replay, verify, diff, or fork a Node.js agent run, or inspect tool calls from a Claude Code session with Forkpoint.
---

# Forkpoint

Forkpoint records the boundaries of a Node.js agent run, replays them without calling a model, and locates the first divergence between runs.

## Commands

Run these through the plugin wrapper, which resolves the local CLI:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" <command> [args...]
```

| Command | Purpose |
| --- | --- |
| `record --name <name> -- <command...>` | Record an instrumented agent run |
| `replay <run-id>` | Strict offline replay |
| `verify <run-id>` | Replay twice and compare stable event hashes |
| `diff <base> <variant>` | Callsite-aligned first-divergence report |
| `fork <run-id> --model <name>` | Live model calls with tools frozen from the baseline |
| `ls` / `show <run-id> --events` | Browse cassettes |
| `export <run-id> --redact -o <file>` | Shareable JSONL, never replayable |
| `observe hook` | Ingest a Claude Code hook payload from stdin |

## Hard rules

1. **Strict replay never calls a model.** Do not suggest `--allow-live`; it does not exist.
2. **Observed runs are not replayable.** Claude Code plugins cannot see the host's LLM traffic, clock, or RNG. Observed traces contain tool calls only and never participate in `verify`.
3. **Do not fake or repair cassettes.** A fixture miss is reported, not filled in by hand. There is no `repair` or `merge`.
4. **Fork is closed-world.** Tools are served from baseline fixtures and never executed. A `FixtureMissError` means the counterfactual left the recorded tool world; report it.
5. **Secrets stay local.** Never read, print, or write API keys. Cassettes can contain raw tool I/O; recommend `export --redact` before sharing.
6. **Recorded commands must opt in.** The child process must use the Forkpoint SDK (`fp.run` + `fp.wrapOpenAI`). There is no auto-instrumentation.

## Observe mode

Hooks are registered by the plugin, but recording is off unless `FORKPOINT_OBSERVE=1` is set before Claude Code starts. The store defaults to `<session cwd>/.forkpoint`; `FORKPOINT_STORE` overrides it. Hook failures never deny a tool, but `PreToolUse` still adds a synchronous Node process per call. A missing `SessionEnd` can leave a run in `status=observing`.
