# Discord Gateway — Architecture

Pure event-driven microservice (no HTTP server). Captures Discord
messages/attachments/reactions/threads/presence, runs LLM-based AI
moderation, and publishes everything to Redis pub/sub for the backend to
consume. The backend serves the HTTP/WS API to the frontend.

> NOTE: this doc is the source of truth for the module layout. The older
> `MODULE_STRUCTURE.md` was stale (referenced `winston`, `mock-crc.ts`,
> `indonesianTextNormalizer.ts`, and `aiAnalysisWorker.ts`/`llmModerationClient.ts`
> which were renamed/merged). If they disagree, this file wins.

## Top-level layout

```
services/discord-gateway/
├── src/
│   ├── index.ts                     # Entry point → initializeDiscordGateway()
│   ├── app/
│   │   ├── bootstrap.ts             # Wires client, DB, Redis, workers, schedulers
│   │   ├── shutdown.ts              # Graceful shutdown (SIGINT/SIGTERM + transient errors)
│   │   └── retention.ts             # Expired-record cleanup scheduler
│   ├── shared/
│   │   ├── config/                  # Zod-validated env (index.ts = schema+loader)
│   │   ├── database/                # Drizzle ORM + pg Pool + migrations
│   │   │   ├── init.ts drizzle.ts pool.ts migrate.ts migrateCli.ts
│   │   │   └── schema/              # messages, cache, meta, analytics
│   │   ├── logger/                  # pino wrapper + createChildLogger()
│   │   ├── errors/                  # AppError / ConfigError ...
│   │   ├── utils/                   # retry, pagination
│   │   ├── discord/clientOptions.ts # discord.js-selfbot-v13 client options
│   │   ├── uploader.ts              # Shared attachment upload helper
│   │   ├── redis-channels.ts        # Redis channel-name constants
│   │   └── moderation-types.ts      # Shared AI analysis domain types
│   └── modules/
│       ├── message-capture/         # Discord event listeners + DB store
│       ├── ai-moderation/           # LLM moderation pipeline (see below)
│       ├── attachment-upload/       # Download + (sharp) resize + upload
│       ├── event-broadcaster/        # RedisEventPublisher + EventBroadcaster
│       ├── command-handler/         # Redis-subscribed backend→gateway commands
│       ├── reaction-tracking/ thread-tracking/ user-presence/
│       ├── channel-topic/ guild-member-events/
│       └── gateway-metrics/         # Prometheus /metrics endpoint (port 4016)
```

## AI moderation pipeline (`ai-moderation/`)

LLM-only judge — no regex/heuristic classification. One orchestrator call
handles a whole batch. **Independent text/media lanes** (2026-09-24): a
conversation batch is split into a text lane (messages with no media) and a
media lane (attachments/stickers/embeds) that are dispatched to separate
pools, hold SEPARATE per-lane processing locks, and run under SEPARATE LLM
concurrency semaphores. The text lane frees its lock and saves+broadcasts the
moment text analysis finishes — it never waits on a slow vision/media batch
of the same conversation, and vice versa.

- `aiAnalyzer.ts` — public API: `queueMessageAnalysis`, `getAnalysisQueueStatus`,
  `startPendingAIAnalysisWorker` (recovery worker + cache-prune).
- `batchScheduler.ts` — per-conversation per-LANE debounce → `processBatch`
  (lane-aware). `splitMessagesByLane` / `laneOfMessage` live in
  `analysisLanes.ts` (pure, unit-testable).
- `batchProcessor.ts` — per-lane batch lock/circuit-breaker, fans failed
  targets to individual fallback. `processBatch` releases ITS lane's lock the
  moment that lane's worker job finishes; the other lane owns its own lock.
- `individualFallbackProcessor.ts` — one-message-at-a-time retry path, own CB.
- `conversationState.ts` / `circuitBreaker.ts` — per-conversation PER-LANE
  state (`conversationProcessing` holds a lane → startedAt map per key),
  Piscina `textWorkerPool`/`mediaWorkerPool`, `getConversationKey`.
- `ai-analysis-worker.ts` — Piscina entry point (`batch` (lane) /
  `individual` jobs). Runs `runModerationAnalysis` off the main thread.
- `moderationOrchestrator.ts` — exact-hash cache → batched semantic (Qdrant)
  cache → LLM. Text and media paths run in parallel.
- `textBatchProcessor.ts` / `mediaBatchProcessor.ts` — actual LLM calls
  (one call per sub-batch, not per message). `mediaBatchProcessor` routes its
  moderation LLM call through the MEDIA semaphore.
- `llmClient.ts` — central OpenAI-compatible chat client (streaming, retries,
  thinking-disable injection). TWO concurrency semaphores:
  `AI_LLM_MAX_CONCURRENT` (text lane, default 8) and
  `AI_LLM_MEDIA_MAX_CONCURRENT` (media lane, default 4) — a vision backlog
  can never consume text slots. `visionAnalyzer.ts` / `mediaAnalysisClient.ts`
  share the same router/base URL (different model alias for vision).
- `embeddingClient.ts` + `qdrantClient.ts` — semantic cache (one embed call +
  one batched Qdrant search for all uncached targets).
- `textCacheStore.ts` / `channelCultureStore.ts` / `userProfileStore.ts` /
  `userProfileStore.ts` — caches learned user profile summaries (optional).

### Concurrency model

- Main thread owns TWO per-lane LLM semaphores (2026-09-24):
  `AI_LLM_MAX_CONCURRENT` (text, default 8) and `AI_LLM_MEDIA_MAX_CONCURRENT`
  (media, default 4) via `llmClient.withLlmConcurrency(fn, { lane })`.
- Two Piscina pools run the heavy LLM work off the event loop: a text pool
  (`PISCINA_MAX_THREADS`, default 4) and a dedicated media pool
  (`PISCINA_MEDIA_MAX_THREADS`, default 2). A batch is routed by lane to the
  matching pool — this keeps a slow image/vision batch from occupying every
  thread and blocking unrelated text-only batches behind it. **Each worker
  thread (in either pool) initializes its own pg Pool** (min 0, grows to
  `POSTGRES_POOL_MAX`).  See "Memory & connections" below.

## Memory & DB connections

`MemoryMax=1G` (raised from 512M — live RSS sits at ~500 MiB, peak 508 MiB,
so 512M left ~2% headroom and risked an OOM-kill restart). Host has 8 GB free.

`POSTGRES_POOL_MIN=0` (default). The gateway = main process + up to 4 text
Piscina worker threads + up to 2 media Piscina worker threads, each with its
own pg Pool. With min:0 the pools stay empty until a query runs and drop
idle clients afterward, instead of holding `(1 main + 4 text + 2 media) × 2
= 14` permanently-open idle connections against PgBouncer. The pool still
grows on demand up to `POSTGRES_POOL_MAX`.

## Event channels (Redis pub/sub)

`discord:message:{created,updated,deleted,analyzed}`,
`discord:attachment:{created,uploaded}`,
`discord:analysis:queue_status`,
`discord:reaction:{added,removed}`,
`discord:thread:{created,deleted,updated}`,
`discord:channel_topic:updated`,
`discord:presence:updated`,
`discord:guild_member:{added,removed}`.
See `src/shared/redis-channels.ts` for the canonical names.

## Initialization flow

1. Validate env (Zod). Refuse to start if `AI_ANALYSIS_ENABLED` but no key.
2. `AUTO_MIGRATE_ON_STARTUP` → run pending Drizzle migrations.
3. `initializeDatabase()` (pg Pool, min 0).
4. Create discord.js-selfbot-v13 client; register listeners on `ready`.
5. Start `gmw-discord-gateway` metrics server (port `METRICS_PORT`, default 4016).
6. `client.login(token)`.

## Graceful shutdown

`SIGINT`/`SIGTERM` (and uncaught transient stream errors: EPIPE / ECONNRESET /
ERR_STREAM_DESTROYED / ERR_STREAM_WRITE_AFTER_END are treated as non-fatal):
stop metrics → close event broadcaster (Redis) → close command handler →
close DB → destroy client → exit.

## Observability

Prometheus scrapes `127.0.0.1:4016/metrics` (`bete_*` prefix). Collectors run
per-scrape and expose: process memory/uptime, and (when AI analysis is on) live
pipeline gauges — `ai_analysis_queued_conversations`,
`ai_analysis_active_batch_requests`, `ai_analysis_active_individual_requests`,
`ai_analysis_individual_in_flight`, `ai_analysis_individual_circuit_breaker_active`,
`ai_analysis_worker_threads`, `ai_analysis_worker_threads_active`.

## Key invariants (do not break)

- **LLM is the only judge.** Failed LLM → `status:"error"` + recovery retry.
  Never reintroduce regex/heuristic content classification.
- **Discord tokens are sanitized** (`discordTokens.ts`: `<:emoji:id>` →
  `[emoji:name]`, `<@id>` → `@user`, etc.) before content reaches the LLM, so
  numeric snowflake IDs never trigger false positives.
- **Semantic cache is batched** (one embed call + one Qdrant batch search),
  not N sequential round-trips. `ensureQdrantCollection` is memoized.
- **Streaming is mandatory** against the omniroute base URL (non-stream waits for
  the full body and times out). `llmClient` aggregates SSE chunks.
