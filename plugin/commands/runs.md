---
description: List Forkpoint runs in the local cassette
argument-hint: [--store <dir>]
allowed-tools: Bash
---

List the runs in the local Forkpoint cassette.

The user's arguments: `$ARGUMENTS`

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" ls $ARGUMENTS
```

Show the table as-is. Run ids are what the user needs for `show`, `replay`, `verify`, `diff`, `fork`, and `export`.

To inspect one run, run:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" show <run-id> --events
```

Observed Claude Code traces appear with `status=observed`; use `show` to see `mode=observed`. They are tool-only and not replayable.
