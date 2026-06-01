FROM nixos/nix:latest

SHELL ["/bin/sh", "-c"]

ENV NIX_CONFIG="experimental-features = nix-command flakes"

# Install packages one at a time to avoid file conflicts in nix profile.
# When installing multiple packages simultaneously, nix may resolve
# different versions of shared dependencies (e.g., cacert 3.123 vs 3.117)
# which causes "An existing package already provides" errors.
# Installing sequentially allows each package to settle before the next.
ARG NIXPKGS_COMMIT=64c08a7ca051951c8eae34e3e3cb1e202fe36786

RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#cacert"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#nodejs_22"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#ffmpeg"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#python3"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#gnumake"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#gcc"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#pkg-config"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#vips"
RUN nix profile add "github:NixOS/nixpkgs/${NIXPKGS_COMMIT}#yt-dlp"

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
