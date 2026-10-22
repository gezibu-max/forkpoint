---
description: Strictly replay a Forkpoint run without calling a model
argument-hint: <run-id> [-- <command...>]
allowed-tools: Bash
---

Strictly replay a recorded Forkpoint run.

The user's arguments: `$ARGUMENTS`

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" replay $ARGUMENTS
```

Strict replay answers every LLM and tool boundary from the cassette. It never calls a model and blocks live `fetch`. If the user passes a command after `--`, keep it intact.

If the run is an observed Claude Code trace (`mode=observed`), the CLI refuses: those traces contain tool calls only and are not replayable. Explain that and offer `forkpoint diff` instead.
