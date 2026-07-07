# Gitea Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate this repository to `MythEclipse/GMW` on self-hosted Gitea and add a Gitea Actions CI/CD workflow that lint/builds the project and deploys with the existing deploy script.

**Architecture:** Keep deployment provider-neutral by making `deploy.sh` consume shell environment variables only, then have Gitea Actions prepare the build artifacts, `.env`, and temporary SSH key before calling `./deploy.sh --no-build`. Treat Gitea repository creation, remote migration, push, and workflow-run verification as the final outward-facing step after local lint/build verification succeeds.

**Tech Stack:** Bash, Gitea Actions YAML, `tea` CLI, git, pnpm 11.1.3, Node.js 22, Rust stable, Trunk 0.22.0-beta.1, PostgreSQL/Redis-backed existing services.

## Global Constraints

- Target Gitea owner/repo: `MythEclipse/GMW`.
- Target SSH remote: `ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git`.
- Workflow path: `.gitea/workflows/deploy.yml`.
- Workflow trigger: push to `main`.
- Use user-level Gitea secrets only: `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `PRODUCTION_ENV`.
- Do not create duplicate repo-level secrets.
- Do not commit `.env`.
- Do not print secret values to logs.
- Use existing `deploy.sh` as the deploy entrypoint.
- Keep `deploy.sh` provider-neutral: no GitHub/GitLab/Gitea CLI dependency for deployment.
- Verification must include lint, builds, remote URL, push, and Gitea workflow status.

---

## File Structure

- Modify `deploy.sh`
  - Responsibility: local/CI deployment entrypoint that builds optional artifacts, validates SSH configuration from environment variables, copies artifact directories to the VPS bind mounts, restarts containers, and cleans temporary key files.
  - Boundary: does not know or call any CI provider CLI; accepts deployment inputs from shell env only.

- Create `.gitea/workflows/deploy.yml`
  - Responsibility: Gitea Actions pipeline for checkout, dependency setup, lint/build, secret materialization, and deployment through `./deploy.sh --no-build`.
  - Boundary: CI runner orchestration only; no remote Docker registry migration and no repo-level secret creation.

- Use existing `docs/superpowers/specs/2026-07-08-gitea-migration-design.md`
  - Responsibility: approved design reference. No implementation changes needed.

- Use git remote configuration
  - Responsibility: set `origin` to the new Gitea SSH URL and push current code to branch `main`.
  - Boundary: no change to `.env`, no repo-level secret creation.

---

### Task 1: Make `deploy.sh` provider-neutral

**Files:**
- Modify: `deploy.sh:6-99`

**Interfaces:**
- Consumes: environment variables `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, optional `ADMIN_PASSWORD`.
- Produces: a provider-neutral executable deployment script with these behaviors:
  - `./deploy.sh --help` prints usage without requiring secrets.
  - `./deploy.sh --no-build` validates `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY`.
  - `VPS_SSH_KEY` may be either an existing key-file path or raw private-key contents.
  - raw private-key contents are written to a temp file, used as SSH identity, and deleted on exit.

- [ ] **Step 1: Inspect current deploy script around the provider-specific section**

Run:

```bash
sed -n '1,115p' deploy.sh
```

Expected: The output includes comments that mention GitLab CLI and a `fetch_ci_var()` helper using `glab api`.

- [ ] **Step 2: Replace the header comments, validation, and SSH key handling**

Edit `deploy.sh` so lines 6-99 are equivalent to this complete block. Preserve the existing config variables and service-flag parsing that are already present in the script.

```bash
#!/bin/bash
# ─── Bete Deploy Script ──────────────────────────────────────────────────────
# Builds selected services locally and deploys compiled JS/WASM artifacts to the
# VPS via bind-mounted host directories. Changes survive container restarts
# because the Docker containers use bind mounts, not docker exec tar-pipes.
#
# This script is CI-provider neutral. GitHub/GitLab/Gitea workflows and local
# shells must provide deployment credentials through environment variables.
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
# Required env:
#   VPS_HOST              — VPS IP/hostname
#   VPS_USER              — SSH user
#   VPS_SSH_KEY           — path to SSH private key or raw private-key contents
#
# Optional env:
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

# ── Validate and prepare SSH key ─────────────────────────────────────────────
: "${VPS_HOST:?VPS_HOST not set}"
: "${VPS_USER:?VPS_USER not set}"
: "${VPS_SSH_KEY:?VPS_SSH_KEY not set}"

TEMP_SSH_KEY=""
cleanup() {
  if [ -n "$TEMP_SSH_KEY" ]; then
    rm -f "$TEMP_SSH_KEY"
  fi
}
trap cleanup EXIT

if [ -f "$VPS_SSH_KEY" ]; then
  SSH_KEY_PATH="$VPS_SSH_KEY"
else
  TEMP_SSH_KEY=$(mktemp)
  printf '%s\n' "$VPS_SSH_KEY" > "$TEMP_SSH_KEY"
  chmod 600 "$TEMP_SSH_KEY"
  SSH_KEY_PATH="$TEMP_SSH_KEY"
fi

SSH_DEST="${VPS_USER}@${VPS_HOST}"
SSH_OPTS="-i $SSH_KEY_PATH -o StrictHostKeyChecking=accept-new"
```

Important preservation notes:

- Keep the existing helper functions after this block:

```bash
vps()  { ssh $SSH_OPTS "$SSH_DEST" "$@"; }
log()  { echo "→ $*"; }
ok()   { echo "✓ $*"; }
die()  { echo "✗ $*"; exit 1; }
```

- Keep the existing build and artifact deployment logic below the helper functions.
- Remove the old `fetch_ci_var()` function and all `glab` fallback calls.
- Remove the old cleanup block that only deleted `VPS_SSH_KEY` when it started with `/tmp/`; the new `trap cleanup EXIT` handles only keys created by this script.

- [ ] **Step 3: Remove the obsolete bottom cleanup block**

Delete this old block from the bottom of `deploy.sh` if it remains:

```bash
# ── Cleanup temp SSH key ─────────────────────────────────────────────────────
if [[ "$VPS_SSH_KEY" == /tmp/* ]]; then
  rm -f "$VPS_SSH_KEY"
fi
```

Expected: There is exactly one cleanup mechanism: the `trap cleanup EXIT` block added near validation.

- [ ] **Step 4: Verify shell syntax**

Run:

```bash
bash -n deploy.sh
```

Expected: exit code 0 and no output.

- [ ] **Step 5: Verify help works without secrets**

Run:

```bash
env -u VPS_HOST -u VPS_USER -u VPS_SSH_KEY ./deploy.sh --help
```

Expected: exit code 0. Output mentions provider-neutral env requirements and lists `--frontend`, `--backend`, `--gateway`, `--all`, `--no-build`.

- [ ] **Step 6: Verify missing env fails fast without leaking secrets**

Run:

```bash
env -u VPS_HOST -u VPS_USER -u VPS_SSH_KEY ./deploy.sh --no-build
```

Expected: non-zero exit. Output includes `VPS_HOST not set`. It must not include any private-key content.

- [ ] **Step 7: Commit deploy script change**

Run:

```bash
git add deploy.sh
git commit -m "ci: make deploy script provider neutral"
```

Expected: commit succeeds and includes only `deploy.sh`.

---

### Task 2: Add Gitea Actions deploy workflow

**Files:**
- Create: `.gitea/workflows/deploy.yml`

**Interfaces:**
- Consumes: `deploy.sh` interface from Task 1 and user-level Gitea secrets `VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`, `PRODUCTION_ENV`.
- Produces: a Gitea Actions workflow that runs on pushes to `main`, performs lint/build, writes `.env` from `PRODUCTION_ENV`, prepares a temp SSH key, and deploys via `./deploy.sh --no-build`.

- [ ] **Step 1: Create the workflow directory**

Run:

```bash
mkdir -p .gitea/workflows
```

Expected: `.gitea/workflows` exists.

- [ ] **Step 2: Write `.gitea/workflows/deploy.yml`**

Create `.gitea/workflows/deploy.yml` with exactly this content:

```yaml
name: Deploy to VPS

on:
  push:
    branches:
      - main

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4
        with:
          submodules: recursive

      - name: Install system dependencies
        run: |
          sudo apt-get update
          sudo apt-get install -y --no-install-recommends \
            build-essential \
            ca-certificates \
            curl \
            libssl-dev \
            pkg-config \
            python3

      - name: Set up Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Set up pnpm
        uses: pnpm/action-setup@v4
        with:
          version: 11.1.3
          run_install: false

      - name: Set up Rust
        uses: dtolnay/rust-toolchain@stable
        with:
          targets: wasm32-unknown-unknown

      - name: Install Trunk
        run: |
          cargo install trunk --version 0.22.0-beta.1 --locked

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Lint
        run: pnpm run lint

      - name: Build backend
        run: pnpm run build:backend

      - name: Build discord gateway
        run: pnpm run build:discord-gateway

      - name: Build frontend
        run: pnpm run build:web

      - name: Prepare production environment file
        run: |
          umask 077
          printf '%s\n' '${{ secrets.PRODUCTION_ENV }}' | tr -d '\r' > .env
          chmod 600 .env

      - name: Prepare SSH key
        run: |
          umask 077
          key_file="${RUNNER_TEMP:-/tmp}/bete-vps-key"
          printf '%s\n' '${{ secrets.VPS_SSH_KEY }}' > "$key_file"
          chmod 600 "$key_file"
          echo "VPS_SSH_KEY=$key_file" >> "$GITHUB_ENV"

      - name: Deploy
        env:
          VPS_HOST: ${{ secrets.VPS_HOST }}
          VPS_USER: ${{ secrets.VPS_USER }}
        run: ./deploy.sh --no-build
```

Notes:

- Gitea Actions exposes the same `$GITHUB_ENV` file convention for action environment exports.
- The workflow writes secret values to files but never echoes secret contents.
- The workflow intentionally calls `deploy.sh --no-build` because all builds already ran in earlier CI steps.
- No repo-level secrets are created by this file.

- [ ] **Step 3: Check workflow file is tracked and `.env` is not tracked**

Run:

```bash
git status --short
```

Expected: output includes `.gitea/workflows/deploy.yml`. Output does not include `.env`.

- [ ] **Step 4: Commit workflow**

Run:

```bash
git add .gitea/workflows/deploy.yml
git commit -m "ci: add gitea deploy workflow"
```

Expected: commit succeeds and includes only `.gitea/workflows/deploy.yml`.

---

### Task 3: Run local verification before pushing

**Files:**
- No file changes expected.

**Interfaces:**
- Consumes: committed `deploy.sh` and `.gitea/workflows/deploy.yml` from Tasks 1 and 2.
- Produces: verified local lint/build status and a clean working tree before remote migration.

- [ ] **Step 1: Verify working tree before tests**

Run:

```bash
git status --short
```

Expected: no output.

- [ ] **Step 2: Install dependencies**

Run:

```bash
pnpm install --frozen-lockfile
```

Expected: exit code 0. If pnpm reports the lockfile is up to date and dependencies are already installed, that is acceptable.

- [ ] **Step 3: Run lint**

Run:

```bash
pnpm run lint
```

Expected: exit code 0. Biome reports no errors.

- [ ] **Step 4: Build backend**

Run:

```bash
pnpm run build:backend
```

Expected: exit code 0 and `services/backend/dist` exists.

- [ ] **Step 5: Build discord gateway**

Run:

```bash
pnpm run build:discord-gateway
```

Expected: exit code 0 and `services/discord-gateway/dist` exists.

- [ ] **Step 6: Build frontend**

Run:

```bash
pnpm run build:web
```

Expected: exit code 0 and `services/frontend/frontend/dist` exists.

- [ ] **Step 7: Re-run deploy script syntax and help checks**

Run:

```bash
bash -n deploy.sh
env -u VPS_HOST -u VPS_USER -u VPS_SSH_KEY ./deploy.sh --help >/tmp/bete-deploy-help.txt
grep -E 'VPS_HOST|VPS_USER|VPS_SSH_KEY|--no-build' /tmp/bete-deploy-help.txt
```

Expected: all commands exit 0. The grep output shows the expected env names and flag names, not secret values.

- [ ] **Step 8: Verify `.env` is not tracked**

Run:

```bash
git status --short -- .env
```

Expected: no output.

- [ ] **Step 9: Commit any verification-only artifact cleanup if needed**

If build commands changed generated files that are tracked, inspect them before committing. Run:

```bash
git status --short
```

Expected: no output or only ignored build directories. Do not commit `.env` or build artifact directories unless they are already tracked and intentionally changed.

---

### Task 4: Create or verify the Gitea repository and push `main`

**Files:**
- No source file changes expected.
- Git config changes: remote `origin` points to `ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git`.

**Interfaces:**
- Consumes: local commits from Tasks 1 and 2, verified state from Task 3, authenticated `tea` CLI, SSH access to `git.imrnes.team:22222`.
- Produces: remote Gitea repository `MythEclipse/GMW`, remote `origin` set correctly, local branch `main`, and pushed `main` branch.

- [ ] **Step 1: Check whether the target repo exists**

Run:

```bash
tea api /repos/MythEclipse/GMW >/tmp/gitea-gmw-repo.json
```

Expected if repo exists: exit code 0 and JSON is written to `/tmp/gitea-gmw-repo.json`.

Expected if repo does not exist: non-zero exit or 404. Continue to Step 2.

- [ ] **Step 2: Create the repo only if Step 1 reported it missing**

Run only if the repository was missing:

```bash
tea repos create --owner MythEclipse --name GMW --private --description "Bete Discord moderation watcher"
```

Expected: exit code 0 and repository `MythEclipse/GMW` exists. This step does not create action secrets.

If `tea repos create` fails because the repository already exists, treat it as already-created and continue.

- [ ] **Step 3: Set `origin` to the Gitea SSH URL**

Run:

```bash
if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git
else
  git remote add origin ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git
fi
```

Expected: exit code 0.

- [ ] **Step 4: Preserve old GitLab remote as `gitlab` if only the old `GMW` remote exists**

Run:

```bash
if git remote get-url GMW >/dev/null 2>&1 && ! git remote get-url gitlab >/dev/null 2>&1; then
  git remote rename GMW gitlab
fi
```

Expected: exit code 0. This keeps the old GitLab URL available for reference while making `origin` the Gitea remote.

- [ ] **Step 5: Verify remotes**

Run:

```bash
git remote -v
```

Expected: output includes exactly this URL for both `origin` fetch and push:

```text
origin	ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git (fetch)
origin	ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git (push)
```

It is acceptable if an additional `gitlab` remote points to the old GitLab URL.

- [ ] **Step 6: Create or switch to local `main` at current HEAD**

Run:

```bash
current_head=$(git rev-parse HEAD)
if git show-ref --verify --quiet refs/heads/main; then
  git switch main
  git reset --hard "$current_head"
else
  git switch -c main
fi
```

Expected: local branch is `main` and points to the same commit that was previously checked out.

- [ ] **Step 7: Push `main` to Gitea**

Run:

```bash
git push -u origin main
```

Expected: push succeeds. Remote branch `main` exists on `MythEclipse/GMW`.

- [ ] **Step 8: Confirm the current branch and remote tracking**

Run:

```bash
git branch --show-current
git status --short --branch
```

Expected: current branch is `main`, and branch status shows it tracks `origin/main` with no uncommitted changes.

---

### Task 5: Verify Gitea Actions activation and report results

**Files:**
- No source file changes expected.

**Interfaces:**
- Consumes: pushed `main` branch and Gitea workflow from Task 4.
- Produces: evidence that Gitea registered workflow runs, plus a final report with any failures accurately described.

- [ ] **Step 1: Try the native `tea actions runs list` command**

Run:

```bash
tea actions runs list --repo MythEclipse/GMW --branch main --limit 5 --output json >/tmp/gitea-gmw-runs.json
```

Expected if supported: exit code 0 and `/tmp/gitea-gmw-runs.json` contains recent workflow runs.

- [ ] **Step 2: If Step 1 fails, use the API fallback required by the user**

Run only if Step 1 fails:

```bash
tea api /repos/MythEclipse/GMW/actions/runs >/tmp/gitea-gmw-runs.json
```

Expected: exit code 0 and `/tmp/gitea-gmw-runs.json` contains workflow run data.

- [ ] **Step 3: Inspect run summary without printing secrets**

Run:

```bash
python3 - <<'PY'
import json
from pathlib import Path
path = Path('/tmp/gitea-gmw-runs.json')
data = json.loads(path.read_text())
runs = data.get('workflow_runs', data if isinstance(data, list) else [])
for run in runs[:5]:
    print({
        'id': run.get('id'),
        'name': run.get('name') or run.get('display_title'),
        'event': run.get('event'),
        'branch': run.get('head_branch') or run.get('branch'),
        'status': run.get('status'),
        'conclusion': run.get('conclusion'),
        'created_at': run.get('created_at'),
    })
PY
```

Expected: a concise summary of workflow runs with IDs, status, and conclusion. No secret values are printed.

- [ ] **Step 4: If the workflow is queued or running, wait briefly and re-check**

Run:

```bash
sleep 20
tea actions runs list --repo MythEclipse/GMW --branch main --limit 5 --output json >/tmp/gitea-gmw-runs.json || tea api /repos/MythEclipse/GMW/actions/runs >/tmp/gitea-gmw-runs.json
python3 - <<'PY'
import json
from pathlib import Path
data = json.loads(Path('/tmp/gitea-gmw-runs.json').read_text())
runs = data.get('workflow_runs', data if isinstance(data, list) else [])
for run in runs[:5]:
    print({
        'id': run.get('id'),
        'status': run.get('status'),
        'conclusion': run.get('conclusion'),
        'branch': run.get('head_branch') or run.get('branch'),
    })
PY
```

Expected: status is visible. It may still be queued/running if the runner is busy.

- [ ] **Step 5: Final status report**

Report these exact items to the user:

```text
- Repo target: MythEclipse/GMW
- Origin remote: <output of git remote get-url origin>
- Current branch: <output of git branch --show-current>
- Local lint: pass/fail with command used
- Backend build: pass/fail with command used
- Discord gateway build: pass/fail with command used
- Frontend build: pass/fail with command used
- Push to Gitea: pass/fail
- Gitea workflow: active status or exact failure/queued/running state
- Secrets: used user-level secret names only; no repo-level secrets created
```

Do not claim deployment succeeded unless the workflow run has a successful conclusion or deployment was otherwise verified from the run status.

---

## Self-Review

- Spec coverage: Task 1 covers provider-neutral `deploy.sh`; Task 2 covers `.gitea/workflows/deploy.yml`, main trigger, lint/build, user-level secrets, and `.env` generation; Task 3 covers local lint/build/syntax verification; Task 4 covers repo creation, origin remote, `main`, and push; Task 5 covers Gitea workflow activation and fallback to `tea api /repos/MythEclipse/GMW/actions/runs`.
- Placeholder scan: No `TBD`, `TODO`, "implement later", or incomplete validation steps remain.
- Interface consistency: `deploy.sh` consumes `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY`; the workflow writes `VPS_SSH_KEY` to `$GITHUB_ENV` and passes `VPS_HOST`/`VPS_USER` as env to the deploy step. The workflow writes `.env` from `PRODUCTION_ENV` but does not pass that secret to `deploy.sh`, matching the approved design.
