# Discord Gateway

Event-driven selfbot service: captures Discord events, runs LLM moderation,
publishes everything to Redis for the backend to consume.

> Architecture, invariants and the AI pipeline are documented in
> **`ARCHITECTURE.md`** — that file is the source of truth. This README only
> covers how to run it.

## Commands

```bash
pnpm install
pnpm typecheck     # tsc --noEmit
pnpm lint          # biome check --diagnostic-level=error .
pnpm test          # vitest run (138 tests)
pnpm build         # tsc — CI/prod builds run this inside nix, which also
                   # runs scripts/fix-imports.mjs to rewrite @/ aliases and
                   # extensionless imports for Node ESM
pnpm dev           # tsx watch src/index.ts
pnpm start         # node dist/index.js
```

Deployment is CI-only: `nix build .#discord-gateway` → Attic cache → systemd
restart on the VPS. Do not build/hand-copy the artifact.

## Layout

```
src/
├── index.ts                 # entry → initializeDiscordGateway()
├── app/                     # process lifecycle
│   ├── bootstrap.ts         #   startup order: config → DB → services → metrics → login
│   ├── lifecycle.ts         #   everything wired on the Discord 'ready' hook
│   ├── process-guards.ts    #   SIGINT/SIGTERM + uncaught error policy
│   ├── metrics-collector.ts #   AI pipeline Prometheus gauges
│   ├── shutdown.ts          #   graceful shutdown sequence
│   └── retention.ts         #   expired-record cleanup scheduler
├── shared/                  # infrastructure — never imports from modules/
│   ├── config/ database/ logger/ errors/ utils/
│   ├── discord/clientOptions.ts
│   ├── redis-channels.ts    #   canonical Redis channel + command constants
│   └── moderation-types.ts  #   domain types shared across services
└── modules/                 # feature modules (each exposes an index.ts facade)
    ├── ai-moderation/       #   LLM moderation pipeline (largest module)
    ├── message-capture/     #   Discord listeners + message/attachment DB
    ├── attachment-upload/   #   download → resize → upload
    ├── event-broadcaster/   #   Redis pub/sub publisher
    ├── command-handler/     #   backend → gateway commands over Redis
    ├── gateway-metrics/     #   Prometheus /metrics (METRICS_PORT)
    ├── monitor/             #   weekly digest scheduler
    └── reaction-tracking/ thread-tracking/ user-presence/
        channel-topic/ guild-member-events/
```

Dependency direction is one-way: `index.ts` → `app/` → `modules/` → `shared/`.
Callers outside a module import its `index.ts` facade, never an internal file.

## Testing

Vitest, tests in `tests/`. Config supplies dummy env vars so the suite runs
without live Postgres/Redis/Qdrant; external services are mocked. `llmE2e.test.ts`
is skipped by default and needs real credentials (`pnpm test:e2e:live`).
