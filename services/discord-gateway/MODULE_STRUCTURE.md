# Discord Gateway Service - Module Structure

## Complete Directory Tree

```
services/discord-gateway/
├── src/
│   ├── app/
│   │   ├── bootstrap.ts
│   │   │   └── Initializes Discord client, database, Redis broadcaster
│   │   │       Registers event listeners, handles graceful shutdown
│   │   └── shutdown.ts
│   │       └── Graceful shutdown handler for SIGINT/SIGTERM/exceptions
│   │
│   ├── shared/
│   │   ├── config/
│   │   │   └── config.ts
│   │   │       └── Zod-validated environment configuration
│   │   │           - Discord token, database URL, Redis URL
│   │   │           - AI LLM settings, recording parameters
│   │   │           - Attachment upload settings, retention policies
│   │   │
│   │   ├── database/
│   │   │   ├── schema.ts
│   │   │   │   └── Drizzle ORM schema definitions
│   │   │   ├── drizzle.ts
│   │   │   │   └── PostgreSQL connection and initialization
│   │   │   ├── migrate.ts
│   │   │   │   └── Database migration runner
│   │   │   ├── migrateCli.ts
│   │   │   │   └── CLI for programmatic migrations
│   │   │   ├── voiceRecordingRepo.ts
│   │   │   │   └── Voice recording repository
│   │   │   └── migrations/
│   │   │       └── Database migration files
│   │   │
│   │   ├── errors/
│   │   │   └── errors.ts
│   │   │       └── Custom error classes
│   │   │           - AppError (base)
│   │   │           - ConfigError
│   │   │           - AudioError
│   │   │           - VoiceConnectionError
│   │   │           - ValidationError
│   │   │
│   │   ├── logger/
│   │   │   ├── logger.ts
│   │   │   │   └── Winston logger wrapper with context support
│   │   │   └── serialization.ts
│   │   │       └── Log value serialization utilities
│   │   │
│   │   ├── utils/
│   │   │   └── retry.ts
│   │   │       └── Retry with exponential backoff utility
│   │   │
│   │   └── discord/
│   │       └── clientOptions.ts
│   │           └── Discord.js client configuration
│   │
│   ├── modules/
│   │   │
│   │   ├── message-capture/
│   │   │   ├── messageCapture.ts
│   │   │   │   └── CONTROLLER: Discord event listeners
│   │   │   │       - messageCreate, messageUpdate, messageDelete
│   │   │   │       - Validates capture target, publishes events
│   │   │   │
│   │   │   ├── messageStore.ts
│   │   │   │   └── REPOSITORY: Database CRUD operations
│   │   │   │       - upsertMessageForCapture
│   │   │   │       - updateMessageAsEdited
│   │   │   │       - updateMessageAsDeleted
│   │   │   │       - insertAttachment
│   │   │   │       - getMessageById
│   │   │   │
│   │   │   ├── messageMetadata.ts
│   │   │   │   └── SERVICE: Message metadata extraction
│   │   │   │       - getMessageMetadata
│   │   │   │       - getMessageLocation
│   │   │   │       - getDisplayContent
│   │   │   │
│   │   │   ├── types.ts
│   │   │   │   └── Domain types
│   │   │   │       - MessageRecord
│   │   │   │       - AttachmentRecord
│   │   │   │       - VoiceSegmentRecord
│   │   │   │       - AIStatus, AISeverity, AIRecommendedAction
│   │   │   │
│   │   │   └── index.ts
│   │       └── Module exports
│   │
│   │   ├── ai-moderation/
│   │   │   ├── aiAnalyzer.ts
│   │   │   │   └── CONTROLLER: Analysis orchestration
│   │   │   │       - startPendingAIAnalysisWorker
│   │   │   │       - queueMessageAnalysis
│   │   │   │       - Manages analysis queue and worker pool
│   │   │   │
│   │   │   ├── llmModerationClient.ts
│   │   │   │   └── SERVICE: LLM API integration
│   │   │   │       - Calls LLM for text/image moderation
│   │   │   │       - Parses responses, handles errors
│   │   │   │       - Retry logic with backoff
│   │   │   │
│   │   │   ├── aiAnalysisWorker.ts
│   │   │   │   └── SERVICE: Worker pool management
│   │   │   │       - Piscina worker pool for parallel analysis
│   │   │   │       - Conversation context batching
│   │   │   │
│   │   │   ├── indonesianTextNormalizer.ts
│   │   │   │   └── SERVICE: Text preprocessing
│   │   │   │       - Normalize Indonesian text
│   │   │   │       - Handle diacritics, abbreviations
│   │   │   │
│   │   │   ├── moderationPrompt.ts
│   │   │   │   └── SERVICE: Prompt generation
│   │   │   │       - Generate LLM prompts for moderation
│   │   │   │       - Include context and policy
│   │   │   │
│   │   │   └── index.ts
│   │       └── Module exports
│   │
│   │   ├── voice-recording/
│   │   │   ├── voiceController.ts
│   │   │   │   └── CONTROLLER: Voice connection management
│   │   │   │       - connect(guildId, channelId)
│   │   │   │       - disconnect()
│   │   │   │       - listGuilds(), listVoiceChannels()
│   │   │   │       - getStatus()
│   │   │   │
│   │   │   ├── recorder.ts
│   │   │   │   └── SERVICE: Recording orchestration
│   │   │   │       - startRecording(client, channel)
│   │   │   │       - stopRecording(guildId)
│   │   │   │       - Manages active recording sessions
│   │   │   │
│   │   │   ├── recorder/
│   │   │   │   ├── audioStream.ts
│   │   │   │   │   └── SERVICE: Audio stream subscription
│   │   │   │   │       - subscribeToAudioStream
│   │   │   │   │       - Opus packet handling
│   │   │   │   │
│   │   │   │   ├── decoder.ts
│   │   │   │   │   └── SERVICE: Opus decoding
│   │   │   │   │       - OpusDecoder class
│   │   │   │   │       - Decode Opus to PCM
│   │   │   │   │       - Rotation and cooldown logic
│   │   │   │   │
│   │   │   │   ├── segment.ts
│   │   │   │   │   └── SERVICE: OGG segment rotation
│   │   │   │   │       - SegmentManager class
│   │   │   │   │       - Rotate segments (5s default)
│   │   │   │   │       - Write OGG files
│   │   │   │   │
│   │   │   │   ├── metadata.ts
│   │   │   │   │   └── SERVICE: Segment metadata
│   │   │   │   │       - collectUserMetadata
│   │   │   │   │       - createSegmentMetadata
│   │   │   │   │       - User info, roles, timestamps
│   │   │   │   │
│   │   │   │   ├── sessionRecording.ts
│   │   │   │   │   └── SERVICE: Session management
│   │   │   │   │       - createRecordingSession
│   │   │   │   │       - finalizeRecordingSession
│   │   │   │   │       - Track active sessions
│   │   │   │   │
│   │   │   │   └── uploader.ts
│   │   │   │       └── SERVICE: Segment upload
│   │   │   │           - uploadRecordingSegment
│   │   │   │           - Upload to external storage
│   │   │   │           - Retry logic
│   │   │   │
│   │   │   └── index.ts
│   │       └── Module exports
│   │
│   │   ├── attachment-upload/
│   │   │   ├── attachmentUploader.ts
│   │   │   │   └── SERVICE: Upload orchestration
│   │   │   │       - processAttachmentUpload
│   │   │   │       - Download from Discord
│   │   │   │       - Upload to external storage
│   │   │   │       - Retry with backoff
│   │   │   │
│   │   │   ├── imageResizer.ts
│   │   │   │   └── SERVICE: Image processing
│   │   │   │       - resizeImage
│   │   │   │       - Resize to max dimension
│   │   │   │       - Preserve aspect ratio
│   │   │   │
│   │   │   └── index.ts
│   │       └── Module exports
│   │
│   │   └── event-broadcaster/
│   │       ├── eventBroadcaster.ts
│   │       │   └── SERVICE: Redis pub/sub publisher
│   │       │       - EventBroadcaster class
│   │       │       - RedisEventPublisher class
│   │       │       - Publish to Redis channels
│   │       │       - Methods:
│   │       │         - messageCreated()
│   │       │         - messageUpdated()
│   │       │         - messageDeleted()
│   │       │         - messageAnalyzed()
│   │       │         - attachmentCreated()
│   │       │         - attachmentUploaded()
│   │       │         - voiceRecordingStarted()
│   │       │         - voiceRecordingStopped()
│   │       │         - voiceRecordingUploaded()
│   │       │         - analysisQueueStatus()
│   │       │
│   │       ├── eventTypes.ts
│   │       │   └── Domain types
│   │       │       - DiscordGatewayEvent interface
│   │       │       - EventChannels constants
│   │       │       - Event channel names
│   │       │
│   │       └── index.ts
│           └── Module exports
│
│   ├── mock-crc.ts
│   │   └── CRC polyfill for discord.js compatibility
│   │
│   └── index.ts
│       └── Service entry point
│           - Initialize Discord Gateway
│           - Handle startup errors
│
├── ARCHITECTURE.md
│   └── Detailed architecture documentation
│
├── README.md
│   └── Complete service documentation
│
├── MODULE_STRUCTURE.md
│   └── This file - module structure reference
│
└── package.json
    └── Service dependencies and scripts
```

## Module Responsibilities

### message-capture
**Purpose**: Capture Discord messages (create, update, delete)
**Pattern**: Controller-Service-Repository
- **Controller** (messageCapture.ts): Listens to Discord events
- **Service** (messageMetadata.ts): Extracts metadata
- **Repository** (messageStore.ts): Database operations
- **Events Published**:
  - `discord:message:created`
  - `discord:message:updated`
  - `discord:message:deleted`

### ai-moderation
**Purpose**: Analyze messages with LLM for moderation
**Pattern**: Controller-Service-Service-Service
- **Controller** (aiAnalyzer.ts): Orchestrates analysis workflow
- **Service** (llmModerationClient.ts): LLM API integration
- **Service** (aiAnalysisWorker.ts): Worker pool management
- **Service** (indonesianTextNormalizer.ts): Text preprocessing
- **Service** (moderationPrompt.ts): Prompt generation
- **Events Published**:
  - `discord:message:analyzed`
  - `discord:analysis:queue_status`

### voice-recording
**Purpose**: Record voice channel audio
**Pattern**: Controller-Service-SubServices
- **Controller** (voiceController.ts): Voice connection management
- **Service** (recorder.ts): Recording orchestration
- **Sub-services** (recorder/*): Audio processing pipeline
  - audioStream.ts: Opus packet subscription
  - decoder.ts: Opus to PCM decoding
  - segment.ts: OGG file rotation
  - metadata.ts: User metadata collection
  - sessionRecording.ts: Session lifecycle
  - uploader.ts: Segment upload
- **Events Published**:
  - `discord:voice:started`
  - `discord:voice:stopped`
  - `discord:voice:uploaded`

### attachment-upload
**Purpose**: Upload message attachments to external storage
**Pattern**: Service-Service
- **Service** (attachmentUploader.ts): Upload orchestration
- **Service** (imageResizer.ts): Image processing
- **Events Published**:
  - `discord:attachment:created`
  - `discord:attachment:uploaded`

### event-broadcaster
**Purpose**: Publish events to Redis pub/sub
**Pattern**: Service-Domain
- **Service** (eventBroadcaster.ts): Redis publisher
- **Domain** (eventTypes.ts): Event type definitions
- **Channels**:
  - discord:message:* (message events)
  - discord:attachment:* (attachment events)
  - discord:voice:* (voice events)
  - discord:analysis:* (analysis events)

## Shared Infrastructure

### config
- Zod-validated environment variables
- Type-safe configuration access
- Sensible defaults

### database
- Drizzle ORM schema
- PostgreSQL connection
- Migration management
- Voice recording repository

### logger
- Winston logger wrapper
- Context-aware logging
- Log serialization utilities

### errors
- Custom error classes
- Error codes and HTTP status codes
- Proper error hierarchy

### utils
- Retry with exponential backoff
- Configurable retry parameters

### discord
- Discord.js client configuration
- Cache optimization
- Partial handling

## Event Flow

```
Discord Events
    ↓
message-capture (Controller)
    ↓
messageStore (Repository) → PostgreSQL
    ↓
eventBroadcaster (Service)
    ↓
Redis Pub/Sub
    ↓
Backend Service (Subscriber)
    ↓
HTTP API / WebSocket
    ↓
Frontend Application
```

## No HTTP Server

- ✅ No Express
- ✅ No WebSocket server
- ✅ No HTTP routes
- ✅ No middleware
- ✅ Pure event-driven service

## Graceful Shutdown

1. Close PostgreSQL connection
2. Disconnect from voice channels
3. Close Redis connection
4. Destroy Discord client
5. Exit process

## Dependencies

**Discord**:
- discord.js-selfbot-v13
- @discordjs/voice
- @discordjs/opus

**Audio**:
- prism-media
- opusscript
- sharp

**Data**:
- drizzle-orm
- pg
- zod
- ioredis

**Logging**:
- winston
- p-retry
- p-limit
- piscina

## Summary

The Discord Gateway service is a **pure event-driven microservice** that:
- Captures Discord messages, voice, and attachments
- Performs AI moderation analysis
- Publishes events to Redis pub/sub
- Has no HTTP server or WebSocket
- Follows Modular MVC pattern
- Maintains clean module boundaries
- Provides type-safe configuration
- Includes structured logging
- Handles graceful shutdown

The service is designed to run alongside the Backend service, which consumes Redis events and serves the HTTP API to the Frontend.
