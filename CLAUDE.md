# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Bete (Discord Moderation Watcher)** — A comprehensive microservice-based Discord monitoring and moderation bot. Captures text messages, images, voice audio, and screenshares from Discord servers. Features AI-powered content moderation with auto-delete, voice recording with real-time streaming, music playback, and a React dashboard.

Built with **pnpm workspace monorepo** with 3 services and 1 shared library:

| Package | Path | Description |
|---------|------|-------------|
| `discord-moderation-backend` | `services/backend` | Express HTTP/WS server, REST API, Redis bridge |
| `@bete/discord-gateway` | `services/discord-gateway` | Discord client, voice recording, message capture, AI moderation |
| `frontend` | `services/frontend/frontend` | Leptos 0.7 CSR WASM dashboard |
| `@bete/shared` | `packages/shared` | Shared types, errors, logger, utilities |

**Database:** PostgreSQL (Drizzle ORM) — NOT SQLite.

**Inter-service communication:** Redis pub/sub.

## Architecture

### High-Level Flow

```
Discord
   |
   v
discord-gateway ---- Redis ---- backend ---- WebSocket ---- frontend
   |                 pub/sub      (broadcast)                (Leptos WASM)
   |                   |
   |                   |
   <------------------+
   (command channel)
```

1. **discord-gateway** connects to Discord via `discord.js-selfbot-v13`, captures events (messages, voice, attachments), stores in PostgreSQL, and publishes events to Redis channels (e.g., `discord:message:created`, `discord:voice:pcm`).

2. **backend** subscribes to Redis channels, broadcasts events to WebSocket clients, and serves REST API endpoints.

3. **frontend** connects via WebSocket and HTTP to the backend, provides a dashboard for live monitoring (text, voice, media) and AI moderation oversight.

4. **Command flow (reverse):** Frontend -> Backend HTTP/WS -> Redis (`backend:command`) -> discord-gateway (command handler) - for actions like connect voice, play media, moderate message.

### Data Flow

```
Message Capture:
  Discord -> messageCapture.ts -> messageStore.ts (PostgreSQL)
                |
                +> eventBroadcaster -> Redis -> backend -> WS clients

Voice Recording:
  Discord -> voiceController.ts -> recorder.ts -> OGG files on disk
                |                       |
                +> eventBroadcaster     +> decoder.ts -> PCM -> Redis -> WS clients

AI Moderation:
  messageStore -> aiAnalyzer.ts -> LLM API -> moderation result
                    |                           |
                    +> eventBroadcaster         +> update message in DB
```

## Service Breakdown

### backend (`services/backend`)

Express 5 + Helmet HTTP server with WebSocket (ws) on port 3001 (default).

**REST API endpoints:**
- `GET /api/health` — Health check with optional `?verbose=true`
- `POST /api/auth/login` — Admin authentication
- `GET /api/config` — App configuration
- `GET /api/messages` — List messages (cursor pagination)
- `GET /api/messages/:channelId` — Messages by channel
- `GET /api/messages/:channelId/attachments` — Attachments by channel
- `GET /api/messages/detail/:id` — Single message
- `POST /api/messages/reanalyze-batch` — Bulk retry AI analysis
- `POST /api/messages/:id/reanalyze` — Retry single message
- `POST /api/messages/:id/moderate` — Dispatch moderation action
- `GET /api/review` — Flagged/warned messages
- `GET /api/analysis/search` — Full-text search with `?q=`
- `POST /api/chat` — Mascot AI chat
- `GET /api/chat/history` — Chat history
- `POST /api/chat/clear` — Clear chat history
- `POST /api/voice/command` — Send voice transmit commands
- `GET /api/status` — Voice connection status
- `POST /api/connect` — Connect to voice channel
- `POST /api/disconnect` — Disconnect from voice
- `GET /api/guilds` — List guilds
- `GET /api/guilds/:guildId/channels` — Text channels
- `GET /api/guilds/:guildId/voice-channels` — Voice channels
- `GET /api/media/status` — Media player status
- `POST /api/media/queue` — Queue media (music/screen)
- `POST /api/media/skip` — Skip current track
- `POST /api/media/stop` — Stop playback
- `POST /api/media/volume` — Set volume
- `GET /api/recordings` — Voice recordings list
- `GET /api/ui-state` — Get persistent UI state
- `POST /api/ui-state` — Save UI state

**Modules (feature-based, under `src/modules/`):**
- `health/` — Database connectivity check
- `auth/` — Admin password auth
- `messages/` — Message + attachment CRUD, review, reanalyze
- `voice/` — Voice connection, guilds, channels
- `media/` — Music/screenshare player control
- `analysis/` — Full-text search across analyzed messages
- `mascot-chat/` — AI chatbot with server context
- `recordings/` — Voice recording listing
- `ui-state/` — Persistent UI state for dashboard
- `config/` — App config endpoint

**WebSocket events (outbound to frontend):**
- `message_created`, `message_updated`, `message_deleted`, `message_analyzed`
- `attachment_created`, `attachment_uploaded`
- `voice_recording_started`, `voice_recording_stopped`, `voice_recording_uploaded`
- `voice_active_user`, `voice_pcm_data`
- `analysis_queue_status`
- `user_state`, `ui_state`, `media_state`
- `heartbeat` (every 30s)

**WebSocket inbound (from frontend):**
- JSON `{ type: "voice_transmit", buffer: "<base64 PCM>" }` — forwarded to Redis
- JSON `{ type: "voice_command", command: "..." }` — forwarded to discord-gateway

### discord-gateway (`services/discord-gateway`)

The core service that connects to Discord using `discord.js-selfbot-v13`.

**Modules:**

- **`message-capture/`** — Listens to `messageCreate`, `messageUpdate`, `messageDelete` events. Stores messages in PostgreSQL. Handles edits, deletes, and backlog sync.
  - `messageCapture.ts` — Event listeners
  - `messageStore.ts` — Database operations (upsert, update, delete)
  - `messageMetadata.ts` — User/channel metadata extraction
  - `broadcaster.ts` — Internal event dispatch
  - `pagination.ts` — Backlog sync for historical messages
  - `analyticsStore.ts` — Per-channel analytics tracking

- **`voice-recording/`** — Voice channel connection, recording, and real-time PCM streaming.
  - `voiceController.ts` — Connection lifecycle (connect/disconnect per guild+channel)
  - `recorder.ts` — Manages speaking users, subscribes to audio streams
  - `recorder/audioStream.ts` — Opus packet subscription per user
  - `recorder/decoder.ts` — Opus to PCM decoding with rotation/cooldown
  - `recorder/segment.ts` — OGG file segment rotation (default 5s)
  - `recorder/metadata.ts` — User metadata JSON for each segment
  - `recorder/sessionRecording.ts` — Session-scoped recording management
  - `recorder/uploader.ts` — Upload completed segments
  - `player.ts` — Discord player (music/screenshare playback)
  - `transmitter.ts` — Browser-to-Discord audio transmission (Redis -> Opus -> Discord)
  - `muxer.ts` — Audio muxing logic
  - `packetFilter.ts` — Opus packet filtering
  - `ffmpegProcess.ts` — FFmpeg-based processing
  - `mediaTypes.ts` — Audio/video format definitions
  - `teleUpload.ts` — Upload to tele/picser

- **`attachment-upload/`** — Downloads Discord attachments, uploads to external service.
  - `attachmentUploader.ts` — Download + upload with retry
  - `imageResizer.ts` — Resize images before upload
  - `teleUpload.ts` — Upload to tele/picser API

- **`ai-moderation/`** — AI-powered content moderation pipeline.
  - `aiAnalyzer.ts` — Analysis worker (batch + individual fallback)
  - `aiAnalysisWorker.ts` — Piscina worker thread for batch processing
  - `llmClient.ts` — Generic LLM API client
  - `llmModerationClient.ts` — Moderation-specific LLM client
  - `moderationPrompt.ts` — System prompt builder with few-shot
  - `autoDeleteManager.ts` — Auto-delete flagged messages
  - `conversationContext.ts` — Conversation window builder
  - `concurrencyLimiter.ts` — Rate limiter for LLM calls
  - `channelCultureStore.ts` — Channel norms/slang context
  - `cultureLearner.ts` — Learn channel culture over time
  - `userReputationStore.ts` — User trust scores
  - `textCacheStore.ts` — Deduplicate repeated text analysis
  - `stickerCache.ts` — Upload and cache sticker images
  - `stickerPrompt.ts` — Sticker analysis prompt
  - `urlFetcher.ts` — Fetch URL content for analysis
  - `responseLogger.ts` — Log moderation responses

- **`event-broadcaster/`** — Redis pub/sub publisher for all events.
  - `eventBroadcaster.ts` — `EventBroadcaster` class with typed methods
  - `eventTypes.ts` — Channel constants and event interfaces

- **`command-handler/`** — Listens on `backend:command` Redis channel for backend requests.
  - `commandHandler.ts` — Handles voice connect/disconnect, guilds, channels, media, transmit

**Infrastructure:**
- `src/shared/config/config.ts` — Zod-validated env config (DISCORD_TOKEN, REDIS_URL, AI_LLM_*, etc.)
- `src/shared/database/schema.ts` — Full PostgreSQL schema definition
- `src/shared/database/drizzle.ts` — Drizzle + pg pool initialization
- `src/shared/database/migrate.ts` — Migration runner with advisory locking
- `src/shared/database/voiceRecordingRepo.ts` — Voice recording queries
- `src/shared/discord/clientOptions.ts` — Discord client configuration

### frontend (`services/frontend/frontend`)

Leptos 0.7 CSR WASM + TypeScript + CSS dashboard.

**Tech stack:**
- Leptos 0.7 CSR (WASM via `#[wasm_bindgen(start)]`)
- Trunk for bundling
- Plain CSS with design tokens
- Canvas 2D via `web-sys` for audio visualization
- CSS animations (GSAP/Framer Motion dihapus — unused)
- `web-sys` primitives (WebSocket, AudioContext, IntersectionObserver)
- `lucide-leptos` 3 for icons

**Feature structure (entity + feature slices):**
- `entities/` — Type exports re-exported from shared API client
  - `guild/types.ts` — Guild, Channel
  - `message/types.ts` — MessageRecord, PageResult
  - `voice/types.ts` — ActiveSpeaker, VoiceStatus
  - `media/types.ts` — MediaItem, MediaMode, MediaState
  - `ui/types.ts` — UIState, DashboardTab
- `features/`
  - `live/` — Voice connection, music player, screenshare, recordings
    - Components: ActiveSpeakers, AudioVisualizer, MusicSubPanel, NowPlaying, RecordingsSubPanel, ScreenSubPanel, VoiceConnectionCard
    - Hooks: `useVoiceControl`, `useMediaControl`
  - `messages/` — Message list with filters
    - Hooks: `useMessages`
- `shared/`
  - `api/client.ts` — All HTTP API calls + types
  - `ws/socket.ts` — WebSocket singleton with `useDashboardSocket` hook
  - `ws/events.ts` — Typed event map
  - `hooks/` — useAudioPlayback, useAudioTransmit, useUIState, useMascotChat, useMascotSummary, useFramerStagger, useGsapTransition, useLocalStorage
  - `ui/` — Reusable UI components (Badge, Button, Card, Input, Select, Skeleton, Tabs, Toast, ScrollArea)
  - `lib/utils.ts` — `cn()` and other utilities

**WebSocket protocol:**
- Binary: PCM audio data (24kHz mono s16le)
- JSON events: message_*, voice_*, attachment_*, user_state, ui_state, media_state, heartbeat

### shared (`packages/shared`)

Shared library used by both backend and discord-gateway.

**Exports:**
- `@bete/shared` — Everything below
- `@bete/shared/types` — AppConfig, MessageRecord, AttachmentRecord, VoiceSegment, etc.
- `@bete/shared/errors` — AppError, ValidationError, NotFoundError, UnauthorizedError, DatabaseError, ConfigError, DiscordError, TimeoutError, etc.
- `@bete/shared/logger` — Pino-based `createChildLogger(context)`
- `@bete/shared/utils` — Shared utilities

## Database Schema (PostgreSQL)

All tables defined in `services/discord-gateway/src/shared/database/schema.ts`.

### messages
Stores text messages with AI moderation results.
- `id` (text PK), `guild_id`, `channel_id`, `thread_id`
- `user_id`, `username`, `avatar_url`
- `content`, `edited_content`, `type` (text|edited|deleted)
- `created_at`, `edited_at`, `deleted_at`
- `ai_status` (pending|processing|clean|warn|flagged|error)
- `ai_moderation_flags`, `ai_moderation_score`, `ai_analysis`, `ai_categories`
- `ai_severity` (none|low|medium|high|critical), `ai_confidence`
- `ai_recommended_action` (none|monitor|warn|review|delete|escalate)
- `ai_analyzed_at`, `ai_error`, `metadata`
- Indexes: channel, user, created_at, thread, channel+created, thread+created, ai_status+created, guild+ai_status+created, guild+created+deleted, channel+ai_status+created, thread+ai_status+created

### attachments
Discord attachment metadata with upload tracking.
- `id` (text PK), `message_id` (FK -> messages cascade), `guild_id`, `channel_id`
- `filename`, `size`, `type` (MIME), `discord_url`, `uploaded_url`
- `upload_status` (pending|uploaded|failed), `upload_error`
- `created_at`, `uploaded_at`
- Indexes: channel, message, upload_status, channel+created, thread+created

### voice_recordings
Voice segment metadata.
- `id` (text PK), `user_id`, `username`, `avatar_url`
- `guild_id`, `channel_id`, `channel_name`
- `filename`, `size_bytes`, `download_url`
- `upload_status` (pending|uploaded|failed), `upload_error`
- `created_at`, `uploaded_at`
- Indexes: user_id, channel_id, created_at

### ui_state
Persistent dashboard UI state (key-value).
- `key` (text PK), `value` (text), `updated_at`

### ai_analysis_runs
Tracks AI analysis batch runs.
- `id` (text PK), `conversation_key`, `target_message_ids` (JSON)
- `model`, `request_tokens_estimate`, `response_raw`
- `status` (pending|processing|completed|failed), `error`
- `created_at`, `completed_at`
- Indexes: conversation_key, status, created_at

### user_reputations
User trust scores for AI context.
- `user_id` (text PK), `guild_id`, `trust_score`, `clean_message_streak`
- `total_infractions`, `last_infraction_at`, `created_at`, `updated_at`
- Indexes: guild_id, trust_score

### channel_cultures
AI-generated channel norms and slang summaries.
- `channel_id` (text PK), `guild_id`, `culture_summary`, `last_analyzed_at`
- Index: guild_id

### message_reviews
Manual review tracking for flagged messages.
- `id` (text PK), `message_id`, `guild_id`, `channel_id`
- `reviewer_id`, `status` (pending|approved|rejected|escalated)
- `notes`, `created_at`, `reviewed_at`
- Indexes: message_id, status, created_at, guild+status+created

### moderation_actions
Action audit log (delete/mute/warn/kick/ban).
- `id` (text PK), `message_id`, `user_id`, `guild_id`
- `action_type` (delete_message|mute_user|warn_user|kick_user|ban_user)
- `reason`, `executed_by`, `status` (pending|executed|failed)
- `error`, `created_at`, `executed_at`
- Indexes: message_id, user_id, status, guild+status+created

### retention_policies
Data retention rules per guild/channel.
- `id` (text PK), `guild_id`, `channel_id`
- `retention_days`, `apply_to_media`, `apply_to_voice`, `enabled`
- `created_at`, `updated_at`
- Indexes: guild_id, enabled

### text_analysis_cache
Caches normalized-text moderation results to avoid redundant LLM calls.
- `text` (text PK), `flags` (JSON array), `source` (local|primary_ai|vision_llm)
- `analyzed_at`, `expires_at`, `hit_count`
- Indexes: expires_at, source

### sticker_cache
Uploaded sticker image URLs for vision analysis.
- `name` (text PK), `image_url`, `mime_type`, `fetched_at`
- Index: fetched_at

### corrected_moderations
Manual corrections (false positives) for few-shot injection.
- `id` (text PK), `message_id`, `original_flags`, `corrected_flags`
- `correction_notes`, `content_snippet`, `created_at`
- Indexes: created_at, message_id

### muxer_jobs
Audio post-processing job queue.
- `id` (text PK), `data` (JSON), `status` (pending|processing|completed|failed)
- `attempts`, `maxAttempts`, `created_at`, `updated_at`, `error`
- Indexes: status, created_at

## Redis Communication

### discord-gateway publishes (event channels):
| Channel | Event type | When |
|---------|-----------|------|
| `discord:message:created` | `message_created` | New message |
| `discord:message:updated` | `message_updated` | Message edited |
| `discord:message:deleted` | `message_deleted` | Message deleted |
| `discord:message:analyzed` | `message_analyzed` | AI analysis complete |
| `discord:attachment:created` | `attachment_created` | New attachment |
| `discord:attachment:uploaded` | `attachment_uploaded` | Upload complete |
| `discord:voice:started` | `voice_recording_started` | Recording started |
| `discord:voice:stopped` | `voice_recording_stopped` | Recording stopped |
| `discord:voice:uploaded` | `voice_recording_uploaded` | Upload complete |
| `discord:voice:active_user` | `voice_active_user` | Speaker state change |
| `discord:voice:pcm` | `voice_pcm_data` | Live PCM audio chunk |
| `discord:analysis:queue_status` | `analysis_queue_status` | Queue stats |

### backend publishes (command channel):
| Channel | Command type | Description |
|---------|-------------|-------------|
| `backend:command` | `voice:connect` | Connect to voice |
| `backend:command` | `voice:disconnect` | Disconnect voice |
| `backend:command` | `voice:channels` | List voice channels |
| `backend:command` | `voice:transmit:start/stop` | Audio transmit |
| `backend:command` | `guilds:list` | List guilds |
| `backend:command` | `guilds:text-channels` | List text channels |
| `backend:command` | `media:queue/skip/stop/volume` | Media control |
| `backend:command` | `moderation:action` | Execute moderation action |

Envelope format: `{ id, type, payload, replyChannel }`.

Status keys: `voice:status`, `media:status` (set by discord-gateway, read by backend).

## Development Commands

```bash
# Install all dependencies
pnpm install

# Run each service in development mode (separate terminal each)
pnpm run dev:backend          # Backend on port 3001
pnpm run dev:discord-gateway  # Discord client + all features
pnpm run dev:web              # Frontend via trunk serve

# Build
pnpm run build:backend
pnpm run build:discord-gateway
pnpm run build:web            # trunk build --release

# Type checking
pnpm run typecheck            # Node services (pnpm -r)
pnpm run typecheck:web        # Leptos frontend (cargo check)

# Lint (Biome)
pnpm run lint

# Format (Biome)
pnpm run format

# Run tests across all packages
pnpm run test

# Database migrations (Drizzle)
pnpm run db:generate   # Generate new migration
pnpm run db:migrate    # Apply pending migrations
pnpm run db:studio     # Open Drizzle Studio

# Install yt-dlp for media download
pnpm run install:yt-dlp

# Deploy to VPS (build + hot-patch running containers)
./deploy.sh                    # Build + deploy all services
./deploy.sh --frontend         # Frontend WASM only
./deploy.sh --backend          # Backend TypeScript only
./deploy.sh --no-build         # Skip build, just copy files
```

## Configuration

Configuration via `.env` (see `.env.example`). Managed by Zod schemas:
- discord-gateway: `services/discord-gateway/src/shared/config/config.ts`
- backend: `services/backend/src/shared/config/index.ts`

### Core (both services)
- `DISCORD_TOKEN` — Discord user token (required)
- `MONITOR_GUILD_ID` — Target guild for text monitoring
- `NODE_ENV` — development|production|test
- `LOG_LEVEL` — Pino log level (default: info)
- `VERBOSE` — Enable debug logging (default: false)

### Database (PostgreSQL)
- `DATABASE_URL` — Connection string (overrides individual params)
- `POSTGRES_HOST`, `POSTGRES_PORT` (5432), `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `POSTGRES_POOL_MIN` (2), `POSTGRES_POOL_MAX` (10)
- `AUTO_MIGRATE_ON_STARTUP` (default: true)

### Redis
- `REDIS_URL` — Connection string (default: redis://localhost:6379)

### Voice Recording (discord-gateway)
- `RECORDINGS_DIR` — Audio file output (default: ./recordings)
- `RECORDING_SEGMENT_MS` — OGG segment duration (default: 5000)
- `DECODER_ROTATE_MS` — Opus decoder rotation (default: 5000)
- `DECODER_COOLDOWN_MS` — Decoder error cooldown (default: 30000)
- `AUDIO_STREAM_SILENCE_DURATION_MS` — Silence threshold (default: 3000)
- `VOICE_CONNECTION_TIMEOUT_MS` — Connection timeout (default: 15000)
- `RECONNECT_TIMEOUT_MS` — Reconnect timeout (default: 5000)
- `PACKET_FILTER_MIN_SIZE` — Minimum Opus packet size (default: 8)
- `OPUS_FRAME_SIZE` (960), `AUDIO_SAMPLE_RATE` (48000), `AUDIO_CHANNELS` (2)
- `VOICE_GUILD_ID`, `VOICE_CHANNEL_ID`

### Attachments
- `TELE_UPLOAD_URL` — Upload endpoint (default: https://upload.asepharyana.my.id/api/upload)
- `ATTACHMENT_UPLOAD_TIMEOUT_MS` (30000), `ATTACHMENT_MAX_SIZE_MB` (100), `ATTACHMENT_RETRY_ATTEMPTS` (3)

### AI Moderation (discord-gateway)
- `AI_ANALYSIS_ENABLED` — Enable AI analysis (default: false)
- `AI_LLM_API_KEY` — LLM API key (required if enabled)
- `AI_LLM_BASE_URL` — LLM endpoint (default: https://9router.asepharyana.my.id/v1)
- `AI_LLM_MODEL` — Text model (default: text)
- `AI_LLM_VISION_MODEL` — Vision model (optional fallback)
- `AI_LLM_MAX_CONCURRENT` (5), `AI_LLM_TEXT_BATCH_SIZE` (20)
- `AI_LLM_MEDIA_ANALYSIS_TIMEOUT_MS` (60000), `AI_LLM_IMAGE_MAX_DIMENSION` (1024)
- `AI_ANALYSIS_DEBOUNCE_MS` (500), `AI_ANALYSIS_MAX_BATCH_SIZE` (200)
- `AI_ANALYSIS_PROCESSING_TIMEOUT_MS` (120000)
- `PISCINA_MAX_THREADS` — Worker pool size (optional)

### Auto-Delete
- `AUTO_DELETE_FLAGGED_ENABLED` (true), `AUTO_DELETE_FLAGGED_DRY_RUN` (true)
- `AUTO_DELETE_FLAGGED_DELAY_MS` (0), `AUTO_DELETE_MIN_CONFIDENCE` (0.5)
- `AUTO_DELETE_ALLOWED_SEVERITIES`, `AUTO_DELETE_ALLOWED_CATEGORIES`
- `AUTO_DELETE_EXCLUDED_CHANNEL_IDS`, `AUTO_DELETE_EXCLUDED_USER_IDS`
- `AUTO_DELETE_NOTIFY_USER`, `AUTO_DELETE_LOG_CHANNEL_ID`

### OpenAI Moderation (optional separate endpoint)
- `OPENAI_MODERATION_API_KEY`, `OPENAI_MODERATION_BASE_URL`, `OPENAI_MODERATION_MODEL`

### Backend
- `WEBSERVER_PORT` (3001), `ADMIN_PASSWORD` (admin123)
- `BACKLOG_SYNC_HOURS` (24), `BACKLOG_SYNC_BATCH_SIZE` (100)

### Retention
- `RETENTION_MESSAGES_DAYS` (0=off), `RETENTION_ATTACHMENTS_DAYS`, `RETENTION_VOICE_DAYS`
- `RETENTION_CLEANUP_INTERVAL_MS` (86400000), `RETENTION_DRY_RUN` (true)

## Testing

Tests use **Vitest**. Currently minimal test coverage. Test directories should be created per service:

```
services/backend/tests/
services/discord-gateway/tests/
services/frontend/tests/
```

Run tests: `pnpm run test` (runs `vitest run` in each package).

## Code Style

- **Formatter**: Biome (2-space indent)
- **Linter**: Biome with strict rules
- **Language**: TypeScript with strict mode
- **Logging**: Use `createChildLogger(context)` from `@bete/shared/logger`
- **Errors**: Throw custom `AppError` subclasses with `code` + `statusCode`
- **Database**: Use Drizzle ORM or raw parameterized queries (never string interpolation)
- **Imports**: Use `.js` extensions in source files (ESM convention)

## Key Patterns

### Event-Driven Architecture

All inter-service communication happens through Redis pub/sub. The discord-gateway publishes events on typed channels, the backend subscribes and broadcasts to WebSocket clients. The backend publishes commands on `backend:command` with reply channels for request-response patterns.

### Message Capture Lifecycle

1. Discord event fires (`messageCreate`, `messageUpdate`, `messageDelete`)
2. Check guild matches MONITOR_GUILD_ID
3. Extract message metadata (user, channel, content, timestamp)
4. Upsert into `messages` table in PostgreSQL
5. Publish event to Redis (`discord:message:*`)
6. If attachments exist, insert into `attachments` table with `status='pending'`
7. Start async upload to tele/picser (non-blocking)
8. On success: update `uploaded_url`, `status='uploaded'`
9. On failure: store error, `status='failed'`

### AI Moderation Pipeline

1. Messages with `ai_status='pending'` are picked up by `aiAnalyzer.ts`
2. Batches messages by conversation (thread/channel proximity)
3. Builds context window (recent messages + channel culture + user reputation)
4. Calls LLM via `llmModerationClient.ts` with moderation prompt
5. Updates message with `ai_status`, `ai_moderation_flags`, `ai_severity`, `ai_confidence`, `ai_recommended_action`
6. If `AUTO_DELETE_FLAGGED_ENABLED` and confidence meets threshold, triggers auto-delete
7. Falls back to individual analysis for messages that could not be batched
8. Caches normalized text results in `text_analysis_cache` to avoid repeat calls

### Voice Recording Lifecycle

1. `VoiceController.connect(guildId, channelId)` via Redis command
2. Joins Discord voice channel, sets up audio receiver
3. On user start speaking: create per-user stream, OGG segment manager, Opus decoder
4. Opus packets -> OGG segments on disk + PCM decode for WebSocket broadcast
5. PCM data published to Redis (`discord:voice:pcm`) -> backend -> WS clients
6. On silence (3s timeout): close stream, finalize segment
7. After segment complete: upload to external storage, update database
8. `VoiceController.disconnect()` stops all recording

### WebSocket Protocol (frontend)

**Outbound (backend -> frontend):**
- Binary: PCM audio (24kHz mono s16le), prefixed with 4-byte user hash
- JSON events: all typed in `WSEventMap` — `message_*`, `voice_*`, `attachment_*`, `user_state`, `ui_state`, `media_state`

**Inbound (frontend -> backend):**
- JSON `{ type: "voice_transmit", buffer: "<base64 PCM>" }` for mic-to-Discord
- JSON `{ type: "voice_command", command: "..." }` for voice control

### Graceful Shutdown

discord-gateway handles SIGINT/SIGTERM/uncaughtException/unhandledRejection:
1. Close database pool
2. Disconnect voice controller
3. Close event broadcaster (Redis)
4. Close command handler (Redis)
5. Destroy Discord client
6. Exit process

### Admin Authentication

Backend endpoints are protected by `X-Admin-Password` header matching `ADMIN_PASSWORD` env var. The frontend stores the password in `localStorage`.

## Recording Structure

```
recordings/
  +-- <user-id>/
  |   +-- <user-id>-<session-start>-0.ogg
  |   +-- <user-id>-<session-start>-0.json
  |   +-- <user-id>-<session-start>-1.ogg
  |   +-- ...
```

Each segment is 5s (configurable via `RECORDING_SEGMENT_MS`). Metadata JSON includes user info, roles, timestamps, duration.

## Vendor Packages

### discord.js-selfbot-v13 (`vendor/discord.js-selfbot-v13`)
Fork of discord.js-selfbot-v13 (git submodule). Provides Discord API access via user account.

### discord-video-stream (`vendor/discord-video-stream`)
Go Live / video streaming support library. Includes:
- H264 encoding (NVENC, VAAPI, software)
- WebRTC wrapper for Discord voice/video connections
- Stream connection management

## Dependencies

**Shared (`@bete/shared`):**
- pino — Structured logging
- zod — Schema validation

**Backend:**
- express 5 — HTTP server
- ws — WebSocket server
- helmet — Security headers
- @discordjs/voice — Voice state querying (minimal)
- drizzle-orm + pg — PostgreSQL ORM
- ioredis — Redis client
- pino, pino-http — Logging
- prom-client — Prometheus metrics
- axios — HTTP client
- zod — Config validation

**discord-gateway:**
- discord.js-selfbot-v13 — Discord client (user account)
- @discordjs/voice — Voice connection
- @discordjs/opus — Native Opus codec
- prism-media — Audio encode/decode
- @snazzah/davey — DA-VEY (Discord Audio Video End-to-end encryption)
- ioredis — Redis client
- drizzle-orm + pg — PostgreSQL ORM
- sharp — Image processing
- openai — OpenAI API client
- piscina — Worker threads for AI analysis
- tiktoken — Token counting
- p-retry, p-limit — Async utilities
- lru-cache — In-memory caching
- libsodium-wrappers — Encryption
- node-crc — CRC checksums
- imghash — Image hashing
- ws — WebSocket (internal)
- zod — Config validation

**Frontend:**
- react 19, react-dom 19
- @tanstack/react-query — Data fetching
- three, @react-three/fiber, @react-three/drei — 3D
- gsap, framer-motion — Animations
- @radix-ui/* — Accessible UI primitives
- tailwindcss 4, @tailwindcss/postcss — Styling
- lucide-react — Icons
- clsx, tailwind-merge — Class management
- vite 8 — Bundler

## Notes

- Bot uses selfbot variant (user account) — check Discord ToS
- Opus decoding requires native `@discordjs/opus` or `opusscript` under Node.js
- OGG segments include metadata JSON for each segment (user info, timestamps, duration)
- WebSocket broadcasts PCM in real-time; browser can transmit audio back to Discord
- Graceful shutdown ensures clean disconnection and resource cleanup
- All database operations use parameterized queries to prevent SQL injection
- Attachment uploads are non-blocking (async) to avoid blocking message capture
- Message capture continues even if AI analysis or attachment upload fails

## Common Tasks

### Add a new config variable
1. Add to config schema in both `services/backend/src/shared/config/index.ts` and `services/discord-gateway/src/shared/config/config.ts` with Zod validation
2. Add to `.env.example` with description
3. Use via `config.VARIABLE_NAME`

### Add a new REST endpoint
1. Create route handler in `services/backend/src/modules/<module>/<name>.routes.ts`
2. Register in `services/backend/src/http/app.ts`
3. Use `asyncHandler` wrapper for error handling
4. Return JSON response

### Add a new WebSocket event
1. Add to `eventTypes.ts` in discord-gateway
2. Add publish method to `EventBroadcaster` in discord-gateway
3. Add subscription + broadcast mapping in `services/backend/src/ws/redis-bridge.ts`
4. Add event type to `WSEventMap` in frontend `events.ts`
5. Add handler to `WsHandlers` in frontend `socket.ts`

### Add a new database table
1. Add table definition in `services/discord-gateway/src/shared/database/schema.ts`
2. Generate migration: `pnpm run db:generate`
3. Check migration file in `drizzle/migrations/`
4. Apply: `pnpm run db:migrate`

### Add a new Redis command
1. Add handler case in `commandHandler.ts` switch statement
2. Add publish call on backend side (see `voice.service.ts` or `media.service.ts`)
3. Update frontend API client if needed

### Debug AI moderation
- Set `AI_ANALYSIS_ENABLED=true` and `VERBOSE=true`
- Check `ai_status`, `ai_error` fields in messages table
- Monitor `/api/analysis/search?q=<text>` for analysis results
- Check `ai_analysis_runs` table for batch run status
- Adjust `AI_ANALYSIS_*` tuning variables

### Debug voice recording
- Set `VERBOSE=true`
- Check `/api/status` for active connection
- Monitor segment files in `recordings/<user-id>/`
- Check `voice_recordings` table for upload status

## CodeGraph Usage (Required)

- Use CodeGraph first for repo-level questions: architecture, dependencies, references, callers/callees, impact, flow, routes, components.
- If graph is missing or stale, run scan first to refresh `.codegraph/graph.json`.
- Prefer graph-backed flow:
  1. scan-codegraph (build/refresh graph)
  2. query-codegraph (find definitions/references/callers/dependencies)
  3. analyze-codegraph (architecture, impact, risk, cycles, orphans, hotspots)
  4. export-codegraph (json/mermaid/dot/markdown/html when needed)
  5. open-codegraph-ui (interactive visualization when requested)
- Avoid broad grep/find or repeated wide file reads before graph lookup, except for exact literal search or known single-file edits.
