# Discord Gateway — Architecture

Pure event-driven microservice (no HTTP server). Captures Discord
messages/attachments/reactions/threads/presence, runs LLM-based AI
moderation, and publishes everything to Redis pub/sub for the backend to
consume. The backend serves the HTTP/WS API to the frontend.

> NOTE: this doc is the source of truth for the module layout. The old
> `MODULE_STRUCTURE.md` was a stale duplicate and has been removed. `README.md`
> only covers how to run the service.

## Top-level layout

```
services/discord-gateway/
├── src/
│   ├── index.ts                     # Entry point → initializeDiscordGateway()
│   ├── app/                         # Process lifecycle
│   │   ├── bootstrap.ts             # Startup order: config → DB → services → metrics → login
│   │   ├── lifecycle.ts             # Everything wired on the Discord 'ready' hook
│   │   ├── process-guards.ts        # SIGINT/SIGTERM + uncaught-error policy
│   │   ├── metrics-collector.ts     # AI pipeline Prometheus gauges
│   │   ├── shutdown.ts              # Graceful shutdown sequence
│   │   └── retention.ts             # Expired-record cleanup scheduler
│   ├── shared/                      # Infrastructure — never imports from modules/
│   │   ├── config/                  # Zod-validated env (index.ts = schema+loader)
│   │   ├── database/                # Drizzle ORM + pg Pool + migrations
│   │   │   ├── init.ts drizzle.ts pool.ts migrate.ts migrateCli.ts
│   │   │   └── schema/              # messages, cache, meta, analytics
│   │   ├── logger/                  # pino wrapper + createChildLogger()
│   │   ├── errors/                  # AppError / ConfigError ... + errorMessage()
│   │   │                            #   + isTransientStreamError()
│   │   ├── utils/                   # retry, pagination
│   │   ├── discord/clientOptions.ts # discord.js-selfbot-v13 client options
│   │   ├── uploader.ts              # Shared attachment upload helper
│   │   ├── redis-channels.ts        # Redis channel + command constants
│   │   └── moderation-types.ts      # Shared AI analysis domain types
│   └── modules/                     # Feature modules, each with an index.ts facade
│       ├── message-capture/         # Discord event listeners + DB store
│       ├── ai-moderation/           # LLM moderation pipeline (see below)
│       ├── attachment-upload/       # Download + (sharp) resize + upload
│       ├── event-broadcaster/       # RedisEventPublisher + EventBroadcaster
│       ├── command-handler/         # Redis-subscribed backend→gateway commands
│       ├── reaction-tracking/ thread-tracking/ user-presence/
│       ├── channel-topic/ guild-member-events/ monitor/
│       └── gateway-metrics/         # Prometheus /metrics endpoint (METRICS_PORT)
```

Dependency direction is one-way: `index.ts` → `app/` → `modules/` → `shared/`.
Code outside a module imports its `index.ts` facade, never an internal file;
deep imports stay valid inside the module itself.

## AI moderation pipeline (`ai-moderation/`)

LLM-only judge — no regex/heuristic classification. One orchestrator call
handles a whole batch. **Independent text/media lanes** (2026-09-24): a
conversation batch is split into a text lane (messages with no media) and a
media lane (attachments/stickers/embeds) that are dispatched to separate
pools, hold SEPARATE per-lane processing locks, and run under SEPARATE LLM
concurrency semaphores. The text lane frees its lock and saves+broadcasts the
moment text analysis finishes — it never waits on a slow vision/media batch
of the same conversation, and vice versa.

- `aiAnalyzer.ts` — public API: `queueMessageAnalysis`, `queueConversationAnalysis`,
  `getAnalysisQueueStatus`, `startPendingAIAnalysisWorker`. Short-circuits
  age-restricted and skip-list messages before any LLM work.
- `recovery-worker.ts` — periodic sweep for stranded `pending` messages
  (re-scheduled per lane) and `error`/`analysis_incomplete` messages
  (individual fallback queue); prunes stale lane locks, per-conversation CB
  counters and individual in-flight markers.
- `cache-prune.ts` — throttled (6h) expired-verdict sweep across Postgres and
  Qdrant, driven from the recovery interval.
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

`bootstrap.ts` runs these steps in order (each is a named function):

1. Validate env (Zod). Refuse to start if `AI_ANALYSIS_ENABLED` but no key.
   → `assertConfigIsUsable()`
2. Build long-lived services: Discord client, `RedisEventPublisher` +
   `EventBroadcaster`, `CommandHandler`; install the shutdown handler.
3. Connect infrastructure → `connectDatabase()`:
   `AUTO_MIGRATE_ON_STARTUP` runs pending Drizzle migrations, then
   `initializeDatabase()` (pg Pool, min 0).
4. `registerClientDebugLogging()` — only client debug lines carrying signal.
5. Install process guards (`registerProcessGuards`).
6. Register pipeline gauges + start the metrics server (`METRICS_PORT`, code
   default 9090, set per deployment).
7. `client.login(token)`.

On the Discord `ready` event, `lifecycle.ts` runs `startGatewayLifecycle()`:

1. Inject the event broadcaster into message-capture and moderation-actions
   (before any listener can fire).
2. Register Discord listeners: message-capture, reaction, thread, presence,
   channel-topic, guild-member.
3. Start background work: AI analysis worker + recovery worker, command
   handler, retention cleanup, weekly digest.

## Graceful shutdown

`process-guards.ts` owns the policy. `SIGINT`/`SIGTERM` and non-transient
uncaught exceptions/rejections run `shutdown.ts`; transient stream errors
(EPIPE / ECONNRESET / ERR_STREAM_DESTROYED / ERR_STREAM_WRITE_AFTER_END, see
`isTransientStreamError()`) are logged and IGNORED so the bot stays online.

Shutdown order: stop metrics → close event broadcaster (Redis) → close command
handler → close DB → destroy client → exit.

## Observability

Prometheus scrapes the metrics server at `127.0.0.1:$METRICS_PORT/metrics`
(`bete_*` prefix; the code default is 9090 — deployments set it explicitly,
this host uses 4018). Collectors run
per-scrape and expose: process memory/uptime, and (when AI analysis is on) live
pipeline gauges registered by `app/metrics-collector.ts` —
`ai_analysis_queued_conversations`, `ai_analysis_active_batch_requests`,
`ai_analysis_active_text_requests`, `ai_analysis_active_media_requests`,
`ai_analysis_active_individual_requests`, `ai_analysis_individual_in_flight`,
`ai_analysis_individual_circuit_breaker_active`,
`ai_analysis_worker_threads_{text,media}`,
`ai_analysis_worker_threads_active_{text,media}`.

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
