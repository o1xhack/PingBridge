#!/usr/bin/env bash
set -euo pipefail

: "${PINGBRIDGE_ENDPOINT:=http://127.0.0.1:8787}"
: "${PINGBRIDGE_TOKEN:?PINGBRIDGE_TOKEN is required}"

node ../../packages/cli/dist/index.js notify \
  --endpoint "$PINGBRIDGE_ENDPOINT" \
  --token "$PINGBRIDGE_TOKEN" \
  --source "codex-automation" \
  --event "task.completed" \
  --target "me" \
  --title "Codex automation complete" \
  --message "${1:-Task completed.}" \
  --changed true
