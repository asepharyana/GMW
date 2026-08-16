# Discord Gateway Service — Module Structure

> Kept as a compact module map. For the authoritative layout, design
> decisions, and invariants, see `ARCHITECTURE.md`. This file was rewritten
> on 2026-08-16 to fix stale references (`winston` → pino,
> `mock-crc.ts`/`indonesianTextNormalizer.ts` removed,
> `aiAnalysisWorker.ts` → `ai-analysis-worker.ts`,
> `llmModerationClient.ts` → `llmClient.ts`).

## Top-level

```
services/discord-gateway/
├── src/
│   ├── index.ts                     # Entry point
│   ├── app/                         # bootstrap, shutdown, retention
│   ├── shared/                      # config, database, logger, errors, utils, discord, uploader
│   └── modules/
│       ├── message-capture/         # Discord listeners + DB store + metadata
│       ├── ai-moderation/           # LLM moderation pipeline (largest module)
│       ├── voice-recording/         # Voice connect + Opus→OGG recording (+ recorder/)
│       ├── voice-pcm-ws/            # Real-time PCM → backend WebSocket
│       ├── attachment-upload/       # Download + sharp resize + upload
│       ├── event-broadcaster/        # RedisEventPublisher + EventBroadcaster
│       ├── command-handler/         # Backend→gateway Redis commands
│       ├── reaction-tracking/ thread-tracking/ user-presence/
│       ├── channel-topic/ guild-member-events/
│       └── gateway-metrics/         # Prometheus /metrics (port 4016)
├── tests/                           # Vitest suites (129 tests)
├── drizzle/                         # Drizzle migration SQL + journal
├── ARCHITECTURE.md  README.md  package.json  tsconfig.json  vitest.config.ts
```

## Module responsibilities (summary)

### message-capture
Captures `messageCreate`/`messageUpdate`/`messageDelete`, extracts metadata,
stores to Postgres, publishes to Redis. Controller–Service–Repository split:
`messageCapture.ts` (listener) → `messageStore.ts` (DB) + `messageMetadata.ts`
(service).

### ai-moderation
LLM-only moderation. Entry: `aiAnalyzer.ts` (`queueMessageAnalysis`,
`startPendingAIAnalysisWorker`, `getAnalysisQueueStatus`). Scheduling:
`batchScheduler.ts` → `batchProcessor.ts` (batch lock + circuit breaker) →
`individualFallbackProcessor.ts` (per-message retry). Heavy work runs in the
Piscina pool via `ai-analysis-worker.ts` (jobs `batch` / `individual`).
Orchestration/caching: `moderationOrchestrator.ts` (exact hash → batched
semantic Qdrant → LLM), `textBatchProcessor.ts` / `mediaBatchProcessor.ts`
(one LLM call per sub-batch), `llmClient.ts` (central streaming client),
`embeddingClient.ts` + `qdrantClient.ts` (semantic cache), plus
`channelCultureStore.ts` / `userProfileStore.ts` / `userReputationStore.ts`.

### voice-recording
`voiceController.ts` (connect/disconnect/list) + `recorder.ts` (orchestration)
+ `recorder/` (decoder, segment, session, uploader, oggCrc). Publishes
`discord:voice:*` events. Real-time audio also streamed via `voice-pcm-ws`.

### attachment-upload
`attachmentUploader.ts` (download → upload to storage) + `imageResizer.ts`
(sharp resize). Emits `discord:attachment:*`.

### event-broadcaster
`RedisEventPublisher` (ioredis publish) + `EventBroadcaster` (typed methods).
Channel names in `src/shared/redis-channels.ts`.

### gateway-metrics
`metrics.ts` Prometheus HTTP server on `METRICS_PORT` (4016). Collectors run
per scrape; live pipeline gauges registered in `bootstrap.ts`.

## Shared infrastructure
- **config** — Zod schema in `shared/config/index.ts` (single source of truth).
- **database** — Drizzle ORM over `pg`; pool `min:0` (`shared/config`).
- **logger** — `pino` wrapper, `createChildLogger()` for context loggers.
- **errors** — `AppError` hierarchy (`ConfigError`, `AudioError`, …).

## Notes
- No HTTP server (other than the metrics endpoint). Pure event-driven.
- `MODULE_STRUCTURE.md` is intentionally a sketch; `ARCHITECTURE.md` is the
  detailed reference. When they diverge, `ARCHITECTURE.md` wins.
