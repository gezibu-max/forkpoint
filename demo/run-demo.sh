#!/usr/bin/env bash
# Offline demo used by docs/assets/forkpoint-demo.gif. No API key required.
set -euo pipefail

cd "$(dirname "$0")/.."

STORE=".forkpoint-demo"
CLI=(npx --yes forkpoint)
AGENT=(npx tsx examples/sql-agent/index.ts)
LOG="$(mktemp)"
trap 'rm -f "$LOG"; rm -rf "$STORE"' EXIT

rm -rf "$STORE"

step() {
  printf '\n\033[1;36m$ %s\033[0m\n' "$*"
  sleep 0.4
}

step "npx forkpoint record --name demo --store $STORE -- npx tsx examples/sql-agent/index.ts"
"${CLI[@]}" record --name demo --store "$STORE" -- "${AGENT[@]}" 2>&1 | tee "$LOG"
run_id="$(sed -n 's/^Recorded run \([^ ]*\).*/\1/p' "$LOG" | tail -n 1)"
if [ -z "$run_id" ]; then
  echo "demo: record did not print a run id" >&2
  exit 1
fi
sleep 1

step "npx forkpoint show $run_id --events --store $STORE"
"${CLI[@]}" show "$run_id" --events --store "$STORE"
sleep 1

step "npx forkpoint verify $run_id --store $STORE"
"${CLI[@]}" verify "$run_id" --store "$STORE"
sleep 1

step "npx forkpoint replay $run_id --store $STORE"
"${CLI[@]}" replay "$run_id" --store "$STORE"
sleep 2
