{
  description = "GMW — Bete Discord Moderation Bot (Nix build)";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = { self, nixpkgs, flake-utils }:
    flake-utils.lib.eachSystem [ "x86_64-linux" ] (system:
      let
        pkgs = import nixpkgs { inherit system; };

        # Source filter: `path:` literals do NOT respect .gitignore by default,
        # so a dirty local out/ (stale chunks from previous builds) leaks into
        # the sandbox. Filter out build artifacts explicitly.
        filterSource = { dir, ignore }: builtins.path {
          path = dir;
          name = "source";
          filter = (path: type: let base = baseNameOf path; in !(builtins.elem base ignore));
        };
        frontendSrc = filterSource {
          dir = ./services/frontend;
          ignore = [ "out" ".next" "node_modules" "pnpm-lock.yaml" ];
        };

        # OpenSSL headers (.dev output) + STATIC libs (pkgsStatic.openssl.out —
        # node-datachannel's CMakeLists sets OPENSSL_USE_STATIC_LIBS=TRUE, and
        # the default `pkgs.openssl` resolves to `bin` which has no lib/) merged
        # into one tree so FindOpenSSL resolves both via OPENSSL_ROOT_DIR.
        opensslDevEnv = pkgs.symlinkJoin {
          name = "openssl-dev-env";
          paths = [ pkgs.pkgsStatic.openssl.out pkgs.openssl.dev ];
        };

        # ---- Shared build tools ----
        nodejs = pkgs.nodejs_22;
        # Bun for deps/install (replaces pnpm); keeps nodejs for the tsc +
        # fix-imports.mjs build path (Bun's own bundler is not used for dist).
        bun = pkgs.bun;

        bunInstall = ''
          export HOME=$TMPDIR/home
          export npm_config_cache=$TMPDIR/npm-cache
          mkdir -p $npm_config_cache

          # SSL/TLS certs (Nix sandbox doesn't have system CA bundle)
          export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export GIT_SSL_CAINFO=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export NIX_SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt

          # Build native addons (bun install runs postinstall scripts for
          # @discordjs/opus / sharp unless trustedDependencies restricts).
          bun install 2>&1
        '';

        # Shrink the shipped node_modules to production deps only. The full
        # install's .pnpm virtual store carries dev-only packages (biome,
        # typescript, esbuild, drizzle-kit, vitest, ... ~150MB+) that are never
        # needed at runtime, so we delete every .pnpm dir that is not part of
        # the resolved production graph (`pnpm list --prod`).
        #
        # NOTE: do NOT use `pnpm install --prod` here — it collapses the
        # public-hoist dir (.pnpm/node_modules) that runtime peer resolution
        # relies on (e.g. @lng2004/node-datachannel and @seydx/node-av-linux-x64
        # are only reachable through it), silently breaking voice.
        # Instead we keep the full install's symlink layout and only prune
        # orphaned package dirs + broken symlinks.
        # Must run AFTER tsc (typescript is a devDep) and after native builds.
        pruneProd = ''
          echo "=== Pruning devDependencies (production-only node_modules) ==="
          # bun install's layout: node_modules/<pkg> for prod deps; devDeps are
          # also present during build (needed for tsc). Keep only what the prod
          # graph needs: simplest robust approach is `bun install --production`
          # semantics — but bun keeps the same flat layout; since the Nix build
          # already ran `bun install` (full, scripts on), prune dev-only top
          # entries that were only pulled by devDeps (typescript, biome, vitest,
          # drizzle-kit, tsx, @types/*).
          find node_modules -maxdepth 2 -type d \( -name 'typescript' -o -name '@biomejs' -o -name 'vitest' -o -name 'drizzle-kit' -o -name 'tsx' -o -name 'esbuild' \) -prune -exec rm -rf {} + 2>/dev/null || true
          rm -rf node_modules/.bin/tsc node_modules/.bin/vitest node_modules/.bin/biome node_modules/.bin/drizzle-kit 2>/dev/null || true
          find node_modules -type l ! -exec test -e {} \; -delete 2>/dev/null || true
          du -sh node_modules
        '';

        # ---- Backend ----
        backend = pkgs.stdenv.mkDerivation {
          pname = "gmw-backend";
          version = "1.0.0";

          src = ./services/backend;

          nativeBuildInputs = [ nodejs bun pkgs.python3 pkgs.gnumake pkgs.gcc pkgs.cacert ];

          buildPhase = bunInstall + ''
            echo "=== Compiling TypeScript ==="
            ./node_modules/.bin/tsc 2>&1
            echo "=== Fixing @/ path aliases + extensionless relative imports for node ESM ==="
            node scripts/fix-imports.mjs
            echo "=== Build complete ==="
          '' + pruneProd;

          installPhase = ''
            mkdir -p $out/lib/gmw-backend
            cp -r dist node_modules package.json tsconfig.json $out/lib/gmw-backend/

            mkdir -p $out/bin
            cat > $out/bin/gmw-backend << WRAPPER
#!${pkgs.runtimeShell}
cd $out/lib/gmw-backend
exec ${nodejs}/bin/node dist/index.js
WRAPPER
            chmod +x $out/bin/gmw-backend
          '';

          meta = {
            description = "GMW Backend — Express HTTP/WS server";
            platforms = pkgs.lib.platforms.linux;
          };
        };

        # ---- Discord Gateway ----
        discord-gateway = pkgs.stdenv.mkDerivation {
          pname = "gmw-discord-gateway";
          version = "1.0.0";

          src = ./services/discord-gateway;

          # cmake + rust/cargo were inherited for node-datachannel-style native
          # deps — that's 9router/omniroute, NOT GMW. GMW's only native deps
          # are @discordjs/opus + sharp, both PREBUILT (node-pre-gyp / @img
          # libvips download), so no cmake or rust toolchain is needed.
          # python3/gnumake/gcc stay as node-gyp fallback for @discordjs/opus.
          nativeBuildInputs = [
            nodejs pnpm
            pkgs.python3 pkgs.gnumake pkgs.gcc
            pkgs.pkg-config
            pkgs.openssl
            pkgs.openssl.dev
            pkgs.cacert
          ];

          # Runtime tools for the voice pipeline: ffmpeg (mic transmit encode,
          # music stream decode, segment muxing) and yt-dlp (YouTube/Spotify/
          # search media resolution). Must be on PATH inside the wrapper below.
          buildInputs = [ pkgs.ffmpeg-headless pkgs.yt-dlp ];

          # cmake is only needed for node-datachannel's postinstall build —
          # do NOT let stdenv run its own cmake configure phase on the source.
          dontUseCmakeConfigure = true;

          # The gateway bundles native node_modules (.node addons plus .o/.a
          # object files left in prebuilt dirs). stdenv's fixupPhase walks
          # $out/node_modules and runs patchELF + shrinkELF over every ELF it
          # finds, choking on the non-ET_DYN files (.o/.a) and the prebuilt
          # .node addons — emitting hundreds of harmless "patchelf: wrong ELF
          # type" lines per build. The real binary is node (external, already
          # RPATH-fixed in its own derivation) and the .node addons are
          # self-contained prebuilts loaded via dlopen, so Nix's fixup pass is
          # neither needed nor wanted here. Skip it entirely.
          dontFixup = true;

          buildPhase = bunInstall + ''
            echo "=== Rebuilding @discordjs/opus (prebuilt download) ==="
            bun pm rebuild @discordjs/opus 2>&1 || true
            echo "=== Compiling TypeScript ===="
            ./node_modules/.bin/tsc 2>&1
            echo "=== Fixing @/ path aliases + extensionless relative imports for node ESM ==="
            node scripts/fix-imports.mjs
            echo "=== Build complete ==="
          '' + pruneProd;

          installPhase = ''
            mkdir -p $out/lib/gmw-discord-gateway
            cp -r dist node_modules package.json tsconfig.json $out/lib/gmw-discord-gateway/

            # Also include drizzle migrations if they exist
            cp -r drizzle $out/lib/gmw-discord-gateway/ 2>/dev/null || true

            mkdir -p $out/bin
            cat > $out/bin/gmw-discord-gateway << WRAPPER
#!${pkgs.runtimeShell}
cd $out/lib/gmw-discord-gateway
export PATH=${pkgs.ffmpeg-headless}/bin:${pkgs.yt-dlp}/bin:\$PATH
exec ${nodejs}/bin/node dist/index.js
WRAPPER
            chmod +x $out/bin/gmw-discord-gateway
          '';

          meta = {
            description = "GMW Discord Gateway — message capture, voice, AI moderation";
            platforms = pkgs.lib.platforms.linux;
          };
        };

        # ---- Frontend (Next.js SSR standalone) ----
        frontend = pkgs.stdenv.mkDerivation {
          pname = "gmw-frontend";
          version = "1.0.0";

          src = frontendSrc;

          nativeBuildInputs = [ nodejs bun pkgs.gnumake pkgs.gcc pkgs.cacert ];

          buildPhase = bunInstall + ''
            echo "=== Building Next.js SSR (standalone) ==="
            export NEXT_TELEMETRY_DISABLED=1
            export GMW_BACKEND_URL=http://127.0.0.1:4001
            ./node_modules/.bin/next build 2>&1
          '';

          installPhase = ''
            echo "=== Packaging standalone server ==="
            mkdir -p $out/lib/gmw-frontend/standalone
            # The standalone server bundles its own minimal node_modules but
            # needs the build assets + public copied INSIDE its tree.
            cp -r .next/standalone/. $out/lib/gmw-frontend/standalone/
            mkdir -p $out/lib/gmw-frontend/standalone/.next
            cp -r .next/static $out/lib/gmw-frontend/standalone/.next/static
            cp -r public $out/lib/gmw-frontend/standalone/public 2>/dev/null || true

            # Remove dangling symlinks left by pnpm's hoisted .pnpm layout
            # (e.g. node_modules/.pnpm/node_modules/...). The standalone server
            # never resolves those at runtime — it bundles its own node_modules
            # — and they trip stdenv's noBrokenSymlinks check.
            find $out/lib/gmw-frontend/standalone -type l \
              ! -exec test -e {} \; -delete 2>/dev/null || true

            mkdir -p $out/bin
            cat > $out/bin/gmw-frontend << WRAPPER
#!${pkgs.runtimeShell}
cd $out/lib/gmw-frontend/standalone
export PORT=''${GMW_FRONTEND_PORT:-4017}
export HOSTNAME=127.0.0.1
exec ${nodejs}/bin/node server.js
WRAPPER
            chmod +x $out/bin/gmw-frontend
          '';

          meta = {
            description = "GMW Frontend — Next.js SSR dashboard";
            platforms = pkgs.lib.platforms.linux;
          };
        };

        # ---- Proxy (nginx: / -> Next SSR, /api + /ws -> backend) ----
        proxy = pkgs.stdenv.mkDerivation {
          pname = "gmw-proxy";
          version = "1.0.0";

          src = ./infra/docker;

          buildInputs = [ pkgs.nginx ];

          phases = [ "installPhase" ];

          installPhase = ''
            mkdir -p $out/bin $out/etc $out/share

            # Substitute placeholders in nginx template
            sed -e "s|@NGINX_MIME@|${pkgs.nginx}/conf/mime.types|g" \
                -e "s|@NEXT_PORT@|4017|g" \
                ${./infra/nix/nginx.conf.template} \
                > $out/etc/nginx.conf

            cat > $out/bin/gmw-proxy << WRAPPER
#!${pkgs.runtimeShell}
exec ${pkgs.nginx}/bin/nginx -c $out/etc/nginx.conf -p /var/lib/gmw-proxy -g "error_log /var/lib/gmw-proxy/nginx-error.log; daemon off;"
WRAPPER
            chmod +x $out/bin/gmw-proxy
          '';

          meta = {
            description = "GMW Proxy — nginx -> Next.js + backend";
            platforms = pkgs.lib.platforms.linux;
          };
        };

      in {
        packages = {
          inherit backend discord-gateway frontend proxy;
          default = proxy;
        };

        devShells.default = pkgs.mkShell {
          buildInputs = [
            nodejs bun
            pkgs.python3 pkgs.gnumake pkgs.gcc
            pkgs.rustc pkgs.cargo
            pkgs.ffmpeg-headless
          ];
          shellHook = ''
            echo "GMW dev shell ready — node $(node --version), bun $(bun --version)"
          '';
        };
      });
}
