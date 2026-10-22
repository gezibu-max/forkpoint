---
description: Fork a recorded run against a live model with frozen tools
argument-hint: <run-id> [--model <name>] [--temperature <n>] [--system-prompt-file <path>]
allowed-tools: Bash
---

Fork a recorded Forkpoint run to test a counterfactual.

The user's arguments: `$ARGUMENTS`

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" fork $ARGUMENTS
```

A fork makes real model calls with the requested overrides, but every tool call is answered from the baseline cassette and never executed. At least one override is required.

Before running, confirm the user expects live model usage and has the provider API key in the environment. Never print, echo, or store the key. If the user has not chosen an override, ask for one.

If the fork fails with `FixtureMissError`, explain that the model requested a tool input the baseline never recorded. Do not execute the tool or patch the cassette.
