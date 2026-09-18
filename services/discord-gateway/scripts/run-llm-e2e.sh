#!/bin/bash
# ────────────────────────────────────────────────────────────────────────────
# Run the LLM E2E moderation tests against the REAL model.
#
# These tests are gated behind AI_LLM_BASE_URL + AI_LLM_API_KEY, so plain
# `pnpm test` / CI skips them (zero cost, stays green). This script injects
# the gateway's live credentials from Bitwarden Secrets Manager and runs them.
#
# Usage (on the host that runs the gateway):
#   bash scripts/run-llm-e2e.sh            # all E2E tests, verbose
#   bash scripts/run-llm-e2e.sh --watch    # extra args go to vitest
#
# Requires: sudo access to `bws-env gmw` + /etc/bws-token.
# Cost: 7 real LLM calls (~30s, a few thousand tokens) per run.
# ────────────────────────────────────────────────────────────────────────────
set -euo pipefail

cd "$(dirname "$0")/.."

if [ ! -r /etc/bws-token ]; then
  echo "ERROR: /etc/bws-token not readable — cannot fetch live LLM credentials." >&2
  echo "       Set AI_LLM_BASE_URL + AI_LLM_API_KEY manually instead." >&2
  exit 1
fi

export BWS_ACCESS_TOKEN="$(tr -d '\r\n' < /etc/bws-token)"

sudo -n env BWS_ACCESS_TOKEN="$BWS_ACCESS_TOKEN" bash -c '
  set -euo pipefail
  export BWS_ACCESS_TOKEN="$BWS_ACCESS_TOKEN"
  ENV=$(bws-env gmw 2>/dev/null)
  set -a; eval "$ENV"; set +a
  cd '"$PWD"'
  exec ./node_modules/.bin/vitest run tests/llmE2e.test.ts --reporter=verbose "$@"
' -- "$@"
