# CI/CD Overhaul Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate from hybrid CI/CD (GitHub Actions + GitLab CI + hot-deploy) to single Gitea CI pipeline with container registry — VPS pulls only.

**Architecture:** Three Docker images (backend, discord-gateway, proxy) built in Gitea CI, pushed to `git.imrnes.team/MythEclipse/GMW/*`, VPS pulls and restarts via SSH. No more hot-deploy bind-mounts.

**Tech Stack:** Gitea CI (Act Runner, GitHub Actions-compatible syntax), Docker Buildx, Gitea Container Registry, appleboy/ssh-action

## Global Constraints

- Docker images must be self-contained (no bind-mount overlay at runtime)
- All three images must be built from monorepo root using `infra/docker/Dockerfile.*`
- Frontend static export built inside proxy Dockerfile (multi-stage, Next.js → Nginx)
- Gitea CI variables: GITEA_REGISTRY_TOKEN (secret), VPS_HOST (secret), VPS_USER (secret), VPS_SSH_KEY (secret), ENV_FILE (secret), GITEA_REGISTRY (variable)
- Registry URL: `git.imrnes.team/MythEclipse/GMW/`
- Work on `main` branch only
- Must preserve voice recordings volume persistence across container restarts

---
### Task 1: Create Gitea CI workflow

**Files:**
- Create: `.gitea/workflows/deploy.yml`

**Interfaces:**
- Consumes: Dockerfiles at `infra/docker/Dockerfile.{backend,discord-gateway,proxy}`
- Produces: Docker images pushed to `git.imrnes.team/MythEclipse/GMW/bete-*:latest` and `:{sha}`
- Depends on: Task 2 (proxy Dockerfile), Task 3 (backend Dockerfile) — but workflow can reference files that are being written in the same commit

- [ ] **Step 1: Create `.gitea/workflows/` directory and `deploy.yml`**

```bash
mkdir -p .gitea/workflows
```

- [ ] **Step 2: Write the workflow file**

Create `.gitea/workflows/deploy.yml`:

```yaml
name: Build & Deploy
run-name: "Build & Deploy ${{ gitea.sha }}"

on:
  push:
    branches: [main]

jobs:
  build-and-push:
    runs-on: ubuntu-latest
    strategy:
      fail-fast: false
      max-parallel: 2
      matrix:
        service: [backend, discord-gateway, proxy]
    steps:
      - name: Checkout
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Set up Docker Buildx
        uses: docker/setup-buildx-action@v4

      - name: Login to Gitea Registry
        uses: docker/login-action@v4
        with:
          registry: ${{ vars.GITEA_REGISTRY }}
          username: ${{ gitea.actor }}
          password: ${{ secrets.GITEA_REGISTRY_TOKEN }}

      - name: Build & Push ${{ matrix.service }}
        uses: docker/build-push-action@v7
        with:
          context: .
          file: infra/docker/Dockerfile.${{ matrix.service }}
          push: true
          tags: |
            ${{ vars.GITEA_REGISTRY }}/MythEclipse/GMW/bete-${{ matrix.service }}:${{ gitea.sha }}
            ${{ vars.GITEA_REGISTRY }}/MythEclipse/GMW/bete-${{ matrix.service }}:latest
          cache-from: type=gha,scope=bete-${{ matrix.service }}
          cache-to: type=gha,mode=max,scope=bete-${{ matrix.service }}
          build-args: |
            VITE_BE_API_URL=https://imphnen.asepharyana.my.id
            VITE_BE_WS_URL=wss://imphnen.asepharyana.my.id

  deploy:
    needs: build-and-push
    runs-on: ubuntu-latest
    if: gitea.ref == 'refs/heads/main'
    steps:
      - name: Deploy to VPS
        uses: appleboy/ssh-action@v1.2.5
        env:
          ENV_FILE: ${{ secrets.ENV_FILE }}
        with:
          host: ${{ secrets.VPS_HOST }}
          username: ${{ secrets.VPS_USER }}
          key: ${{ secrets.VPS_SSH_KEY }}
          envs: ENV_FILE
          script: |
            set -eu
            APP_DIR=/opt/imphenbot
            cd "$APP_DIR/infra/docker"
            printf '%s\n' "$ENV_FILE" | tr -d '\r' > .env
            docker compose pull
            docker compose up -d --remove-orphans
            docker image prune -f
```

Note: Gitea's Act Runner supports `gitea.*` context variables (`gitea.sha`, `gitea.actor`, `gitea.ref`). If `gitea.*` vars don't resolve, fall back to `github.*` equivalents (Act Runner emulates GitHub context).

- [ ] **Step 3: Commit**

```bash
git add .gitea/workflows/deploy.yml
git commit -m "ci: add Gitea CI workflow for build & deploy

Gitea CI builds three Docker images (backend, discord-gateway, proxy),
pushes to Gitea Container Registry, then deploys to VPS via SSH pull.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 2: Rewrite Dockerfile.proxy for Next.js static export

**Files:**
- Rewrite: `infra/docker/Dockerfile.proxy`

**Interfaces:**
- Consumes: `services/frontend/` (Next.js app), `packages/shared/` (workspace dep), `infra/docker/nginx/nginx.conf`
- Produces: Nginx image serving Next.js static export at `/usr/share/nginx/html/`

- [ ] **Step 1: Rewrite Dockerfile.proxy**

Replace entire content with:

```dockerfile
# ---- Stage 1: Build Next.js static export ----
FROM node:22-slim AS frontend-builder

WORKDIR /app

# Install pnpm
RUN corepack enable

# Install build essentials for native deps
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    python3 make g++ && rm -rf /var/lib/apt/lists/*

# Copy dependency manifests first for layer caching
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY packages/shared/package.json ./packages/shared/package.json
COPY services/frontend/package.json ./services/frontend/package.json
COPY services/frontend/tsconfig.json ./services/frontend/tsconfig.json

# Install dependencies (frontend + shared)
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter './packages/shared' --filter './services/frontend'

# Copy source code
COPY packages/shared/ ./packages/shared/
COPY services/frontend/ ./services/frontend/

# Pass API/WS URLs as build args for the frontend
ARG VITE_BE_API_URL
ARG VITE_BE_WS_URL
ENV VITE_BE_API_URL=${VITE_BE_API_URL}
ENV VITE_BE_WS_URL=${VITE_BE_WS_URL}

# Build shared lib first, then frontend static export
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter './packages/shared' run build
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm --filter frontend run build

# ---- Stage 2: Nginx ----
FROM nginx:alpine

# Nginx config (API/WS proxy + static file serving)
COPY infra/docker/nginx/nginx.conf /etc/nginx/conf.d/default.conf

# Static export from frontend builder
COPY --from=frontend-builder /app/services/frontend/out/ /usr/share/nginx/html/

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=3s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
```

- [ ] **Step 2: Validate nginx.conf handles static files correctly**

Read and confirm `infra/docker/nginx/nginx.conf`.

```bash
cat infra/docker/nginx/nginx.conf
```

Verify it has:
- Static file location with `try_files $uri /index.html` (SPA fallback)
- `/api` and `/ws` proxied to `http://backend:3000`

- [ ] **Step 3: Commit**

```bash
git add infra/docker/Dockerfile.proxy
git commit -m "docker(proxy): rewrite for Next.js static export

Replaced stale Rust WASM build with multi-stage Docker build:
stage 1 builds Next.js static export, stage 2 serves via Nginx.
Includes VITE_BE_API_URL/VITE_BE_WS_URL build args.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 3: Add build args to Dockerfile.backend

**Files:**
- Modify: `infra/docker/Dockerfile.backend`

- [ ] **Step 1: Add VITE build args to Dockerfile.backend**

Insert after `WORKDIR /app`:

```dockerfile
# Build args for frontend API URLs (passed through for future use)
ARG VITE_BE_API_URL
ARG VITE_BE_WS_URL
ENV VITE_BE_API_URL=${VITE_BE_API_URL}
ENV VITE_BE_WS_URL=${VITE_BE_WS_URL}
```

Note: These are consumed by the proxy Dockerfile (Task 2), not needed by backend itself but passed through the CI workflow to all three images for consistency.

- [ ] **Step 2: Commit**

```bash
git add infra/docker/Dockerfile.backend
git commit -m "docker(backend): add VITE_BE_API_URL and VITE_BE_WS_URL build args

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 4: Rewrite docker-compose.yml for Gitea registry + no bind-mounts

**Files:**
- Rewrite: `infra/docker/docker-compose.yml`

- [ ] **Step 1: Write new docker-compose.yml**

Replace entire content:

```yaml
version: '3.8'

services:
  proxy:
    image: ${GITEA_REGISTRY}/MythEclipse/GMW/bete-proxy:${IMAGE_TAG:-latest}
    container_name: imphenbot-proxy
    restart: unless-stopped
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.imphenbot.rule=Host(`imphnen.asepharyana.my.id`)"
      - "traefik.http.routers.imphenbot.entrypoints=websecure"
      - "traefik.http.routers.imphenbot.tls=true"
      - "traefik.http.services.imphenbot.loadbalancer.server.port=80"
    depends_on:
      - backend
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://127.0.0.1/"]
      interval: 30s
      timeout: 5s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 64M
    networks:
      - app-shared-net

  backend:
    image: ${GITEA_REGISTRY}/MythEclipse/GMW/bete-backend:${IMAGE_TAG:-latest}
    container_name: imphenbot-backend
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
      WEBSERVER_PORT: 3000
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/api/health"]
      interval: 30s
      timeout: 10s
      start_period: 15s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 256M
    networks:
      - app-shared-net

  discord-gateway:
    image: ${GITEA_REGISTRY}/MythEclipse/GMW/bete-discord-gateway:${IMAGE_TAG:-latest}
    container_name: imphenbot-discord-gateway
    restart: unless-stopped
    env_file:
      - .env
    environment:
      NODE_ENV: production
    volumes:
      - recordings:/app/recordings
    healthcheck:
      test: ["CMD-SHELL", "kill -0 1 || exit 1"]
      interval: 30s
      timeout: 5s
      start_period: 30s
      retries: 3
    deploy:
      resources:
        limits:
          memory: 512M
    networks:
      - app-shared-net

volumes:
  recordings:

networks:
  app-shared-net:
    name: app-shared-net
    external: true
```

Key changes:
- Image refs: `registry.gitlab.com/...` → `${GITEA_REGISTRY}/MythEclipse/GMW/...`
- Removed all bind-mount volumes: `./backend-dist`, `./gateway-dist`, `./frontend-dist`, `./shared-dist`
- Changed `./recordings` bind-mount → named volume `recordings:` (persists across restarts)
- Added `depends_on: backend` to proxy (proxy needs backend for API/WS, though Nginx handles startup gracefully)

- [ ] **Step 2: Commit**

```bash
git add infra/docker/docker-compose.yml
git commit -m "docker(compose): switch to Gitea registry, remove bind-mounts

Images now come from git.imrnes.team/MythEclipse/GMW. All hot-deploy
bind-mounts removed — containers are fully self-contained. Voice
recordings use a named volume instead of bind-mount.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 5: Create lightweight deploy.sh

**Files:**
- Create: `deploy.sh`

- [ ] **Step 1: Write deploy.sh**

```bash
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
  docker ps --filter "name=imphenbot" --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
REMOTESCRIPT

echo "=== Deploy complete ==="
```

- [ ] **Step 2: Make executable**

```bash
chmod +x deploy.sh
```

- [ ] **Step 3: Commit**

```bash
git add deploy.sh
git commit -m "chore: rewrite deploy.sh as lightweight SSH pull script

Replaced hot-deploy tar-pipe script with simple SSH-based deploy
that pulls latest images from Gitea registry and restarts containers.

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 6: Disable old CI files

**Files:**
- Disable: `.github/workflows/deploy-docker.yml`
- Keep: `.gitlab-ci.yml` if exists (already may have been removed)

- [ ] **Step 1: Rename GitHub Actions workflow to .disabled**

```bash
mv .github/workflows/deploy-docker.yml .github/workflows/deploy-docker.yml.disabled
```

- [ ] **Step 2: Remove docker compose file's old frontend-dist directory from git** (if tracked)

```bash
# Check if frontend-dist is tracked (it should be gitignored, but check)
git ls-files infra/docker/frontend-dist 2>/dev/null || echo "Not tracked — OK"
```

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy-docker.yml.disabled
git rm --cached .github/workflows/deploy-docker.yml 2>/dev/null || true
git commit -m "ci: disable GitHub Actions workflow

Renamed to .disabled. All CI now goes through Gitea CI (.gitea/workflows/).

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 7: Update .gitignore

**Files:**
- Modify: `.gitignore`

- [ ] **Step 1: Add .gitea exclusion note and any missing entries**

Read current `.gitignore`:

```bash
cat .gitignore
```

Then append (only if not already present):

```
# Gitea workflow logs (local runners)
.gitea/workflows/*.log
```

The `.gitea/workflows/` YAML files themselves should be tracked in git.

- [ ] **Step 2: Commit**

```bash
git add .gitignore
git commit -m "chore: update gitignore for Gitea CI artifacts

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---
### Task 8: Push and verify CI pipeline

- [ ] **Step 1: Verify all changes**

```bash
git status
git log --oneline -10
```

Expected: clean working tree, all 7 commits ready to push.

- [ ] **Step 2: Push to main**

```bash
git push origin main
```

- [ ] **Step 3: Monitor CI run**

Watch Gitea CI at `https://git.imrnes.team/MythEclipse/GMW/actions`.

Expected outcome:
1. `build-and-push` job runs 3 matrix builds (backend, discord-gateway, proxy) in parallel (max 2)
2. Each image is pushed to `git.imrnes.team/MythEclipse/GMW/bete-*` with both `:latest` and `:{sha}` tags
3. `deploy` job SSHes into VPS, pulls images, restarts containers
4. All 3 containers `imphenbot-proxy`, `imphenbot-backend`, `imphenbot-discord-gateway` are running

- [ ] **Step 4: Verify containers on VPS**

```bash
# SSH into VPS and check
ssh -i "$VPS_SSH_KEY" "$VPS_USER@$VPS_HOST" "
  docker ps --filter 'name=imphenbot' --format 'table {{.Names}}\t{{.Image}}\t{{.Status}}'
  docker compose -f /opt/imphenbot/infra/docker/docker-compose.yml ps
"
```

- [ ] **Step 5: Verify no hot-deploy artifacts remain**

```bash
ssh -i "$VPS_SSH_KEY" "$VPS_USER@$VPS_HOST" "
  ls -la /opt/imphenbot/infra/docker/ | grep -E 'dist$' || echo 'No dist dirs — clean'
"
```

---
## Rollback

If the pipeline fails at any point:

1. **Fix and re-push**: Edit the broken file, commit, push to main — CI re-runs automatically
2. **Emergency rollback**: SSH to VPS, run `docker compose up -d` with a known-good IMAGE_TAG:
   ```bash
   IMAGE_TAG=<last-working-sha> docker compose up -d
   ```
3. **Restore old CI**: Move `.github/workflows/deploy-docker.yml.disabled` back and push
