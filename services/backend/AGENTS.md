# Backend Service — Agent Guide

> **Read `../../AGENTS.md` first.** This file adds backend-specific conventions.

Backend service: Express HTTP server + WebSocket, serves the GMW dashboard API.

## Quick reference

```bash
pnpm typecheck              # tsc --noEmit
pnpm lint                   # biome check --diagnostic-level=error .
pnpm build                  # tsc
pnpm test                   # vitest run
pnpm format                 # biome format --write .
```

## Architecture (Modular MVC)

```
src/
├── shared/                          # Infrastructure (no business logic)
│   ├── config/index.ts              # Zod-validated env
│   ├── database/                    # Drizzle ORM + pg Pool
│   ├── errors/index.ts              # AppError hierarchy
│   ├── logger/index.ts              # pino + createChildLogger()
│   ├── middlewares/index.ts         # errorHandler, asyncHandler, rateLimit
│   └── utils/                       # Pagination, messageMapper
├── modules/                         # Feature modules
│   └── <module>/
│       ├── <module>.schema.ts       # Zod validation schemas
│       ├── <module>.repository.ts   # DB operations only
│       ├── <module>.service.ts      # Business logic
│       ├── <module>.controller.ts   # HTTP handlers
│       └── routes/index.ts          # Express router
├── http/                            # app.ts (factory) + server.ts (startup)
├── ws/                              # WebSocket server + Redis bridge
└── index.ts                         # Entry point
```

## Dependency rules

- Controller → Service → Repository → Database
- No cross-module repo imports (each module owns its data)
- No HTTP in Service layer (no req/res)
- No DB in Controller layer
- Any layer → Config, Logger, Errors

## API: oRPC + Express

- **oRPC** (`src/orpc/router.ts` + `src/orpc/ws.ts`): type-safe procedures for frontend
- **Express routes** (`src/modules/*/routes/`): REST endpoints under `/api/`
- **WebSocket** (`src/ws/`): Redis bridge → broadcast to connected browsers
- Never invent endpoints. Match what the frontend calls (`src/lib/api/`).

## Key modules

| Module | Purpose | DB tables |
|---|---|---|
| messages | Store & query Discord messages | `messages`, `ai_moderations`, `ai_moderation_flags` |
| moderation | Moderation actions & metrics | `ai_moderations`, `moderation_actions` |
| media | Media file management | `media_attachments` |
| voice | Live speakers + recordings | `voice_recordings` |
| recordings | Recordings API | `voice_recordings` |
| dashboard | Stats aggregation | Various (read-only) |
| knowledge | Semantic search | Qdrant vector DB |
| chatbot | AI chatbot with tools | `chatbot_history` |
| health | Health checks + metrics | Various |
| analysis | Text analysis cache | `text_analysis_cache` |
| ui-state | Persist UI preferences | `ui_state` |

## Config (env vars)

All validated via Zod in `shared/config/index.ts`. Key vars:

- `WEBSERVER_PORT` (default 4001)
- `DATABASE_URL` or individual `DATABASE_HOST/PORT/NAME/USER/PASSWORD`
- `REDIS_URL` — for pub/sub with gateway
- `MONITOR_GUILD_ID` — primary Discord guild
- `ADMIN_PASSWORD` — admin endpoints

## Data contract with frontend

The frontend fetches via `src/lib/api/server.ts` (SSR, server-side) and
`src/lib/api/client.ts` (browser, same-origin through proxy).

**Do not change response shapes without updating both sides.** Check
`services/frontend/src/lib/types/` for frontend type definitions.

## Redis channels (inbound from gateway)

```
discord:message:{created,updated,deleted,analyzed}
discord:attachment:{created,uploaded}
discord:voice:{started,stopped,uploaded,active_user,pcm,analyzed}
discord:analysis:queue_status
discord:reaction:{added,removed}
discord:thread:{created,deleted,updated}
discord:channel_topic:updated
discord:presence:updated
discord:guild_member:{added,removed}
```

Canonical names: `src/shared/redis-channels.ts`.

## Testing

- Vitest for unit tests
- Mock database and external services
- Test files: `src/modules/<module>/*.test.ts` or `tests/*.test.ts`
- Run: `pnpm test`

## Common pitfalls

- **oRPC vs REST**: check both routers when adding an endpoint
- **Redis channel mismatch**: gateway publishes → backend subscribes. Channel
  names must match exactly (see `redis-channels.ts` in BOTH services)
- **DB pool**: backend uses one pool (main thread). Gateway has per-piscina-thread pools.
