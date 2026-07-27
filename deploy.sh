#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra/docker"

: "${VPS_HOST:?required}"
: "${VPS_USER:?required}"
: "${VPS_SSH_KEY:?required}"

echo "=== Deploy to $VPS_HOST ==="

# Copy local .env if it exists (overrides CI env)
if [ -f "$INFRA_DIR/.env" ]; then
  scp -i "$VPS_SSH_KEY" "$INFRA_DIR/.env" "$VPS_USER@$VPS_HOST:/opt/imphenbot/infra/docker/.env"
fi

ssh -i "$VPS_SSH_KEY" "$VPS_USER@$VPS_HOST" << 'REMOTESCRIPT'
  set -eu
  cd /opt/imphenbot/infra/docker
  echo "=== Pulling images ==="
  docker compose pull
  echo "=== Restarting containers ==="
  docker compose up -d --remove-orphans
  echo "=== Cleaning up ==="
  docker image prune -f
  echo "=== Active containers ==="
  docker ps --filter "name=imphenbot" --format "table {{.Names}}	{{.Image}}	{{.Status}}"
REMOTESCRIPT

echo "=== Deploy complete ==="
