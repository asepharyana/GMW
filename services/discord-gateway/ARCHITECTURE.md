services/discord-gateway/
├── src/
│   ├── app/
│   │   ├── bootstrap.ts          # Discord Gateway initialization (no HTTP server)
│   │   └── shutdown.ts           # Graceful shutdown handler
│   ├── shared/
│   │   ├── config/
│   │   │   └── config.ts         # Environment configuration (Zod validated)
│   │   ├── database/
│   │   │   ├── schema.ts         # Drizzle ORM schema
│   │   │   ├── drizzle.ts        # Database connection
│   │   │   ├── migrate.ts        # Migration runner
│   │   │   └── voiceRecordingRepo.ts
│   │   ├── errors/
│   │   │   └── errors.ts         # Custom error classes
│   │   ├── logger/
│   │   │   ├── logger.ts         # Winston logger wrapper
│   │   │   └── serialization.ts  # Log value serialization
│   │   ├── utils/
│   │   │   └── retry.ts          # Retry with backoff utility
│   │   └── discord/
│   │       └── clientOptions.ts  # Discord.js client configuration
│   ├── modules/
│   │   ├── message-capture/      # Modular MVC: Message capture & storage
│   │   │   ├── messageCapture.ts # Controller: Discord event listeners
│   │   │   ├── messageStore.ts   # Repository: Database operations
│   │   │   ├── messageMetadata.ts # Service: Message metadata extraction
│   │   │   ├── types.ts          # Domain types
│   │   │   └── index.ts          # Module exports
│   │   ├── ai-moderation/        # Modular MVC: AI analysis & moderation
│   │   │   ├── aiAnalyzer.ts     # Controller: Analysis orchestration
│   │   │   ├── llmModerationClient.ts # Service: LLM API client
│   │   │   ├── aiAnalysisWorker.ts # Service: Worker pool management
│   │   │   ├── indonesianTextNormalizer.ts # Service: Text normalization
│   │   │   ├── moderationPrompt.ts # Service: Prompt generation
│   │   │   └── index.ts          # Module exports
│   │   ├── voice-recording/      # Modular MVC: Voice recording & streaming
│   │   │   ├── voiceController.ts # Controller: Voice connection management
│   │   │   ├── recorder.ts       # Service: Recording orchestration
│   │   │   ├── recorder/
│   │   │   │   ├── audioStream.ts # Service: Audio stream subscription
│   │   │   │   ├── decoder.ts    # Service: Opus decoding
│   │   │   │   ├── segment.ts    # Service: OGG segment rotation
│   │   │   │   ├── metadata.ts   # Service: Segment metadata
│   │   │   │   ├── sessionRecording.ts # Service: Session management
│   │   │   │   └── uploader.ts   # Service: Segment upload
│   │   │   └── index.ts          # Module exports
│   │   ├── attachment-upload/    # Modular MVC: Attachment handling
│   │   │   ├── attachmentUploader.ts # Service: Upload orchestration
│   │   │   ├── imageResizer.ts   # Service: Image resizing
│   │   │   └── index.ts          # Module exports
│   │   └── event-broadcaster/    # Event-driven: Redis pub/sub
│   │       ├── eventBroadcaster.ts # Service: Event publishing
│   │       ├── eventTypes.ts     # Domain: Event type definitions
│   │       └── index.ts          # Module exports
│   ├── mock-crc.ts               # CRC polyfill for discord.js
│   └── index.ts                  # Service entry point
├── package.json                  # Service dependencies
└── tsconfig.json                 # TypeScript configuration

## Architecture Patterns

### Modular MVC Structure
Each module follows Controller-Service-Repository pattern:
- **Controller**: Discord event listeners (messageCapture, aiAnalyzer, voiceController)
- **Service**: Business logic (messageStore, llmModerationClient, recorder)
- **Repository**: Data access (messageStore, voiceRecordingRepo)

### Event-Driven Design
- **Redis Pub/Sub**: All events published to Redis channels
- **Event Channels**:
  - `discord:message:created` — New message captured
  - `discord:message:updated` — Message edited
  - `discord:message:deleted` — Message deleted
  - `discord:message:analyzed` — AI analysis complete
  - `discord:attachment:created` — Attachment detected
  - `discord:attachment:uploaded` — Attachment uploaded to storage
  - `discord:voice:started` — Voice recording started
  - `discord:voice:stopped` — Voice recording stopped
  - `discord:voice:uploaded` — Voice segment uploaded
  - `discord:analysis:queue_status` — Analysis queue status update

### Shared Infrastructure
- **Config**: Zod-validated environment variables
- **Logger**: Winston logger with context support
- **Database**: Drizzle ORM with PostgreSQL
- **Errors**: Custom error classes with codes and status codes
- **Utils**: Retry logic with exponential backoff

### No HTTP Server
- Discord Gateway service is **event-driven only**
- No Express, WebSocket, or HTTP routes
- All communication via Redis pub/sub
- Backend service consumes events and serves HTTP API

## Initialization Flow

1. Load environment config (Zod validation)
2. Initialize database connection
3. Run pending migrations
4. Create Discord client with optimized cache settings
5. Initialize Redis event broadcaster
6. Register Discord event listeners (messageCapture, aiAnalyzer)
7. Login to Discord
8. Listen for graceful shutdown signals (SIGINT, SIGTERM)

## Graceful Shutdown

On shutdown signal:
1. Close database connection
2. Disconnect from voice channels
3. Close Redis connection
4. Destroy Discord client
5. Exit process

## Dependencies

**Core Discord**:
- discord.js-selfbot-v13
- @discordjs/voice
- @discordjs/opus

**Audio Processing**:
- prism-media (Opus encoding/decoding)
- opusscript (Opus fallback)
- sharp (Image resizing)

**Data & Config**:
- drizzle-orm (ORM)
- pg (PostgreSQL driver)
- zod (Config validation)
- ioredis (Redis client)

**Logging & Utilities**:
- winston (Structured logging)
- p-retry (Retry logic)
- p-limit (Concurrency limiting)
- piscina (Worker pool)

## Event Flow Example

### Message Capture Flow
1. Discord emits `messageCreate` event
2. `messageCapture.ts` listener receives event
3. Extract metadata (user, channel, content, timestamp)
4. `messageStore.ts` inserts into database
5. `eventBroadcaster.messageCreated()` publishes to Redis
6. Backend service subscribes to `discord:message:created` channel
7. Backend processes and stores in its own database

### Voice Recording Flow
1. `voiceController.connect()` joins voice channel
2. `recorder.ts` subscribes to user audio streams
3. For each speaking user:
   - Create audio stream subscription
   - Decode Opus packets to PCM
   - Rotate OGG segments (5s default)
   - Collect user metadata
4. On silence (3s):
   - Finalize segment
   - Create metadata JSON
   - Upload segment to storage
   - Publish `discord:voice:uploaded` event
5. Backend service receives event and indexes recording

## No Breaking Changes

- Original `src/` remains untouched for now
- Discord Gateway is a **new service** in `services/discord-gateway/`
- Can run alongside existing monolith during transition
- Backend service will consume Redis events
- Frontend continues to use Backend HTTP API
