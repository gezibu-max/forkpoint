---
description: Replay a run twice and verify deterministic event hashes
argument-hint: <run-id>
allowed-tools: Bash
---

Verify that a recorded run replays deterministically.

The user's arguments: `$ARGUMENTS`

Run exactly:

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/cli.mjs" verify $ARGUMENTS
```

Both replays are offline; no model is called. Report whether the stable event hashes match and, on failure, the first differing `seq` and reason.

Observed Claude Code traces cannot be verified; they have no LLM boundaries and are not replayable.
