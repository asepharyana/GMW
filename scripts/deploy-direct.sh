#!/usr/bin/env bash
set -euo pipefail

# deploy-direct.sh — build GMW from source and install systemd units
# Replaces the Nix profile-based deployment (flake.nix / nix-env / nix copy).
#
# Layout:
#   /opt/gmw/releases/<sha>/   — full checkout at a given git sha (immutable)
#   /opt/gmw/current           — symlink to the active release
#   /opt/gmw/bin/*             — thin wrappers that cd into current and exec node
#   /etc/systemd/system/gmw-*.service
#
# There is NO proxy unit any more. nginx used to sit on :4009 in front of the
# backend and the SPA; Caddy now does that routing directly (see the
# imphnen/gmw block in the infra repo's Caddyfile.prod). One less process, and
# one less way for the backend to be reached without TLS.
#
# Usage:
#   bash scripts/deploy-direct.sh [branch|sha]
#
# Env:
#   REMOTE_REPO       — git remote to fetch (default: https://github.com/MythEclipse/GMW.git)
#   DEPLOY_REF        — branch, tag, or sha to deploy (default: main)
#   Runtime data           — NEVER touched. This script does not drop, truncate
#                            or migrate the database; `scripts/reset-data.sh` is
#                            a separate, manual operation for a deliberate wipe.
#
#   KEEP_RELEASES       — how many releases to keep in TOTAL, live included
#                       (default 2 = the live one + one rollback). Step 10
#                       prunes the rest.

REMOTE_REPO="${REMOTE_REPO:-https://github.com/MythEclipse/GMW.git}"
DEPLOY_REF="${1:-${DEPLOY_REF:-main}}"
INSTALL_ROOT="/opt/gmw"
RELEASES_DIR="$INSTALL_ROOT/releases"
CURRENT_LINK="$INSTALL_ROOT/current"
BIN_DIR="$INSTALL_ROOT/bin"

# pnpm is installed under the invoking user's home. SSH non-interactive sessions
# do not source ~/.bashrc / ~/.zshrc, so it is not on PATH there. Add it
# explicitly; the location is stable (corepack's default).
export PATH="$HOME/.local/share/pnpm:$HOME/.local/bin:$PATH"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "FATAL: pnpm not found on PATH (looked in $HOME/.local/share/pnpm)" >&2
  exit 1
fi

log() { echo "[deploy] $*"; }

# Fetch $2 into the (empty or throwaway) directory $1 at exactly that commit.
# Works for a branch tip, a tag, or a raw sha; `git fetch origin <sha>` needs
# uploadpack.allowReachableSHA1InWant, which GitHub sets, and we fall back to a
# tag fetch for servers that do not.
fetch_into() {
  local dir="$1" sha="$2"
  # A previous deploy chowned this tree to gmw; the deploy user cannot remove
  # it without sudo. Idempotent when the dir does not exist yet.
  sudo rm -rf "$dir"
  mkdir -p "$dir"
  git -C "$dir" init -q
  git -C "$dir" remote add origin "$REMOTE_REPO"
  git -C "$dir" fetch -q --depth 1 origin "$sha" \
    || git -C "$dir" fetch -q --tags origin
  git -C "$dir" checkout -q "$sha"
  git -C "$dir" reset -q --hard "$sha"
}

# ---------------------------------------------------------------------------
# 1. Fetch source into a fresh release dir
# ---------------------------------------------------------------------------
# DEPLOY_REF may be a branch, a tag, OR a raw sha (CI passes ${{ github.sha }}).
# `git ls-remote <repo> <sha>` returns nothing for a sha — it only matches
# refs — so a sha is detected by trying the ref lookup first and falling back
# to a plain fetch of that object.
log "Resolving $DEPLOY_REF from $REMOTE_REPO"
SHA=$(git ls-remote "$REMOTE_REPO" "$DEPLOY_REF" 2>/dev/null | awk 'NR==1{print $1}')
if [ -z "$SHA" ]; then
  # Not a ref: assume it is a commit sha and fetch it directly. An unknown
  # 40-hex string fails at fetch time, which is the error we want to surface.
  if ! printf '%s' "$DEPLOY_REF" | grep -Eq '^[0-9a-f]{7,40}$'; then
    echo "FATAL: '$DEPLOY_REF' is neither a known ref nor a commit sha" >&2
    exit 1
  fi
  SHA="$DEPLOY_REF"
  log "Not a branch/tag — treating as commit sha"
fi
SHORT_SHA="${SHA:0:8}"
RELEASE_DIR="$RELEASES_DIR/$SHORT_SHA"

if [ -d "$RELEASE_DIR/.git" ] \
   && [ ! -e "$RELEASE_DIR/node_modules" ] \
   && [ ! -e "$RELEASE_DIR/apps/backend/dist" ]; then
  log "Release $SHORT_SHA already fetched but not yet built; reusing"
else
  log "Fetching $SHORT_SHA into $RELEASE_DIR"
  fetch_into "$RELEASE_DIR" "$SHA"
fi

cd "$RELEASE_DIR"

# A release directory is a BUILD ARTIFACT, not an archive. Once built it is no
# longer a pristine checkout, and both later steps are destructive to a second
# `pnpm install`:
#
#   * step 3 prunes devDependencies out of node_modules
#   * step 7 chowns the whole tree to gmw so the service can read it, after
#     which `pnpm install` (running as the deploy user) cannot write into it
#
# Observed on re-deploying an already-deployed sha:
#   ENOENT: failed to symlink dependencies for package: discord-moderation-backend
#   EEXIST: failed to link binaries for package: frontend
#   Failed to install 5 packages
#
# and `--frozen-lockfile` on top of that reports "no changes" over an install
# that is missing typescript and biome, so the build would fail later at tsc.
#
# `pnpm install` here takes ~1s and `tsc` ~10s, so rebuilding from a clean
# checkout is far cheaper than making a mutated tree idempotent. The reuse
# branch above therefore only fires for a dir that was fetched but never built.

# ---------------------------------------------------------------------------
# 2. Build
# ---------------------------------------------------------------------------
log "Installing dependencies (pnpm install)"
export HOME="${HOME:-/var/lib/gmw}"
mkdir -p "$HOME/.local/share/pnpm"
# Hardlinks, so every release shares ONE copy of the content in the pnpm store
# instead of paying a private ~599M copy per deploy. 28 releases at ~610M each
# was 19G of /opt; sharing the store makes a release's marginal cost ~0.
#
# The hazard is ownership, and it is real: with `import_method=hardlink` a file
# in the release and the same file in the pnpm store are ONE inode. Step 7's
# `chown -R gmw:gmw` therefore escapes the release and flips the STORE — and
# the developer's own checkout, since prod and dev share a filesystem here —
# to `gmw`, after which their next install dies with:
#   EPERM: operation not permitted, chmod '.../node_modules/.pnpm/...'
#
# The fix is not to abandon hardlinks; it is to stop the chown from crossing
# the boundary. Step 7 now chowns ONLY files with link count 1 (the ones this
# release genuinely owns) and leaves every hardlinked inode alone, so the store
# keeps its original owner. A dedicated store under /opt also means the
# release tree and the store are one filesystem owned by one user, which is
# what makes the hardlink legal in the first place.
npm_config_package_import_method=hardlink pnpm install --frozen-lockfile

log "Building backend (HTTP + capture + moderation worker)"
(cd apps/backend && pnpm run build)

log "Building frontend"
(cd apps/frontend && pnpm run build)

# ---------------------------------------------------------------------------
# 3. Prune devDependencies (keep runtime node_modules lean)
# ---------------------------------------------------------------------------
log "Pruning devDependencies"
# Under pnpm, node_modules is a SYMLINK FARM: top-level entries point into
# node_modules/.pnpm, which holds the real content. Removing a top-level
# devDependency therefore removes a symlink, not the shared store — runtime
# dependencies are symlinks of the same shape and are left alone. The broken-
# symlink sweep afterwards cleans up anything the prune left dangling.
for app_dir in apps/backend; do
  if [ -d "$app_dir/node_modules" ]; then
    find "$app_dir/node_modules" -maxdepth 2 -type d \
      \( -name 'typescript' -o -name '@biomejs' -o -name 'vitest' \
         -o -name 'drizzle-kit' -o -name 'tsx' -o -name 'esbuild' \
         -o -name '@types' \) \
      -prune -exec rm -rf {} + 2>/dev/null || true
    rm -f "$app_dir/node_modules/.bin/tsc" \
          "$app_dir/node_modules/.bin/vitest" \
          "$app_dir/node_modules/.bin/biome" \
          "$app_dir/node_modules/.bin/drizzle-kit" 2>/dev/null || true
    find "$app_dir/node_modules" -type l ! -exec test -e {} \; -delete 2>/dev/null || true
  fi
done
find node_modules -type l ! -exec test -e {} \; -delete 2>/dev/null || true

# ---------------------------------------------------------------------------
# 4. Install wrappers
# ---------------------------------------------------------------------------
log "Installing wrappers to $BIN_DIR"
sudo mkdir -p "$BIN_DIR"
sudo chown root:root "$BIN_DIR"

# backend — one process for the HTTP surface, Discord capture and the
# moderation worker. The other two wrappers ran the same app from a second
# directory; there is no second directory any more.
sudo tee "$BIN_DIR/gmw-backend" > /dev/null <<WRAPPER
#!/usr/bin/env bash
cd $CURRENT_LINK/apps/backend
exec /usr/bin/node dist/index.js
WRAPPER
sudo chmod +x "$BIN_DIR/gmw-backend"

# frontend
sudo tee "$BIN_DIR/gmw-frontend" > /dev/null <<WRAPPER
#!/usr/bin/env bash
cd $CURRENT_LINK/apps/frontend
exec /usr/bin/node serve.mjs
WRAPPER
sudo chmod +x "$BIN_DIR/gmw-frontend"

# ---------------------------------------------------------------------------
# 6. Install systemd units
# ---------------------------------------------------------------------------
log "Installing systemd units"
for unit in gmw-backend gmw-frontend; do
  sudo cp "$RELEASE_DIR/infra/systemd/$unit.service" "/etc/systemd/system/$unit.service"
done
sudo systemctl daemon-reload

# ---------------------------------------------------------------------------
# 7. Switch current symlink
# ---------------------------------------------------------------------------
log "Switching $CURRENT_LINK -> $RELEASE_DIR"
sudo ln -sfn "$RELEASE_DIR" "$CURRENT_LINK"

# Ownership, scoped so it cannot escape into the pnpm store.
#
# `chown -R` here used to be correct only because step 2 imported packages by
# COPY, which made every file in the release a private inode. Step 2 now
# hardlinks, so a plain `chown -R` would walk straight through node_modules and
# rewrite the STORE's ownership too — taking the developer's own checkouts with
# it, which is the EPERM-on-next-install failure the step-2 comment describes.
#
# So: chown only files this release exclusively owns (link count 1). Hardlinked
# inodes are shared with the store and are left exactly as pnpm created them.
# The service only ever READS node_modules, so not owning it is correct — and
# `find ... -links 1 -exec chown` also cannot follow a symlink out of the tree.
sudo find "$RELEASE_DIR" -xdev \( -type f -o -type d \) -links 1 \
  -exec chown gmw:gmw {} + 2>/dev/null || true
# Symlinks are always link-count 1 by definition, and node_modules' top-level
# entries are all symlinks into .pnpm. Owning the symlink (not its target) is
# what lets the service traverse node_modules at all.
sudo find "$RELEASE_DIR" -xdev -type l -exec chown -h gmw:gmw {} + 2>/dev/null || true
sudo chown -h gmw:gmw "$CURRENT_LINK"

# ---------------------------------------------------------------------------
# 8. Enable + restart services
# ---------------------------------------------------------------------------
log "Enabling and restarting services"
sudo systemctl enable gmw-backend gmw-frontend
sudo systemctl restart gmw-backend gmw-frontend
# Retire the nginx proxy unit. Caddy now routes straight to the two services, so
# this must not come back on the next deploy — disable --now is idempotent and
# exits non-zero on a host that never had it.
sudo systemctl disable --now gmw-proxy 2>/dev/null || true
sudo rm -f /etc/systemd/system/gmw-proxy.service
# Stop the two units the merge retired, if a previous deploy installed them.
# `disable --now` is idempotent: it exits non-zero when the unit is unknown,
# which is the normal case on a fresh host.
sudo systemctl disable --now gmw-discord-gateway gmw-discord-gateway-worker 2>/dev/null || true
sudo rm -f /etc/systemd/system/gmw-discord-gateway.service /etc/systemd/system/gmw-discord-gateway-worker.service
sudo systemctl daemon-reload

# ---------------------------------------------------------------------------
# 9. Health check
# ---------------------------------------------------------------------------
# `systemctl is-active` alone is NOT a health signal: with Restart=always a unit
# that exits 200ms after start reports `active` on the first poll, then flips to
# `activating (auto-restart)`. A single reading therefore passes a deploy whose
# backend has been crash-looping the whole time — which is exactly what happened
# on the first run of this script.
#
# So: require every unit to be active on CONSECUTIVE polls across a stability
# window, AND require the HTTP surfaces to actually answer. A port that is open
# because the process died a moment later proves nothing.
UNITS="gmw-backend gmw-frontend"
STABLE_POLLS=3

# HTTP surfaces, not just process liveness. Defined BEFORE the stability loop
# because the loop gates on them too — see the note at the loop's HTTP gate.
check_http() {
  local label="$1" url="$2" code
  # `|| code=000`, not `|| echo 000`: the old form appended to `-w`'s own
  # `000` and printed `000000`, which read like a typo rather than a refusal.
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url") || code=000
  echo "  $label ($url) -> $code"
  [ "$code" = "200" ]
}

check_surfaces() {
  # 1 = every surface answered, matching the `http_ok` convention this block
  # replaced. The shell convention is the opposite (0 = success), so the flip
  # happens exactly once, here — returning `$http_ok` raw made every probe
  # report failure with all four surfaces at 200.
  #
  # The two :4009 probes are GONE with nginx. In their place the public origin
  # is probed end-to-end, which is a STRONGER check than the old ones: it
  # exercises Caddy -> backend and Caddy -> serve.mjs exactly as a browser does,
  # so a routing mistake in the new Caddy block fails the deploy instead of
  # shipping. The certificate is already trusted here (Caddy issued it for this
  # host), so no -k is needed and a TLS failure is a real failure.
  local http_ok=1
  local origin="gmw.asepharyana.my.id"
  check_http "backend"     "http://127.0.0.1:4001/api/health"                     || http_ok=0
  check_http "frontend"    "http://127.0.0.1:4017/"                               || http_ok=0
  check_http "public/api"  "https://$origin/api/health"                           || http_ok=0
  check_http "public/spa"  "https://$origin/moderation"                           || http_ok=0
  return $((1 - http_ok))
}

end=$((SECONDS+90))
streak=0
while [ $SECONDS -lt $end ]; do
  ok=1
  for u in $UNITS; do
    state=$(sudo systemctl is-active "$u" 2>/dev/null || echo inactive)
    if [ "$state" != "active" ]; then
      ok=0
      break
    fi
  done
  # `is-active` turns true the instant systemd spawns the process, but after a
  # reset deploy the backend drops the schema and rebuilds the WHOLE thing from
  # the baseline before it binds :4001 — so the unit reads `active` for several
  # seconds while the port still refuses connections. The one-shot probe that
  # used to run after this loop sampled exactly that gap and failed the deploy
  # on a perfectly healthy backend (backend -> 000000, proxy/api -> 502), which
  # is the same defect the comment above warns about, one layer down.
  # Gating the streak on the surfaces is what makes "stable" mean "serving".
  if [ $ok -eq 1 ] && ! check_surfaces >/dev/null 2>&1; then
    ok=0
  fi
  if [ $ok -eq 1 ]; then
    streak=$((streak+1))
    if [ $streak -ge $STABLE_POLLS ]; then
      break
    fi
  else
    streak=0
  fi
  sleep 2
done

if [ $streak -lt $STABLE_POLLS ]; then
  echo "::error::Services failed to stay active and answering" >&2
  for u in $UNITS; do
    state=$(sudo systemctl is-active "$u" 2>/dev/null || echo inactive)
    echo "  $u -> $state"
  done
  log "Checking HTTP surfaces"
  check_surfaces || true
  exit 1
fi

log "Checking HTTP surfaces"
if ! check_surfaces; then
  echo "::error::One or more HTTP surfaces did not answer 200" >&2
  exit 1
fi

log "All services active and answering"

# ---------------------------------------------------------------------------
# 10. Prune old releases
# ---------------------------------------------------------------------------
# Keep the live release plus exactly ONE rollback target. Everything older is
# unreachable: the `current` symlink points at the live one, and a rollback is
# `ln -sfn releases/<prev-sha> current && systemctl restart` — which needs only
# the single previous release to still be on disk.
#
# This runs LAST, after the health check, and that ordering is load-bearing in
# both directions:
#   * after — so a deploy that fails its health check leaves every release in
#     place. Pruning first would destroy the rollback target of the release you
#     are trying to roll back TO, turning a failed deploy into an unrecoverable
#     one.
#   * after the restart — so nothing is deleted while a process is still cwd'd
#     into it. `rm -rf` of a live release leaves the running service answering
#     from deleted inodes until it next restarts, which reads as healthy.
#
# Without this, /opt/gmw/releases grew one ~610M release per deploy forever:
# 28 of them, 19G, none of which anything could roll back to.
log "Pruning old releases (keeping live + 1 rollback)"
KEEP_RELEASES="${KEEP_RELEASES:-2}"

# Resolve `current` to its basename so a release is never compared against its
# own symlink path — `readlink` gives the absolute target, and a rollback to a
# manually-restored `current` would otherwise be pruned as "not current".
LIVE_SHA="$(basename "$(readlink -f "$CURRENT_LINK")")"

# Newest first by mtime. Deploy order == mtime order here because step 1 fetches
# into a fresh dir; sorting by name would order by sha, which is meaningless.
#
# KEEP_RELEASES is the TOTAL on disk, live included. Taking the newest N first
# and only then skipping the live release yields N+1 whenever the live release
# is older than the N newest — which is exactly what a rollback leaves behind,
# so the one case where retention matters most was the one that overflowed.
mapfile -t KEEP < <(
  ls -1dt "$RELEASES_DIR"/*/ 2>/dev/null \
    | while read -r d; do printf '%s\t%s\n' "$(stat -c %Y "$d")" "$(basename "$d")"; done \
    | sort -rn \
    | cut -f2 \
    | while read -r name; do
        [ "$name" = "$LIVE_SHA" ] && continue
        printf '%s\n' "$name"
      done \
    | head -n "$((KEEP_RELEASES - 1))"
)
log "  keeping: live=$LIVE_SHA + ${KEEP[*]:-<none>}"

for d in "$RELEASES_DIR"/*/; do
  [ -d "$d" ] || continue
  name="$(basename "$d")"
  [ "$name" = "$LIVE_SHA" ] && continue
  if printf '%s\n' "${KEEP[@]:-}" | grep -qx "$name"; then
    continue
  fi
  log "  pruning $name ($(du -sh "$d" 2>/dev/null | cut -f1))"
  sudo rm -rf "$d"
done
log "  releases now: $(ls -1 "$RELEASES_DIR" 2>/dev/null | wc -l)"

log "Deployment complete: $SHORT_SHA"
