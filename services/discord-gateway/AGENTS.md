# Discord Gateway — Agent Guide

> **Read `../../AGENTS.md` first.** This file adds gateway-specific conventions.

Event-driven microservice: captures Discord events, runs AI moderation, publishes to Redis.

## Quick reference

```bash
pnpm typecheck              # tsc --noEmit
pnpm lint                   # biome check --diagnostic-level=error .
pnpm build                  # tsc
pnpm test                   # vitest run
pnpm format                 # biome format --write .
```

## Architecture (Event-driven)

```
src/
├── index.ts                     # Entry point → initializeDiscordGateway()
├── app/
│   ├── bootstrap.ts             # Wires client, DB, Redis, workers, schedulers
│   ├── shutdown.ts              # Graceful shutdown
│   └── retention.ts             # Expired-record cleanup
├── shared/
│   ├── config/index.ts          # Zod-validated env (SINGLE source of truth)
│   ├── database/                # Drizzle ORM + pg Pool + migrations
│   ├── logger/index.ts          # pino + createChildLogger()
│   ├── errors/index.ts          # AppError hierarchy
│   ├── utils/                   # retry, pagination
│   ├── discord/clientOptions.ts # discord.js-selfbot-v13 options
│   ├── uploader.ts              # Attachment upload helper
│   ├── redis-channels.ts        # Redis channel-name constants
│   └── moderation-types.ts      # Shared AI analysis types
├── modules/
│   ├── ai-moderation/           # LLM moderation pipeline (largest module)
│   ├── message-capture/         # Discord event listeners + DB store
│   ├── attachment-upload/       # Download + sharp resize + upload
│   ├── event-broadcaster/       # Redis pub/sub publisher
│   ├── command-handler/         # Backend→gateway Redis commands
│   ├── reaction-tracking/       # Reaction events
│   ├── thread-tracking/         # Thread events
│   ├── user-presence/           # Presence/status events
│   ├── channel-topic/           # Channel topic events
│   ├── guild-member-events/     # Member join/leave
│   └── gateway-metrics/         # Prometheus /metrics (port 4016)
└── tests/                       # Vitest suites
```

## Key invariants (DO NOT BREAK)

1. **LLM is the only judge.** Failed LLM → `status:"error"` + recovery retry.
   **Never** reintroduce regex/heuristic content classification.
2. **Discord tokens sanitized** before reaching LLM (`discordTokens.ts`).
3. **Streaming is mandatory** against the router base URL.

## AI moderation pipeline

```
aiAnalyzer.ts → batchScheduler.ts → batchProcessor.ts → individualFallbackProcessor.ts
    ↓                  ↓                    ↓                        ↓
moderationOrchestrator.ts → (hash cache → LLM)
    ↓                          ↓                              ↓
textBatchProcessor.ts    mediaBatchProcessor.ts         llmClient.ts
```

- Entry: `aiAnalyzer.ts` (`queueMessageAnalysis`, `startPendingAIAnalysisWorker`)
- Concurrency: **two per-lane LLM semaphores** (2026-09-24) — text
  (`AI_LLM_MAX_CONCURRENT`, default 8) and media/vision
  (`AI_LLM_MEDIA_MAX_CONCURRENT`, default 4); a media backlog can never
  consume text slots
- Piscina: text pool (4 threads) + media pool (2 threads)
- Locks are **per conversation per lane** (`conversationProcessing` maps key →
  lane → startedAt): the text lane of a conversation never waits on that
  conversation's media lane (this was the "image blocks the queue" bug)
- **Each worker thread has its own pg Pool** (min 0, grows to `POSTGRES_POOL_MAX`)

## Module: message-capture

- `messageCapture.ts` — Discord event listeners (messageCreate/Update/Delete)
- `messageStore.ts` — DB operations
- `messageMetadata.ts` — metadata extraction
- `messagesDb.ts` / `messagesCrud.ts` — DB schema operations
- `retentionDb.ts` / `reviewsDb.ts` / `attachmentsDb.ts` — auxiliary tables

## Redis channels (outbound to backend)

See `src/shared/redis-channels.ts` for canonical names. Examples:
```
discord:message:created, discord:moderation:action, discord:attachment:uploaded
```

## Config (env vars)

All validated via Zod in `shared/config/index.ts`. Critical:

- `DISCORD_TOKEN` — selfbot token
- `MONITOR_GUILD_ID` — primary guild
- `DATABASE_URL` — PostgreSQL
- `REDIS_URL` — pub/sub to backend
- `AI_ANALYSIS_ENABLED` — master toggle for AI moderation
- `AI_LLM_BASE_URL` / `AI_LLM_API_KEY` — LLM router
- `PISCINA_MAX_THREADS` / `PISCINA_MEDIA_MAX_THREADS` — worker pool sizing

## Concurrency model

- Main thread: event loop + LLM semaphore
- Text Piscina pool: `PISCINA_MAX_THREADS` (default 4)
- Media Piscina pool: `PISCINA_MEDIA_MAX_THREADS` (default 2)
- Batch routed to media pool if ANY message has attachment/sticker/embed
- Each worker thread initializes own pg Pool (min 0, grows to `POSTGRES_POOL_MAX`)
- MemoryMax: 1G (service systemd limit)

## Testing

- Vitest. Test files: `tests/<name>.test.ts`
- Run: `pnpm test`
- Key test areas: batch operations, cache guards, image/video handling, context enrichment
- Unit tests for pure helpers (classifier, normalize, parse), integration for pipeline stages

## Common pitfalls

- **Piscina pool isolation**: worker threads are NOT the main thread. Cannot
  share state via module-level variables. Use DB or Redis for cross-thread state.
- **Cache eviction**: LRU caches (user metadata, term glossary) evict at max size.
  Don't assume cache hit after eviction.
- **Circuit breaker**: per-conversation CB opens after repeated failures.
  Check `circuitBreaker.ts` state when debugging "missing analysis".
- **Gateway≠Backend schema**: both have `redis-channels.ts` and `moderation-types.ts`.
  Keep them in sync manually.
