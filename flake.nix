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
          '';

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
            # that matter (opus, datachannel, node-av) are verified at runtime.
            for pkg in \
              node_modules/.pnpm/@discordjs+opus@*/node_modules/@discordjs/opus \
              node_modules/.pnpm/@lng2004+node-datachannel@*/node_modules/@lng2004/node-datachannel \
              node_modules/.pnpm/zeromq@*/node_modules/zeromq
            do
              if [ -d "$pkg" ]; then
                echo "--- native build: $pkg ---"
                (cd "$pkg" && npm run install 2>&1 || true)
                # node-datachannel's `prebuild -r napi` CLI is broken (TypeError:
                # expected first argument to be an array) — the install fallback
                # populates devDeps incl. cmake-js; build directly via cmake-js.
                if [ "$(basename "$pkg")" = "node-datachannel" ]; then
                  echo "--- datachannel cmake-js compile ---"
                  # Nix splits OpenSSL headers/libs across outputs — merge them
                  # (opensslDevEnv) so FindOpenSSL finds both include + libcrypto.
                  (cd "$pkg" && OPENSSL_ROOT_DIR="${opensslDevEnv}" npm run compile 2>&1 || true)
                fi
              fi
            done
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
          '';

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

        # ---- Frontend (Next.js static export) ----
        frontend = pkgs.stdenv.mkDerivation {
          pname = "gmw-frontend";
          version = "1.0.0";

          src = ./services/frontend;

          nativeBuildInputs = [ nodejs pnpm pkgs.gnumake pkgs.gcc pkgs.cacert ];

          buildPhase = pnpmInstall + ''
            echo "=== Building Next.js static export ==="
            # Build args are provided as env vars
            export NEXT_TELEMETRY_DISABLED=1
            npx next build 2>&1
          '';

          installPhase = ''
            mkdir -p $out/share/gmw-frontend
            cp -r out $out/share/gmw-frontend/out 2>/dev/null || \
            cp -r dist $out/share/gmw-frontend/dist 2>/dev/null || \
            cp -r .next $out/share/gmw-frontend/.next 2>/dev/null || true

            # Copy node_modules for standalone mode if it exists
            cp -r node_modules $out/share/gmw-frontend/ 2>/dev/null || true
          '';

          meta = {
            description = "GMW Frontend — Next.js static dashboard";
            platforms = pkgs.lib.platforms.linux;
          };
        };

        # ---- Proxy (nginx serving frontend) ----
        proxy = pkgs.stdenv.mkDerivation {
          pname = "gmw-proxy";
          version = "1.0.0";

          src = ./infra/docker;

          buildInputs = [ pkgs.nginx ];

          phases = [ "installPhase" ];

          installPhase = ''
            mkdir -p $out/bin $out/etc $out/share

            # Substitute placeholders in nginx template
            sed \
              -e "s|@NGINX_MIME@|${pkgs.nginx}/conf/mime.types|g" \
              -e "s|@FRONTEND_ROOT@|${frontend}/share/gmw-frontend/out|g" \
              ${./infra/nix/nginx.conf.template} \
              > $out/etc/nginx.conf

            cat > $out/bin/gmw-proxy << WRAPPER
#!${pkgs.runtimeShell}
exec ${pkgs.nginx}/bin/nginx -c $out/etc/nginx.conf -p /var/lib/gmw-proxy -g "error_log /var/lib/gmw-proxy/nginx-error.log; daemon off;"
WRAPPER
            chmod +x $out/bin/gmw-proxy
          '';

          meta = {
            description = "GMW Proxy — nginx serving frontend";
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
