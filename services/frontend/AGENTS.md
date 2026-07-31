# Bete Frontend — Project Overview

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, shadcn/ui, base-ui.

Key points:
- **All pages** are `"use client"` — the dashboard is fully client-rendered
- **API client** at `src/lib/api/` — fetch-based, covers all 30+ backend endpoints
- **WebSocket** at `src/lib/ws/` — auto-reconnecting client with typed event subscriptions
- **Static export**: `output: "export"` in next.config.ts, served via nginx
- **No authentication**: all endpoints are public

## Data flow (match these — do not invent endpoints)

```
Discord → discord-gateway → Redis pub/sub → backend (Express :3001) ←→ frontend
                                                ↑ REST /api/*        (same-origin)
                                                └ WS /ws (events + PCM binary)
```

- **Base URL**: API + WS default to same-origin. `gmw-proxy` nginx (:8080)
  proxies `/api` and `/ws` to the backend on :3001. Public host:
  `imphnen.asepharyana.my.id` (Cloudflare SSL in front of Traefik → :8080).
- Local dev overrides: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL`
  (e.g. https://imphnen.asepharyana.my.id).
- **Never hardcode a host** in api/ws clients — same-origin or env override only.

## Backend response shapes that bite

- `GET /api/chat/history` → `{ history: ChatbotHistoryRow[], total }` where
  each row is `{ id, user_id, user_message, bot_response, context, created_at }`.
  Map rows to display messages in `chatbot-context.tsx`.
- `message_deleted` WS payload → `{ id, deleted_at }` (an object, not a string).
- `voice_recording_uploaded` WS payload has **no** `duration_bytes` (REST rows do).
- Dashboard endpoints: `/api/dashboard/stats|users|channels` (+ `/:id` details).
- Channel/guild names live inside `message.metadata` JSON (`channel.channelName`),
  not top-level.
