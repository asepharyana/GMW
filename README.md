# Discord Moderation Watcher Bot

Bot monitoring Discord yang merekam voice channel, menangkap pesan teks, menyimpan attachment, menjalankan analisis opsional, dan menyediakan dashboard web real-time.

Stack utama: Node.js, pnpm, TypeScript, `discord.js-selfbot-v13`, `@discordjs/voice`, Express, WebSocket, Drizzle ORM, SQLite/PostgreSQL, React, Vite, Vitest, dan Biome.

## Prasyarat

- Node.js versi modern yang kompatibel dengan TypeScript dan Vite.
- pnpm 10.x. Repo ini dipin ke `pnpm@10.25.0`.
- FFmpeg tersedia di `PATH` untuk proses muxing audio dan playback media.
- `yt-dlp` tersedia di `PATH` untuk resolve audio YouTube, search result YouTube, dan Spotify track.
- Native audio dependencies dapat dibuild di mesin lokal (`@discordjs/opus`, `better-sqlite3`, `sodium-native`).

Install FFmpeg:

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Arch
sudo pacman -S ffmpeg
```

Install `yt-dlp`:

```bash
pnpm run install:yt-dlp
```

Script installer akan memakai package manager yang tersedia (`pacman`, `apt-get`, `dnf`, `brew`) atau fallback ke `pipx`/`pip`.

## Setup

```bash
pnpm install
cp .env.example .env
```

Edit `.env` sesuai server yang dimonitor:

```env
DISCORD_TOKEN=your_token_here
MONITOR_GUILD_ID=your_guild_id_here
RECORDINGS_DIR=./recordings
WEBSERVER_PORT=3000
DATABASE_TYPE=sqlite
```

Catatan: project ini memakai selfbot library, bukan bot token Discord standar. Pastikan penggunaan sesuai risiko dan aturan platform yang berlaku.

## Menjalankan

```bash
# Bot/server utama dengan auto-restart
pnpm run dev

# Production-style start
pnpm run start

# Dashboard frontend dev server
pnpm run dev:web
```

Dashboard build production disajikan dari `public/app` setelah menjalankan:

```bash
pnpm run build:web
```

## Command Development

```bash
# Type checking
pnpm run typecheck

# Lint
pnpm run lint

# Format
pnpm run format

# Test
pnpm run test

# Build frontend + TypeScript
pnpm run build

# Install external yt-dlp CLI for YouTube/search/Spotify track playback
pnpm run install:yt-dlp
```

## Database

Default database adalah SQLite di `.muxer-queue.db`. PostgreSQL dapat dipakai dengan `DATABASE_TYPE=postgres` dan konfigurasi `DATABASE_URL` atau variabel `POSTGRES_*`.

Jika aplikasi dijalankan di PostgreSQL production, migrasi dapat dijalankan otomatis saat startup dengan `AUTO_MIGRATE_ON_STARTUP=true`. Jalur ini memakai advisory lock supaya hanya satu instance yang memigrasi schema pada satu waktu.

```bash
# Generate migration Drizzle
pnpm run db:generate

# Jalankan migration via drizzle-kit
pnpm run db:migrate

# Jalankan migration programmatic
pnpm run db:migrate:programmatic

# Buka Drizzle Studio
pnpm run db:studio
```

## Fitur

- Voice recording ke segment `.ogg` per user.
- Metadata JSON per segment audio.
- Text message capture untuk pesan baru, edit, dan delete.
- Attachment capture dan upload ke endpoint Picser.
- SQLite/PostgreSQL via Drizzle ORM.
- REST API dan WebSocket untuk dashboard.
- Dashboard React untuk pesan, gambar, voice, media playback, dan moderation review.
- Media playback dari direct URL, file lokal, YouTube URL, search terms, dan Spotify track URL.
- Metrics Prometheus di endpoint server.
- Retry dengan backoff untuk operasi eksternal.
- AI moderation analysis opsional via konfigurasi `AI_*`.

## Struktur Rekaman

```text
recordings/
  <user-id>/
    <user-id>-<session-start>-0.ogg
    <user-id>-<session-start>-0.json
    <user-id>-<session-start>-1.ogg
    <user-id>-<session-start>-1.json
```

Segment duration dikontrol oleh `RECORDING_SEGMENT_MS`.

## Struktur Proyek

```text
src/
  index.ts                    Entry point Discord client dan server
  recorder.ts                 Voice recording pipeline
  recorder/                   Audio stream, decoder, segment metadata
  moderation/                 Message capture, storage, uploads, AI review
  database/                   Drizzle setup, schema, migrations
  routes/                     Express route modules
  webserver.ts                Express + WebSocket server
  retry.ts                    Retry helper berbasis p-retry
  audio/ffmpegProcess.ts      Direct ffmpeg process wrapper
frontend/                     React dashboard source
public/app/                   Dashboard build output
tests/                        Vitest tests
drizzle/migrations/           Database migrations
```

## Konfigurasi Penting

Lihat `.env.example` untuk daftar lengkap. Variabel utama:

- `DISCORD_TOKEN` — token akun/client yang dipakai selfbot.
- `MONITOR_GUILD_ID` — guild yang dimonitor untuk moderation capture.
- `RECORDINGS_DIR` — direktori output audio.
- `WEBSERVER_PORT` — port HTTP/WebSocket.
- `DATABASE_TYPE` — `sqlite` atau `postgres`.
- `PICSER_UPLOAD_URL` — endpoint upload attachment.
- `AI_ANALYSIS_ENABLED` — aktifkan/nonaktifkan analisis AI.
- `AI_LLM_API_KEY`, `AI_LLM_BASE_URL`, `AI_LLM_MODEL` — konfigurasi provider LLM.

## Deploy ke VPS

Project menggunakan `deploy.sh` untuk build + deploy manual ke VPS. Script ini
membangun backend (TypeScript) dan frontend (WASM Leptos) lalu menyalinnya ke
dalam container Docker yang sudah berjalan di VPS.

```bash
# Build + deploy semua service
./deploy.sh

# Deploy frontend saja (setelah perubahan UI)
./deploy.sh --frontend

# Deploy backend saja
./deploy.sh --backend

# Deploy tanpa rebuild (file sudah terbuild sebelumnya)
./deploy.sh --no-build
```

Credentials diambil otomatis dari GitLab CI variables via `glab`. Atau set manual:

```bash
export VPS_HOST="your-vps-ip"
export VPS_USER="root"
export VPS_SSH_KEY="~/.ssh/id_ed25519"
./deploy.sh
```

## Verifikasi Setelah Perubahan

Sebelum menjalankan lama atau deploy, jalankan:

```bash
pnpm install
pnpm run typecheck
pnpm run lint
pnpm run test
pnpm run build
```

## Catatan Library Modernization

Project memakai Zod untuk validasi runtime, Drizzle untuk database, dan wrapper `node:child_process` langsung untuk FFmpeg. Library lama `class-transformer`, `class-validator`, dan `fluent-ffmpeg` sudah tidak dipakai.
