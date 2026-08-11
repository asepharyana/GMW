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

        # libdatachannel 0.24.0 — the version the GoLive N-API binding links
        # against. nixpkgs 0.24.1 was built against a newer glibc (ABI
        # GLIBC_ABI_GNU2_TLS missing on this host), so pin 0.24.0 explicitly.
        libdatachannel-src = pkgs.fetchFromGitHub {
          owner = "paullouisageneau";
          repo = "libdatachannel";
          rev = "v0.24.0";
          sha256 = "1jk53qsrihg1bsc0dmr5rajkgp3hi7d98pvpr0qnpk15b7ilb6fy";
        };

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
        pnpm = pkgs.pnpm.override { nodejs = nodejs; };

        pnpmInstall = ''
          export HOME=$TMPDIR/home
          export npm_config_cache=$TMPDIR/npm-cache
          mkdir -p $npm_config_cache

          # SSL/TLS certs (Nix sandbox doesn't have system CA bundle)
          export SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export NODE_EXTRA_CA_CERTS=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export GIT_SSL_CAINFO=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt
          export NIX_SSL_CERT_FILE=${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt

          # pnpm uses node-gyp for native addons — provide build tools
          export npm_config_build_from_source=true
          export CPPFLAGS="-I${pkgs.lib.getDev pkgs.openssl}/include"
          export LDFLAGS="-L${pkgs.lib.getLib pkgs.openssl}/lib"

          pnpm install --no-frozen-lockfile --ignore-scripts 2>&1

          # Build native addons that need compilation
          pnpm rebuild 2>&1 || true
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
        # are only reachable through it), silently breaking voice/screenshare.
        # Instead we keep the full install's symlink layout and only prune
        # orphaned package dirs + broken symlinks.
        # Must run AFTER tsc (typescript is a devDep) and after native builds.
        pruneProd = ''
          echo "=== Pruning devDependencies (production-only node_modules) ==="
          pnpm list --prod --depth 999 --parseable 2>/dev/null \
            | grep -o '\.pnpm/[^/]*' | sort -u > $TMPDIR/prod-pnms.txt
          ( cd node_modules/.pnpm \
              && for d in */; do \
                   d="''${d%/}"; \
                   [ "$d" = "node_modules" ] && continue; \
                   grep -qF ".pnpm/$d" $TMPDIR/prod-pnms.txt || rm -rf "$d"; \
                 done ) || true
          # Drop symlinks whose .pnpm target was pruned (top-level, scoped dirs,
          # hoist, .bin — any depth). Mirrors stdenv's noBrokenSymlinks check,
          # which would otherwise fail the fixupPhase.
          find node_modules -type l ! -exec test -e {} \; -delete 2>/dev/null || true
          du -sh node_modules
        '';

        # ---- Backend ----
        backend = pkgs.stdenv.mkDerivation {
          pname = "gmw-backend";
          version = "1.0.0";

          src = ./services/backend;

          nativeBuildInputs = [ nodejs pnpm pkgs.python3 pkgs.gnumake pkgs.gcc pkgs.cacert ];

          buildPhase = pnpmInstall + ''
            echo "=== Compiling TypeScript ==="
            npx tsc 2>&1
            echo "=== Fixing @/ path aliases to relative paths ==="
            node -e "
              const fs = require('fs');
              const path = require('path');
              let count = 0;
              function walk(dir) {
                if (!fs.existsSync(dir)) return;
                for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
                  const p = path.join(dir, e.name);
                  if (e.isDirectory()) walk(p);
                  else if (e.name.endsWith('.js')) {
                    const c = fs.readFileSync(p, 'utf8');
                    const pat = /from\s+['\"]@\/([^'\"]+)['\"]/g;
                    const n = c.replace(pat, (m, p1) => {
                      const target = path.join('dist', p1) + '.js';
                      const rel = path.relative(path.dirname(p), target);
                      return 'from \"' + (rel.startsWith('.') ? rel : './' + rel) + '\"';
                    });
                    if (n !== c) { fs.writeFileSync(p, n); count++; }
                  }
                }
              }
              walk('dist');
              console.log('Fixed ' + count + ' files');
            "
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

          nativeBuildInputs = [
            nodejs pnpm
            pkgs.python3 pkgs.gnumake pkgs.gcc pkgs.cmake
            pkgs.rustc pkgs.cargo
            pkgs.pkg-config
            pkgs.openssl
            pkgs.openssl.dev
            pkgs.git # libdatachannel FetchContent clones from GitHub
            pkgs.cacert
          ];

          # Runtime tools for the voice pipeline: ffmpeg (mic transmit encode,
          # music stream decode, segment muxing) and yt-dlp (YouTube/Spotify/
          # search media resolution). Must be on PATH inside the wrapper below.
          buildInputs = [ pkgs.ffmpeg-headless pkgs.yt-dlp ];

          # cmake is only needed for node-datachannel's postinstall build —
          # do NOT let stdenv run its own cmake configure phase on the source.
          dontUseCmakeConfigure = true;

          buildPhase = pnpmInstall + ''
            echo "=== Building native voice deps ==="
            # pnpm rebuild aborts on the first failing package and runs scripts
            # from the wrong cwd — build each native dep explicitly with its own
            # install script. Each failure is tolerated (|| true); the packages
            # that matter (opus) are verified at runtime.
            for pkg in \
              node_modules/.pnpm/@discordjs+opus@*/node_modules/@discordjs/opus
            do
              if [ -d "$pkg" ]; then
                echo "--- native build: $pkg ---"
                (cd "$pkg" && npm run install 2>&1 || true)
              fi
            done
            echo "=== Building libdatachannel-min N-API binding ==="
            # The GoLive screen-share stack uses a minimal N-API binding
            # (native/libdatachannel-min) over libdatachannel 0.24.0 built from
            # source. node-gyp links against the libdatachannel .so.
            (
              cd native/libdatachannel-min
              # libdatachannel 0.24.0 fetched from GitHub (see flake inputs) —
              # build with CMake, then node-gyp links against the .so.
              mkdir -p build/ldc
              cd build/ldc
              cmake -DCMAKE_BUILD_TYPE=Release \
                -DNO_EXAMPLES=ON -DNO_TESTS=ON -DNO_WEBSOCKET=ON \
                -DNO_MEDIA=OFF \
                -DCMAKE_INSTALL_PREFIX=$PWD/install \
                "${opensslDevEnv}" ${libdatachannel-src} 2>&1 || true
              make -j"$NIX_BUILD_CORES" 2>&1 || true
              cd ..
              LD_LIBRARY_PATH=$PWD/ldc node-gyp rebuild 2>&1 || true
              cp -r build/Release/datachannel_min.node . 2>/dev/null || true
              echo "libdatachannel-min binding: $(ls -la datachannel_min.node 2>/dev/null | awk '{print $5}') bytes"
            )
            echo "=== Compiling TypeScript ===="
            npx tsc 2>&1
            echo "=== Fixing @/ path aliases to relative paths ==="
            node -e "
              const fs = require('fs');
              const path = require('path');
              let count = 0;
              function walk(dir) {
                if (!fs.existsSync(dir)) return;
                for (const e of fs.readdirSync(dir, {withFileTypes: true})) {
                  const p = path.join(dir, e.name);
                  if (e.isDirectory()) walk(p);
                  else if (e.name.endsWith('.js')) {
                    const c = fs.readFileSync(p, 'utf8');
                    const pat = /from\s+['\"]@\/([^'\"]+)['\"]/g;
                    const n = c.replace(pat, (m, p1) => {
                      const target = path.join('dist', p1) + '.js';
                      const rel = path.relative(path.dirname(p), target);
                      return 'from \"' + (rel.startsWith('.') ? rel : './' + rel) + '\"';
                    });
                    if (n !== c) { fs.writeFileSync(p, n); count++; }
                  }
                }
              }
              walk('dist');
              console.log('Fixed ' + count + ' files');
            "
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

          nativeBuildInputs = [ nodejs pnpm pkgs.gnumake pkgs.gcc pkgs.cacert ];

          buildPhase = pnpmInstall + ''
            echo "=== Building Next.js SSR (standalone) ==="
            export NEXT_TELEMETRY_DISABLED=1
            export GMW_BACKEND_URL=http://127.0.0.1:4001
            npx next build 2>&1
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
            nodejs pnpm
            pkgs.python3 pkgs.gnumake pkgs.gcc
            pkgs.rustc pkgs.cargo
            pkgs.ffmpeg-headless
          ];
          shellHook = ''
            echo "GMW dev shell ready — node $(node --version), pnpm $(pnpm --version)"
          '';
        };
      });
}
