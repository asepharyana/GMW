FROM nixos/nix:latest

SHELL ["/bin/sh", "-c"]

ENV NIX_CONFIG="experimental-features = nix-command flakes"

# Install all system dependencies in a single nix profile to avoid version conflicts.
# The NixOS base image lacks common Unix utilities (sed, coreutils, etc.) that
# native Node.js post-install scripts (node-pre-gyp, prebuild-install) require.
# We pin nixpkgs to a specific commit for reproducible builds.
ARG NIXPKGS_COMMIT=64c08a7ca051951c8eae34e3e3cb1e202fe36786

RUN nix profile install \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#gnused" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#coreutils-full" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#nodejs_22" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#ffmpeg" \
    "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#python3" \
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
