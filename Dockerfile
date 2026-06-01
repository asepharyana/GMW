FROM node:22-bookworm-slim

# Runtime deps: ffmpeg for video muxing, yt-dlp for download, build tools for node-canvas
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
    git \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# yt-dlp
RUN curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp \
    -o /usr/local/bin/yt-dlp && chmod a+rx /usr/local/bin/yt-dlp

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