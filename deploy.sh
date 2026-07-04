#!/bin/bash
# ─── Bete Manual Deploy Script ───────────────────────────────────────────────
# Pulls Docker images from GitLab Container Registry and restarts containers.
#
# Usage:
#   ./deploy.sh                 # deploy :latest
#   ./deploy.sh <sha>           # deploy specific commit SHA
#   ./deploy.sh --help          # show this help
#
# Required env:
#   VPS_HOST        — VPS IP/hostname
#   VPS_USER        — SSH user
#   VPS_SSH_KEY     — path to SSH private key
#   GITLAB_TOKEN    — GitLab Personal Access Token (for docker login)
#
# Optional env:
#   APP_DIR         — app directory on VPS (default: /opt/imphenbot)
#   GITLAB_USER     — GitLab username (default: gitlab-ci-token)
#   REGISTRY        — container registry (default: registry.gitlab.com)
#   COMPOSE_FILE    — path relative to APP_DIR (default: infra/docker/docker-compose.yml)
# ──────────────────────────────────────────────────────────────────────────────

set -eu

if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  sed -n '2,/^$/ s/^# //p' "$0"
  exit 0
fi

# ── Config ────────────────────────────────────────────────────────────────────
IMAGE_TAG="${1:-latest}"
APP_DIR="${APP_DIR:-/opt/imphenbot}"
COMPOSE_FILE="${COMPOSE_FILE:-infra/docker/docker-compose.yml}"
REGISTRY="${REGISTRY:-registry.gitlab.com}"
GITLAB_USER="${GITLAB_USER:-gitlab-ci-token}"

# ── Required vars ─────────────────────────────────────────────────────────────
: "${VPS_HOST:?Required: VPS_HOST}"
: "${VPS_USER:?Required: VPS_USER}"
: "${VPS_SSH_KEY:?Required: VPS_SSH_KEY}"
: "${GITLAB_TOKEN:?Required: GITLAB_TOKEN}"

SSH_DEST="${VPS_USER}@${VPS_HOST}"

# ── Helper: run command on VPS ────────────────────────────────────────────────
vps() {
  ssh -i "$VPS_SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_DEST" "$@"
}

# ── Steps ─────────────────────────────────────────────────────────────────────
echo "→ Deploying tag: ${IMAGE_TAG}"
echo "→ Target:         ${SSH_DEST}:${APP_DIR}"
echo ""

echo "→ Copying ${COMPOSE_FILE} to VPS..."
scp -i "$VPS_SSH_KEY" -o StrictHostKeyChecking=accept-new \
  "$COMPOSE_FILE" "${SSH_DEST}:${APP_DIR}/${COMPOSE_FILE}"

echo "→ Logging in to GitLab Container Registry..."
vps "echo '${GITLAB_TOKEN}' | docker login ${REGISTRY} -u '${GITLAB_USER}' --password-stdin"

echo "→ Pulling images (tag: ${IMAGE_TAG})..."
vps "cd ${APP_DIR} && IMAGE_TAG=${IMAGE_TAG} docker compose -f ${COMPOSE_FILE} pull"

echo "→ Restarting containers..."
vps "cd ${APP_DIR} && IMAGE_TAG=${IMAGE_TAG} docker compose -f ${COMPOSE_FILE} up -d --remove-orphans"

echo "→ Restarting proxy (nginx upstream DNS refresh)..."
vps "cd ${APP_DIR} && IMAGE_TAG=${IMAGE_TAG} docker compose -f ${COMPOSE_FILE} restart proxy"

echo "→ Cleaning up old images..."
vps "docker image prune -f"

echo ""
echo "✓ Deploy complete (tag: ${IMAGE_TAG})"
