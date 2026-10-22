---
description: Record a Forkpoint-instrumented Node agent run
argument-hint: <run-name> -- <command...>
allowed-tools: Bash
---

Record a Node.js agent run with Forkpoint strict mode.

The user's arguments: `$ARGUMENTS`

Parse them as `<run-name> -- <command...>`. If the run name or the command is missing, ask for it. Do not invent or substitute a command.

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" record --name <run-name> -- <command...>
```

The child command must already use the Forkpoint SDK (`fp.run(...)` and `fp.wrapOpenAI(...)`). If it does not, the run ends without a `run.start`; report that instead of claiming success.

Report the run id printed by the CLI. If recording fails, show the error and note that the partial run is kept for inspection. Do not set `FORKPOINT_MODE` yourself, and do not retry with unsupported flags.
