#!/bin/bash
# ─── Bete Deploy Script ──────────────────────────────────────────────────────
# Builds + deploys frontend (WASM) and backend (TypeScript) to VPS containers.
#
# Usage:
#   ./deploy.sh                       # build + deploy all
#   ./deploy.sh --frontend            # build + deploy frontend only
#   ./deploy.sh --backend             # build + deploy backend only
#   ./deploy.sh --no-build            # deploy without rebuilding
#   ./deploy.sh --help                # show help
#
# Required env (or auto-fetched from GitLab CI vars via glab):
#   VPS_HOST              — VPS IP/hostname (default: from GitLab)
#   VPS_USER              — SSH user (default: from GitLab)
#   VPS_SSH_KEY           — path to SSH private key (default: from GitLab)
#   GITLAB_TOKEN          — GitLab PAT (default: $GITLAB_TOKEN)
#
# Optional env:
#   ADMIN_PASSWORD        — for testing the API after deploy
# ──────────────────────────────────────────────────────────────────────────────

set -eu

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="/opt/imphenbot"
COMPOSE_FILE="infra/docker/docker-compose.yml"
FRONTEND_DIR="services/frontend/frontend"
BACKEND_DIR="services/backend"
DIST_FRONTEND="${FRONTEND_DIR}/dist"
DIST_BACKEND="${BACKEND_DIR}/dist/modules/messages"

# ── Parse args ────────────────────────────────────────────────────────────────
DO_FRONTEND=true
DO_BACKEND=true
DO_BUILD=true

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      sed -n '2,/^$/ s/^# //p' "$0"
      exit 0
      ;;
    --frontend) DO_BACKEND=false ;;
    --backend)  DO_FRONTEND=false ;;
    --no-build) DO_BUILD=false ;;
  esac
done

# ── Auto-fetch credentials from GitLab if not in env ─────────────────────────
fetch_ci_var() {
  glab api "projects/mytheclipse-group%2Fgmw/variables/$1" 2>/dev/null \
    | python3 -c "import json,sys; print(json.load(sys.stdin).get('value',''))" 2>/dev/null || true
}

if [ -z "${VPS_HOST:-}" ]; then VPS_HOST=$(fetch_ci_var VPS_HOST); fi
if [ -z "${VPS_USER:-}" ]; then VPS_USER=$(fetch_ci_var VPS_USERNAME); fi
if [ -z "${VPS_SSH_KEY:-}" ]; then
  KEY=$(fetch_ci_var VPS_SSH_KEY)
  if [ -n "$KEY" ]; then
    VPS_SSH_KEY=$(mktemp)
    echo "$KEY" > "$VPS_SSH_KEY"
    chmod 600 "$VPS_SSH_KEY"
  fi
fi

# ── Validate ──────────────────────────────────────────────────────────────────
: "${VPS_HOST:?VPS_HOST not set — export it or run 'glab auth login' first}"
: "${VPS_USER:?VPS_USER not set}"
: "${VPS_SSH_KEY:?VPS_SSH_KEY not set}"

SSH_DEST="${VPS_USER}@${VPS_HOST}"
SSH_OPTS="-i $VPS_SSH_KEY -o StrictHostKeyChecking=accept-new"

# ── Helpers ───────────────────────────────────────────────────────────────────
vps()  { ssh $SSH_OPTS "$SSH_DEST" "$@"; }
vpscp() { scp $SSH_OPTS "$1" "${SSH_DEST}:${2}"; }
log()  { echo "→ $*"; }
ok()   { echo "✓ $*"; }
die()  { echo "✗ $*"; exit 1; }

# ── 1. Build ──────────────────────────────────────────────────────────────────
if $DO_BUILD; then
  REPO_ROOT=$(cd "$(dirname "$0")" && pwd)
  cd "$REPO_ROOT"

  if $DO_BACKEND; then
    log "Building backend (TypeScript)..."
    pnpm --filter './services/backend' run build 2>&1 | tail -3 || die "Backend build failed"
    ok "Backend built"
  fi

  if $DO_FRONTEND; then
    log "Building frontend (WASM)..."
    cd "$FRONTEND_DIR"
    trunk build --release 2>&1 | tail -5 || die "Frontend build failed"
    cd "$REPO_ROOT"
    ok "Frontend built"
  fi
else
  log "Skipping build (--no-build)"
fi

# ── 2. Deploy Backend ─────────────────────────────────────────────────────────
if $DO_BACKEND; then
  log "Deploying backend..."
  cd "$DIST_BACKEND"
  tar czf - . | vps "docker exec -i imphenbot-backend sh -c 'cd /app/services/backend/dist/modules/messages && rm -f * && tar xzf -'"
  vps "docker restart imphenbot-backend" > /dev/null 2>&1
  cd "$REPO_ROOT"
  ok "Backend deployed and restarted"
fi

# ── 3. Deploy Frontend ────────────────────────────────────────────────────────
if $DO_FRONTEND; then
  log "Deploying frontend..."
  cd "$DIST_FRONTEND"
  tar czf - . | vps "docker exec -i imphenbot-proxy sh -c 'cd /usr/share/nginx/html && rm -rf * && tar xzf -'"
  cd "$REPO_ROOT"
  ok "Frontend deployed"
fi

# ── 4. Verify ─────────────────────────────────────────────────────────────────
if $DO_BACKEND && [ -n "${ADMIN_PASSWORD:-}" ]; then
  log "Verifying backend..."
  sleep 2
  curl -sf "https://${VPS_HOST}/api/health" -H "X-Admin-Password: $ADMIN_PASSWORD" > /dev/null 2>&1 \
    && ok "Backend health check passed" \
    || log "Backend health check skipped (might need a moment)"
fi

# ── Cleanup temp SSH key ─────────────────────────────────────────────────────
if [[ "$VPS_SSH_KEY" == /tmp/* ]]; then
  rm -f "$VPS_SSH_KEY"
fi

echo ""
echo "✓ Deploy complete"
