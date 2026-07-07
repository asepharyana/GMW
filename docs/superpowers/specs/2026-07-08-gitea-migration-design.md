# Gitea Migration and CI/CD Design

## Goal

Migrate this project to the self-hosted Gitea instance at `https://git.imrnes.team` under `MythEclipse/GMW`, then add a Gitea Actions deployment workflow that behaves like the existing CI/CD setup while using Gitea user-level secrets.

## Repository Target

- Owner: `MythEclipse`
- Repository: `GMW`
- SSH remote: `ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git`
- Deployment branch: `main`

The local repository currently uses `master`, so the migration will publish the current HEAD as `main` for Gitea Actions.

## Existing Project Constraints

- Package manager: `pnpm@11.1.3`
- Root lint command: `pnpm run lint`
- Build commands:
  - `pnpm run build:backend`
  - `pnpm run build:discord-gateway`
  - `pnpm run build:web`
- Frontend build uses Trunk/Rust from `services/frontend/frontend`.
- Deployment script already exists at `./deploy.sh` and performs bind-mounted hot deployment to `/opt/imphenbot` on the VPS.
- `.env` must not be committed.

## Chosen Approach

Use `deploy.sh` as the provider-neutral deploy entrypoint.

The Gitea workflow will perform CI locally in the runner, write required runtime files from user-level secrets, then call `./deploy.sh --no-build` so the deploy script only transfers already-built artifacts and restarts containers.

Rejected alternatives:

1. Building and pushing Docker images to Gitea packages. This is more invasive, requires registry/auth changes, and is unnecessary because the existing deploy script already supports bind-mounted artifact deployment.
2. CI-only without deployment. This is safer but does not satisfy the requested CI/CD migration.

## Workflow Design

Create `.gitea/workflows/deploy.yml` with:

- Trigger: push to `main`.
- Checkout with submodules.
- Setup Node and pnpm.
- Install dependencies with `pnpm install --frozen-lockfile`.
- Run `pnpm run lint`.
- Build backend, discord-gateway, and frontend.
- Write `${{ secrets.PRODUCTION_ENV }}` to `.env` with mode `600`.
- Write `${{ secrets.VPS_SSH_KEY }}` to a temporary private-key file with mode `600`.
- Export:
  - `VPS_HOST=${{ secrets.VPS_HOST }}`
  - `VPS_USER=${{ secrets.VPS_USER }}`
  - `VPS_SSH_KEY=<temp key path>`
- Run `./deploy.sh --no-build`.

The workflow must not create repo-level secrets and must not print secret contents.

## `deploy.sh` Design

Update `deploy.sh` to remove GitLab-specific fallback behavior.

The script will:

- Read deployment inputs from environment variables.
- Require `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY`.
- Accept `VPS_SSH_KEY` as either a path to an existing key file or raw private-key contents; if raw contents are supplied, write them to a temporary file and clean it up.
- Preserve existing local usage and service flags:
  - `--frontend`
  - `--backend`
  - `--gateway`
  - `--all`
  - `--no-build`
- Keep the current bind-mount artifact deployment flow.

## Error Handling and Safety

- Missing required secrets/env vars should fail fast before deployment starts.
- Secret values must not be echoed.
- `.env` is generated only inside the workflow workspace and remains uncommitted.
- Deployment continues to use atomic remote directory swaps for artifacts.
- The script should not depend on GitHub, GitLab, or Gitea CLIs for deployment.

## Verification Plan

After implementation:

1. Verify lint passes with `pnpm run lint`.
2. Verify builds pass:
   - `pnpm run build:backend`
   - `pnpm run build:discord-gateway`
   - `pnpm run build:web`
3. Verify `deploy.sh` help/syntax still works without requiring secrets.
4. Create `MythEclipse/GMW` in Gitea if it does not exist.
5. Set `origin` to `ssh://git@git.imrnes.team:22222/MythEclipse/GMW.git`.
6. Push `main` to Gitea.
7. Verify `git remote -v` uses the SSH Gitea URL with port `22222`.
8. Check Gitea Actions runs. If `tea actions runs list` is unsupported, use `tea api /repos/MythEclipse/GMW/actions/runs`.

## Out of Scope

- Creating duplicate repo-level secrets.
- Replacing the bind-mounted deploy model with a Docker registry deploy.
- Committing `.env` or exposing secret values in logs.
