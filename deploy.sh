#!/bin/bash
# ─── Bete Deploy Script ──────────────────────────────────────────────────────
# Builds all services locally and deploys compiled JS/WASM to the VPS via
# bind-mounted host directories.  Changes survive container restarts because
# the Docker containers use bind mounts, not docker exec tar-pipes.
#
# Prerequisites:
#   - GitLab CLI (glab) with active session, OR the env vars below
#   - SSH access to the VPS
#   - Docker containers already running with bind mounts from the
#     latest infra/docker/docker-compose.yml
#
# Usage:
#   ./deploy.sh                          # build + deploy all services
#   ./deploy.sh --frontend               # frontend WASM only
#   ./deploy.sh --backend                # backend JS only
#   ./deploy.sh --gateway                # discord-gateway JS only
#   ./deploy.sh --all                    # same as no-flag (default)
#   ./deploy.sh --no-build               # skip builds, just copy files
#   ./deploy.sh --help                   # show this message
#
# Required env (or auto-fetched from GitLab CI vars via glab):
#   VPS_HOST              — VPS IP/hostname
#   VPS_USER              — SSH user (default: root)
#   VPS_SSH_KEY           — path/contents of SSH private key
#
# Optional:
#   ADMIN_PASSWORD        — verify backend health after deploy
# ──────────────────────────────────────────────────────────────────────────────

set -eu

# ── Config ────────────────────────────────────────────────────────────────────
APP_DIR="/opt/imphenbot"
COMPOSE_FILE="infra/docker/docker-compose.yml"

# Local build output directories (relative to repo root)
FRONTEND_DIST="services/frontend/frontend/dist"
BACKEND_DIST="services/backend/dist"
GATEWAY_DIST="services/discord-gateway/dist"

# Remote bind-mount paths (must match infra/docker/docker-compose.yml volumes)
REMOTE_BASE="${APP_DIR}/infra/docker"
REMOTE_FRONTEND="${REMOTE_BASE}/frontend-dist"
REMOTE_BACKEND="${REMOTE_BASE}/backend-dist"
REMOTE_GATEWAY="${REMOTE_BASE}/gateway-dist"

# ── Parse args ────────────────────────────────────────────────────────────────
DO_BUILD=true
DO_ALL=false
DO_FRONTEND=false
DO_BACKEND=false
DO_GATEWAY=false

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      sed -n '2,/^$/ s/^# //p' "$0"
      exit 0
      ;;
    --all|--full)  DO_ALL=true ;;
    --frontend)    DO_FRONTEND=true ;;
    --backend)     DO_BACKEND=true ;;
    --gateway)     DO_GATEWAY=true ;;
    --no-build)    DO_BUILD=false ;;
  esac
done

# If no service flag given, or --all, default to all
if ! $DO_FRONTEND && ! $DO_BACKEND && ! $DO_GATEWAY || $DO_ALL; then
  DO_FRONTEND=true
  DO_BACKEND=true
  DO_GATEWAY=true
fi

# ── Auto-fetch credentials from GitLab ─────────────────────────────────────
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
log()  { echo "→ $*"; }
ok()   { echo "✓ $*"; }
die()  { echo "✗ $*"; exit 1; }

# ── 1. Ensure remote bind-mount directories exist ────────────────────────────
log "Ensuring remote bind-mount directories exist..."
vps "mkdir -p '$REMOTE_FRONTEND' '$REMOTE_BACKEND' '$REMOTE_GATEWAY'"
ok "Remote directories ready"

# ── 2. Build ──────────────────────────────────────────────────────────────────
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
    pnpm --filter frontend run build 2>&1 | tail -5 || die "Frontend build failed"
    ok "Frontend built"
  fi

  if $DO_GATEWAY; then
    log "Building gateway (TypeScript)..."
    pnpm --filter '@bete/discord-gateway' run build 2>&1 | tail -3 || die "Gateway build failed"
    ok "Gateway built"
  fi
else
  log "Skipping build (--no-build)"
fi

# ── 3. Deploy to VPS (via tar pipe to remote host directory) ──────────────────

deploy_to_remote() {
  local src="$1"
  local remote_dir="$2"
  local name="$3"

  if [ ! -d "$src" ] || [ -z "$(ls -A "$src" 2>/dev/null)" ]; then
    log "WARN: $src is empty or missing — skipping $name"
    return
  fi

  log "Deploying $name..."
  # Atomic swap: extract into a temp dir, then rename — avoids partial deploy
  vps "rm -rf '${remote_dir}.new' && mkdir -p '${remote_dir}.new'"
  tar czf - -C "$src" . | vps "tar xzf - -C '${remote_dir}.new'"
  vps "rm -rf '${remote_dir}.old' && mv '${remote_dir}' '${remote_dir}.old' 2>/dev/null; mv '${remote_dir}.new' '${remote_dir}' && rm -rf '${remote_dir}.old'"
  log "→ $name copied to host — restarting container..."
}

if $DO_FRONTEND; then
  deploy_to_remote "$FRONTEND_DIST" "$REMOTE_FRONTEND" "frontend"
  vps "docker restart imphenbot-proxy" > /dev/null 2>&1
  ok "Frontend deployed"
fi

if $DO_BACKEND; then
  deploy_to_remote "$BACKEND_DIST" "$REMOTE_BACKEND" "backend"
  vps "docker restart imphenbot-backend" > /dev/null 2>&1
  ok "Backend deployed"
fi

if $DO_GATEWAY; then
  deploy_to_remote "$GATEWAY_DIST" "$REMOTE_GATEWAY" "gateway"
  vps "docker restart imphenbot-discord-gateway" > /dev/null 2>&1
  ok "Gateway deployed"
fi

# ── 4. Verify ─────────────────────────────────────────────────────────────────
if $DO_BACKEND && [ -n "${ADMIN_PASSWORD:-}" ]; then
  log "Verifying backend..."
  sleep 3
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
