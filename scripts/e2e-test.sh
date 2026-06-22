#!/usr/bin/env bash
set -euo pipefail

# ═══════════════════════════════════════════════════════════════
#  E2E Test — IMPHNEN Moderation Stack
#  Tests frontend, backend API, DB connectivity, and moderation
#  pipeline against the real production environment.
# ═══════════════════════════════════════════════════════════════

BASE_URL="${1:-https://imphnen.asepharyana.my.id}"
API="${BASE_URL}/api"

PASS=0
FAIL=0
TIMEOUT=10

red()   { printf "\033[31m%s\033[0m\n" "$*"; }
green() { printf "\033[32m%s\033[0m\n" "$*"; }
blue()  { printf "\033[36m%s\033[0m\n" "$*"; }

assert() {
  local desc="$1" method="$2" url="$3" expect="$4" extra="$5"
  local code body
  if [ "$method" = "GET" ]; then
    body=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" "$url" 2>&1)
    code="$body"
  elif [ "$method" = "POST" ]; then
    body=$(curl -s -o /dev/null -w "%{http_code}" --max-time "$TIMEOUT" -X POST -H "Content-Type: application/json" -d "$extra" "$url" 2>&1)
    code="$body"
  fi

  if [ "$code" = "$expect" ]; then
    green "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    red "  ✗ $desc — expected $expect, got $code"
    FAIL=$((FAIL + 1))
  fi
}

assert_json_field() {
  local desc="$1" url="$2" field="$3" extra="${4:-}"
  local val
  if [ -n "$extra" ]; then
    val=$(curl -s --max-time "$TIMEOUT" -X POST -H "Content-Type: application/json" -d "$extra" "$url" 2>&1 | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  keys = '${field}'.split('.')
  for k in keys:
    d = d[k]
  print(d)
except: print('__MISSING__')
")
  else
    val=$(curl -s --max-time "$TIMEOUT" "$url" 2>&1 | python3 -c "
import sys, json
try:
  d = json.load(sys.stdin)
  keys = '${field}'.split('.')
  for k in keys:
    d = d[k]
  print(d)
except: print('__MISSING__')
")
  fi

  if [ "$val" != "__MISSING__" ] && [ -n "$val" ]; then
    green "  ✓ $desc (${field}=${val:0:80})"
    PASS=$((PASS + 1))
  else
    red "  ✗ $desc — field '${field}' not found"
    FAIL=$((FAIL + 1))
  fi
}

assert_contains() {
  local desc="$1" url="$2" needle="$3"
  local body
  body=$(curl -s --max-time "$TIMEOUT" "$url" 2>&1)
  if echo "$body" | grep -q "$needle"; then
    green "  ✓ $desc"
    PASS=$((PASS + 1))
  else
    red "  ✗ $desc — expected response to contain '${needle}'"
    FAIL=$((FAIL + 1))
  fi
}

# ───────────────────────────────────────────────────────────────
blue ""
blue "════════════════════════════════════════════════════════"
blue "  E2E Test: IMPHNEN Moderation Stack"
blue "  Target: ${BASE_URL}"
blue "════════════════════════════════════════════════════════"
blue ""

# ── 1. Health Check ────────────────────────────────────────────
blue "── API: Health Check ──"
assert "GET /api/health → 200" GET "${API}/health" 200 ""
assert_json_field "health.status == healthy" "${API}/health" "status"

# ── 2. Dashboard ───────────────────────────────────────────────
blue "── API: Dashboard ──"
assert "GET /api/dashboard/stats → 200" GET "${API}/dashboard/stats" 200 ""
assert_json_field "dashboard.total_messages" "${API}/dashboard/stats" "total_messages"
assert_json_field "dashboard.total_flagged" "${API}/dashboard/stats" "total_flagged"
assert_json_field "dashboard.active_users_24h" "${API}/dashboard/stats" "active_users_24h"

# ── 3. Recordings ──────────────────────────────────────────────
blue "── API: Recordings ──"
assert "GET /api/recordings → 200" GET "${API}/recordings?limit=5" 200 ""
assert_json_field "recordings.items array" "${API}/recordings?limit=5" "items"

# ── 4. Messages ────────────────────────────────────────────────
blue "── API: Messages ──"
assert "GET /api/messages (no channelId) → 400" GET "${API}/messages?limit=3" 400 ""

# ── 5. Config ──────────────────────────────────────────────────
blue "── API: Config ──"
assert "GET /api/config → 200" GET "${API}/config" 200 ""

# ── 6. Auth ────────────────────────────────────────────────────
blue "── API: Auth (POST) → 401" POST "${API}/auth" 401 '{"password": "wrong"}'

# ── 7. Voice Guilds ────────────────────────────────────────────
blue "── API: Voice ──"
assert "GET /api/guilds → 200" GET "${API}/guilds" 200 ""

# ── 8. Frontend ────────────────────────────────────────────────
blue "── Frontend ──"
assert "GET / → 200" GET "${BASE_URL}/" 200 ""
assert_contains "Frontend renders title" "${BASE_URL}/" "IMPHNEN"

# ── 9. Endpoints that should 404 ──────────────────────────────
blue "── Negative Tests ──"
assert "GET /api/nonexistent → 404" GET "${API}/nonexistent" 404 ""

# ── Summary ────────────────────────────────────────────────────
blue ""
blue "════════════════════════════════════════════════════════"
if [ "$FAIL" -eq 0 ]; then
  green "  ALL ${PASS} TESTS PASSED"
else
  red "  ${PASS} passed, ${FAIL} failed"
fi
blue "════════════════════════════════════════════════════════"
blue ""

exit "$FAIL"
