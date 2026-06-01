FROM nixos/nix:latest

SHELL ["/bin/sh", "-c"]

ENV NIX_CONFIG="experimental-features = nix-command flakes"

# Pin nixpkgs to a specific commit for reproducible, conflict-free builds.
# The nixos-unstable channel changes rapidly and causes file conflicts
# between packages (e.g., cacert 3.123 vs 3.117, git vs git-minimal).
# Pinning ensures all packages are resolved from the same nixpkgs snapshot.
ARG NIXPKGS_COMMIT=7388966642e6a20b93860e5397e996af05c0e05c

RUN nix profile install \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#nodejs_22" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#ffmpeg" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#python3" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#cacert" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#gnumake" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#gcc" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#pkg-config" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#vips" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#yt-dlp"

RUN corepack enable

WORKDIR /app

# Install deps from the app-local build context.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml* ./
COPY vendor/discord-video-stream/package.json ./vendor/discord-video-stream/
COPY vendor/discord.js-selfbot-v13/package.json ./vendor/discord.js-selfbot-v13/
RUN pnpm install --no-frozen-lockfile

COPY . .

RUN pnpm run prepare:vendor
RUN pnpm run build

ENV NODE_ENV=production

CMD ["pnpm", "run", "start"]
