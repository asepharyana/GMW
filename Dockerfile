FROM nixos/nix:latest

SHELL ["/bin/sh", "-c"]

ENV NIX_CONFIG="experimental-features = nix-command flakes"

# Install the runtime and build dependencies through Nix instead of apt.
# Note: git is pulled transitively by yt-dlp as git-minimal; adding git
# explicitly causes a file conflict (packinfo.pl) so we omit it here.
RUN nix profile install \
    github:NixOS/nixpkgs/nixos-unstable#nodejs_22 \
    github:NixOS/nixpkgs/nixos-unstable#ffmpeg \
    github:NixOS/nixpkgs/nixos-unstable#python3 \
    github:NixOS/nixpkgs/nixos-unstable#cacert \
    github:NixOS/nixpkgs/nixos-unstable#gnumake \
    github:NixOS/nixpkgs/nixos-unstable#gcc \
    github:NixOS/nixpkgs/nixos-unstable#pkg-config \
    github:NixOS/nixpkgs/nixos-unstable#vips \
    github:NixOS/nixpkgs/nixos-unstable#yt-dlp

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