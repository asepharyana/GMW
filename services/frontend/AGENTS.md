# Bete Frontend — Project Overview

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, shadcn/ui, base-ui.

Key points:
- **Server-side rendered (SSR)** — `output: "standalone"` in next.config.ts; pages
  are React Server Components that fetch initial data from the backend at
  render-time, then hydrate interactive client components (no blank-spinner-first-load).
- **Server data layer** at `src/lib/api/server.ts` — server-only fetchers that
  call the backend directly via `GMW_BACKEND_URL` (default `http://127.0.0.1:4001`).
  Never import from a client component.
- **API client** at `src/lib/api/client.ts` — browser-side fetch for live ops,
  same-origin through the reverse proxy.
- **WebSocket** at `src/lib/ws/` — auto-reconnecting client with typed event
  subscriptions. Realtime state (voice, media, messages) stays client-side.
- **Shared realtime state is server-authoritative**: the backend aggregates the
  gateway's `voice_active_user` deltas into a live speaker snapshot
  (`GET /api/voice/status` → `activeSpeakers`, plus WS `voice_state` sent on
  connect). Every browser converges on the same voice state; `useSpeakers`
  seeds from the server snapshot instead of accumulating per-tab.
- **No authentication**: all endpoints are public

## Data flow (match these — do not invent endpoints)

```
Discord → discord-gateway → Redis pub/sub → backend (Express :4001) ←→ Next.js SSR
                                                ↑ REST /api/*        (server: GMW_BACKEND_URL
                                                └ WS /ws (events + PCM binary)  127.0.0.1:4001)
                                                      ↑ browser WS (same-origin /ws)
```

- **Rendering**: `gmw-proxy` nginx (:4009) proxies `/` → Next standalone server
  (:4017, `node .next/standalone/server.js`), and `/api` + `/ws` → backend :4001.
  Public host: `imphnen.asepharyana.my.id` (Caddy reverse proxy → :4009).
- **SSR seed pattern**: each `page.tsx` is a server component that fetches via
  `src/lib/api/server.ts` and passes typed data to a `view.tsx` client
  component; the hooks take `initialData` as SWR `fallbackData`.
- Local dev overrides: `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` for the
  browser; `GMW_BACKEND_URL` for the server.
- **Never hardcode a host** in api/ws clients — same-origin/env or GMW_BACKEND_URL only.

## Backend response shapes that bite

- `GET /api/chat/history` → `{ history: ChatbotHistoryRow[], total }` where
  each row is `{ id, user_id, user_message, bot_response, context, created_at }`.
  Map rows to display messages in `chatbot-context.tsx`.
- `message_deleted` WS payload → `{ id, deleted_at }` (an object, not a string).
- `voice_recording_uploaded` WS payload has **no** `duration_bytes` (REST rows do).
- Dashboard endpoints: `/api/dashboard/stats|users|channels` (+ `/:id` details).
- Channel/guild names live inside `message.metadata` JSON (`channel.channelName`),
  not top-level.
- `GET /api/voice/status` now includes `activeSpeakers` (authoritative shared
  snapshot from `src/modules/voice/live-speaker.ts` on the backend).

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
