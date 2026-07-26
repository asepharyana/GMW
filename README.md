# Bete — Discord Moderation Dashboard

Bot monitoring Discord yang merekam voice channel, menangkap pesan teks, menyimpan attachment, menjalankan analisis AI opsional, dan menyediakan dashboard web real-time.

**Stack utama:** Node.js (Express 5), pnpm, TypeScript, React 19 (Next.js 16), Tailwind v4, shadcn/ui, Drizzle ORM, PostgreSQL, WebSocket, Redis pub/sub.

## Prasyarat

- Node.js 22+
- pnpm 11.x
- FFmpeg di `PATH` (untuk audio muxing dan playback media)
- `yt-dlp` di `PATH` (untuk resolve audio YouTube/Spotify)
- Bun (untuk frontend dev — opsional, bisa pake pnpm)
- PostgreSQL 15+

## Setup

```bash
pnpm install
cp .env.example .env
# Edit .env sesuai konfigurasi server
```

## Menjalankan

```bash
# Backend (port 3001)
pnpm run dev:backend

# Discord Gateway (capture messages, voice, dll)
pnpm run dev:discord-gateway

# Frontend (port 3000)
pnpm run dev:web
```

## Build

```bash
pnpm run build:backend
pnpm run build:discord-gateway
pnpm run build:web        # next build — static export ke out/
pnpm run build             # build semua service
```

## Deploy

```bash
./deploy.sh                # Build + deploy semua service ke VPS
./deploy.sh --frontend     # Frontend only
./deploy.sh --backend      # Backend only
./deploy.sh --no-build     # Skip build, copy files aja
```

## Service Architecture

```
Discord
   |
   v
discord-gateway ←→ Redis ←→ backend (Express 5) ←→ frontend (Next.js)
   |               pub/sub       |                        |
   |                             +— REST API (/api/*)     |
   |                             +— WebSocket (/ws)       |
   +— message capture            +— AI moderation         |
   +— voice recording             +— dashboard data        +— dashboard UI
   +— attachment upload                                    +— real-time updates
```

## Fitur

- **Message capture**: Capture pesan baru, edit, dan delete dari Discord
- **Voice recording**: Rekam voice channel ke segmen OGG per user, streaming PCM real-time ke WebSocket
- **Attachment upload**: Download + upload attachment ke external storage
- **AI moderation**: Analisis pesan opsional via LLM, auto-delete, queue management
- **Dashboard**: Messages feed, AI analysis review, voice connection, music player, recordings, user/channel stats
- **Media playback**: Playback dari URL, file lokal, YouTube, Spotify
- **WebSocket**: Real-time event streaming untuk semua aktivitas
- **Public API**: Semua endpoint REST dan WebSocket dapat diakses tanpa autentikasi

## Struktur Proyek

```
services/
├── backend/                # Express 5 REST API + WebSocket server
│   ├── src/modules/        # Feature modules (messages, voice, media, dll)
│   └── src/http/           # Express app setup, middleware
├── discord-gateway/        # Discord client, voice recording, AI analysis
│   ├── src/modules/        # message-capture, voice-recording, ai-moderation
│   └── src/shared/         # Config, database, Discord client
└── frontend/               # Next.js 16 dashboard (static export)
    ├── src/app/            # Pages (login, dashboard tabs)
    ├── src/features/       # Feature components (dashboard, live, messages)
    └── src/lib/            # API client, WebSocket, types
packages/
└── shared/                 # Shared types, errors, logger, utilities
```

## Database

PostgreSQL via Drizzle ORM. Migrasi:

```bash
pnpm run db:generate   # Generate migration
pnpm run db:migrate    # Apply migration
pnpm run db:studio     # Drizzle Studio
```

## WebSocket Events

Backend broadcast event berikut ke frontend via WebSocket:

- `message_created`, `message_updated`, `message_deleted`, `message_analyzed`
- `attachment_created`, `attachment_uploaded`
- `voice_recording_started`, `voice_recording_stopped`, `voice_recording_uploaded`
- `voice_active_user`, `voice_pcm_data`
- `media_state`
- `reaction_*`, `thread_*`, `presence_updated`, `guild_member_*`
