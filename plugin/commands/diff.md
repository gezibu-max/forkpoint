---
description: Compare two Forkpoint runs and show the first divergence
argument-hint: <base-run-id> <variant-run-id>
allowed-tools: Bash
---

Compare two Forkpoint runs by callsite and per-callsite ordinal.

The user's arguments: `$ARGUMENTS`

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" diff $ARGUMENTS
```

If fewer than two run ids are supplied, run `node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" ls` first and ask which two runs to compare.

Report the first divergence with its step, callsite, and changed fields. Mention the report caveats when they apply. Do not describe the result as model-quality evidence; a diff shows what changed, not which run is better.
