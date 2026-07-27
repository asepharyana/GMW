# CI/CD Overhaul: Gitea CI + Container Registry Design

**Status:** Draft
**Last updated:** 2026-07-27

## 1. Problem Statement

The current CI/CD pipeline has multiple issues:

1. **Split across 3 CI systems**: GitHub Actions (build + deploy), GitLab CI (build only, no deploy), and `deploy.sh` (hot-deploy bind-mounts)
2. **Registry mismatch**: GitHub Actions pushes to `ghcr.io` but `docker-compose.yml` references `registry.gitlab.com` — the deploy route is unclear
3. **Hot-deploy complexity**: `deploy.sh` builds locally, tars dist files, SSH pipes, and binds into containers at runtime. Fragile and not reproducible
4. **No frontend in Docker**: Frontend is never built into an image — only hot-deployed via bind-mounts
5. **Stale Dockerfile**: `Dockerfile.proxy` builds a Rust WASM frontend that no longer exists
6. **Dockerfile.frontend is missing**: Frontend image doesn't exist at all
7. **Shared package fragility**: The previous refactor added `@bete/shared/database/init` export, but Docker images built from `master` don't have it — containers crash

## 2. Goal

Single CI/CD pipeline that:

- Builds Docker images for all 3 services (backend, discord-gateway, proxy-serving-frontend)
- Pushes them to Gitea's built-in Container Registry
- On the VPS, only pulls images and restarts containers — no more hot-deploy bind-mounts
- All 3 services built in one pipeline, deployed together atomically

## 3. Architecture

```
Developer pushes to main
        │
        ▼
┌────────────────────────────┐
│  Gitea Runner (server X)   │
│                            │
│  Job 1: build-and-push     │
│  ├── bete-backend:latest   │──────────▶ Gitea Container Registry
│  ├── bete-discord-gateway  │──────────▶ git.imrnes.team/MythEclipse/GMW/
│  │     :latest             │              bete-backend:{sha,latest}
│  └── bete-proxy:latest     │──────────▶ bete-discord-gateway:{sha,latest}
│                            │──────────▶ bete-proxy:{sha,latest}
│  Job 2: deploy (SSH)       │
│  └─── SSH ke VPS ──────────┤
└────────────────────────────┘
        │
        ▼
┌────────────────────────────┐
│  VPS Production            │
│  /opt/imphenbot/infra/     │
│  docker/                   │
│                            │
│  docker compose pull       │
│  docker compose up -d      │
│  docker image prune -f     │
│                            │
│  3 containers:             │
│  ┌────────┐ ┌──────────┐   │
│  │ proxy  │ │  backend │   │
│  │  :80   │ │  :3000   │   │
│  └───┬────┘ └──────────┘   │
│      │    ┌─────────────┐  │
│      └────┤discord-     │  │
│           │gateway      │  │
│           └─────────────┘  │
└────────────────────────────┘
```

### 3.1 Service Images

| Image | From | Runs |
|-------|------|------|
| `bete-backend` | `Dockerfile.backend` | Express HTTP/WS on port 3000 |
| `bete-discord-gateway` | `Dockerfile.discord-gateway` | Discord client, internal only |
| `bete-proxy` | `Dockerfile.proxy` (rewritten) | Nginx serving frontend + proxying `/api` and `/ws` to backend |

### 3.2 Registry

Gitea provides a built-in container registry per repository at:
```
git.imrnes.team/MythEclipse/GMW/<image-name>:<tag>
```

Images are tagged with both `latest` and the commit SHA for traceability.

## 4. Files to Create / Modify

### 4.1 Create: `.gitea/workflows/deploy.yml`

One workflow, two jobs:

```yaml
name: Build & Deploy
on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        service: [backend, discord-gateway, proxy]
      max-parallel: 2
    steps:
      - uses: actions/checkout@v4
        with:
          submodules: recursive
      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v3
      - name: Login to Gitea Registry
        uses: docker/login-action@v3
        with:
          registry: ${{ vars.GITEA_REGISTRY }}
          username: ${{ github.actor }}
          password: ${{ secrets.GITEA_REGISTRY_TOKEN }}
      - name: Build & Push
        uses: docker/build-push-action@v6
        with:
          context: .
          file: infra/docker/Dockerfile.${{ matrix.service }}
          push: true
          tags: |
            ${{ vars.GITEA_REGISTRY }}/${{ github.repository }}/bete-${{ matrix.service }}:${{ github.sha }}
            ${{ vars.GITEA_REGISTRY }}/${{ github.repository }}/bete-${{ matrix.service }}:latest
          cache-from: type=gha
          cache-to: type=gha,mode=max

  deploy:
    runs-on: ubuntu-latest
    needs: build-and-push
    if: github.ref == 'refs/heads/main'
    steps:
      - name: SSH & Deploy
        uses: appleboy/ssh-action@v1.2.5
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          script: |
            cd /opt/imphenbot/infra/docker
            echo "${{ secrets.ENV_FILE }}" > .env
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

Note: Gitea CI uses GitHub Actions-compatible syntax (Act Runner). The above uses the standard `actions/*` actions and `docker/*` actions that work with both GitHub and Gitea. If Gitea's runner doesn't fully support `docker/build-push-action`, fallback to inline `docker build` and `docker push` commands.

Sensitive variables: `GITEA_REGISTRY_TOKEN`, `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `ENV_FILE` set in Gitea repo Settings → Actions → Secrets. Non-sensitive: `GITEA_REGISTRY` as a Variable.

### 4.2 Rewrite: `Dockerfile.proxy`

Current proxy Dockerfile builds a Rust WASM frontend (stale — no longer exists in codebase). Replace with multi-stage build:

```dockerfile
# Stage 1: Build frontend (Next.js 16 static export)
FROM node:22-slim AS frontend-builder

WORKDIR /app

# Install pnpm
RUN corepack enable

# Copy dependency manifests
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/frontend/package.json ./services/frontend/package.json

# Install dependencies
RUN pnpm install --frozen-lockfile --filter './services/frontend' --filter '@bete/shared'

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY services/frontend/ ./services/frontend/

# Build Next.js static export
RUN pnpm --filter frontend run build
# Result in services/frontend/out/

# Stage 2: Nginx
FROM nginx:alpine

# Nginx config
COPY infra/docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Static frontend files
COPY --from=frontend-builder /app/services/frontend/out/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1
```

### 4.3 Modify: `Dockerfile.backend`

Add `VITE_BE_API_URL` and `VITE_BE_WS_URL` build args (already listed in GitHub Actions but not in Dockerfile):

```dockerfile
# Add to existing Dockerfile.backend — after FROM, before WORKDIR
ARG VITE_BE_API_URL
ARG VITE_BE_WS_URL
ENV VITE_BE_API_URL=${VITE_BE_API_URL}
ENV VITE_BE_WS_URL=${VITE_BE_WS_URL}
```

These build args are now consumed at build time for future-proofing even though they were previously only needed for frontend builds (which now lives in the proxy Dockerfile).

### 4.4 Modify: `Dockerfile.discord-gateway`

No structural changes needed — verify Drizzle migrations path:

```dockerfile
# COPY drizzle, line in existing Dockerfile.discord-gateway:
COPY services/discord-gateway/drizzle/ ./services/discord-gateway/drizzle/
# This should work as-is since workspace is copied at /app
```

### 4.5 Rewrite: `deploy.sh`

From hot-deploy tar-pipe SSH to lightweight SSH exec:

```bash
#!/bin/bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
INFRA_DIR="$SCRIPT_DIR/infra/docker"

: "${VPS_HOST:?required}"
: "${VPS_USER:?required}"
: "${VPS_SSH_KEY:?required}"

echo "=== Deploy to $VPS_HOST ==="

# Copy .env if it exists locally
if [ -f "$INFRA_DIR/.env" ]; then
  scp -i "$VPS_SSH_KEY" "$INFRA_DIR/.env" "$VPS_USER@$VPS_HOST:/opt/imphenbot/infra/docker/.env"
fi

ssh -i "$VPS_SSH_KEY" "$VPS_USER@$VPS_HOST" << 'REMOTESCRIPT'
  set -e
  cd /opt/imphenbot/infra/docker
  echo "=== Pulling images ==="
  docker compose pull
  echo "=== Restarting containers ==="
  docker compose up -d --remove-orphans
  echo "=== Cleaning up ==="
  docker image prune -f
  echo "=== Verify ==="
  docker ps --filter "name=imphenbot" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
REMOTESCRIPT

echo "=== Deploy complete ==="
```

### 4.6 Rewrite: `infra/docker/docker-compose.yml`

Replace all GitLab registry image references with Gitea registry. Remove bind-mounts. Add recordings named volume.

```yaml
version: "3.8"

services:
  proxy:
    image: ${GITEA_REGISTRY}/${GITEA_REPO}/bete-proxy:${IMAGE_TAG:-latest}
    container_name: imphenbot-proxy
    restart: unless-stopped
    ports:
      - "127.0.0.1:8080:80"
    networks:
      - app-shared-net
    healthcheck:
      test: wget -qO- http://localhost:80/ || exit 1
      interval: 30s
      timeout: 3s
      start_period: 10s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 64M
    labels:
      traefik.enable: "true"
      traefik.http.routers.imphenbot.rule: "Host(`imphnen.asepharyana.my.id`)"
      traefik.http.routers.imphenbot.entrypoints: websecure
      traefik.http.routers.imphenbot.tls: "true"
      traefik.http.services.imphenbot.loadbalancer.server.port: "80"

  backend:
    image: ${GITEA_REGISTRY}/${GITEA_REPO}/bete-backend:${IMAGE_TAG:-latest}
    container_name: imphenbot-backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      WEBSERVER_PORT: 3000
    networks:
      - app-shared-net
    healthcheck:
      test: wget -qO- http://localhost:3000/api/health || exit 1
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
    depends_on:
      - proxy

  discord-gateway:
    image: ${GITEA_REGISTRY}/${GITEA_REPO}/bete-discord-gateway:${IMAGE_TAG:-latest}
    container_name: imphenbot-discord-gateway
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
    volumes:
      - recordings:/app/recordings
    networks:
      - app-shared-net
    healthcheck:
      test: sh -c "kill -0 1"
      interval: 30s
      timeout: 5s
      start_period: 20s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M

volumes:
  recordings:

networks:
  app-shared-net:
    external: true
```

Key changes:
- Image refs: `registry.gitlab.com/mytheclipse-group/gmw/...` → `${GITEA_REGISTRY}/${GITEA_REPO}/...`
- **All bind-mounts removed** (`./backend-dist`, `./gateway-dist`, `./frontend-dist`, `./shared-dist`)
- `recordings` → named volume (persists across container restarts/recreates)
- `proxy` binds to `127.0.0.1:8080` instead of host port 80 (Traefik handles external routing)
- Added `depends_on: proxy` to backend for startup ordering

### 4.7 Remove: GitHub Actions & GitLab CI files

After Gitea CI is verified working:
- Delete `.github/workflows/deploy-docker.yml` (or rename to `.github/workflows/deploy-docker.yml.disabled`)
- Delete `.gitlab-ci.yml` (or rename to `.gitlab-ci.yml.disabled`)

### 4.8 Ensure: `.gitea/workflows/` directory

The directory must exist in git. Some setups ignore `.gitea/` — verify `.gitignore` does not exclude it.

## 5. Gitea Registry Integration

### 5.1 Enable Container Registry in Gitea

In Gitea Admin Settings:
- Go to Settings → Repository → Enable "Container Registry"
- Default registry URL format: `gitea.<domain>/<owner>/<repo>`

### 5.2 Registry Token

Create a Gitea access token with `read` and `write` access to packages:
- Settings → Applications → Generate Token → `registry-token` → scope: `write:packages`

### 5.3 CI Variables

Set these in Gitea repo → Settings → Actions → Secrets:

| Name | Example Value | Notes |
|------|---------------|-------|
| `GITEA_REGISTRY_TOKEN` | `gitea_token_abc123` | Docker login password |
| `VPS_HOST` | `123.123.123.123` | VPS IP/hostname |
| `VPS_USER` | `root` | SSH user |
| `VPS_SSH_KEY` | `-----BEGIN OPENSSH PRIVATE KEY-----...` | Private key |
| `ENV_FILE` | full .env content | Written to VPS before compose |

As Variables (not secrets, visible but non-sensitive):

| Name | Example Value | Notes |
|------|---------------|-------|
| `GITEA_REGISTRY` | `git.imrnes.team` | Registry hostname — no protocol prefix |

### 5.4 VPS Setup (one-time)

```bash
# 1. Docker login to Gitea registry
docker login git.imrnes.team
# Use Gitea username + access token (with write:packages scope)

# 2. Create recordings named volume
docker volume create imphenbot_recordings

# 3. Remove old bind-mount directories (after verifying old containers stopped)
rm -rf /opt/imphenbot/infra/docker/backend-dist
rm -rf /opt/imphenbot/infra/docker/gateway-dist
rm -rf /opt/imphenbot/infra/docker/shared-dist
rm -rf /opt/imphenbot/infra/docker/frontend-dist

# 4. Ensure compose file is updated (via git pull)
cd /opt/imphenbot && git pull origin main
```

## 6. Migration Plan

### Phase 1: Prepare (this session)

1. Write `.gitea/workflows/deploy.yml` 
2. Rewrite `Dockerfile.proxy` for Next.js
3. Modify `infra/docker/docker-compose.yml` for Gitea registry + named volumes
4. Rewrite `deploy.sh` to SSH-only
5. Mark old CI files as disabled (rename, not delete yet)
6. Add VITE_BE_API_URL/VITE_BE_WS_URL build args to backend Dockerfile

### Phase 2: VPS Preparation (one-time SSH)

7. User runs `docker login` to Gitea registry on VPS
8. User sets CI secrets in Gitea UI
9. User creates `imphenbot_recordings` named volume

### Phase 3: Deploy

10. Commit and push to `main`
11. Gitea CI triggers — builds 3 images, pushes to registry
12. Deploy job SSHes into VPS, pulls images, restarts containers
13. Verify with `docker ps` and health checks

### Phase 4: Cleanup

14. After all services running stably for 1-2 pushes: delete old CI files
15. Remove old Dockerfiles if no longer referenced

## 7. Rollback Plan

If something goes wrong:

1. **Quick rollback**: `docker compose up -d` with previous `IMAGE_TAG` (pin to last working SHA)
2. **Full rollback**: Revert git changes, push to `main` — Gitea CI will rebuild with old config
3. **Emergency**: SSH to VPS, use `docker compose` commands to restart specific containers

## 8. Future Considerations

- **Auto-deploy on tag**: Optionally trigger CI only on version tags (`v*`) instead of every `main` push
- **Health check notifications**: Add webhook notification on deploy failure
- **Multi-architecture builds**: Add `--platform linux/amd64,linux/arm64` for future ARM VPS migration
- **Secrets management**: Consider HashiCorp Vault or Gitea's built-in encrypted secrets for larger teams