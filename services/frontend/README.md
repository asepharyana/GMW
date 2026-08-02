# Bete Frontend

Next.js 16 (React 19) dashboard untuk Discord Moderation Watcher.

**Stack:** Next.js 16 (App Router, static export), React 19, TypeScript strict, Tailwind v4, shadcn/ui, base-ui, lucide-react.

## Dev

```bash
bun run dev        # next dev — port 3000
bun run build      # next build — static export ke out/
bun run lint       # Biome check
```

## Architecture

```
src/
├── app/                  # Pages
│   ├── page.tsx          # Redirect ke /dashboard
│   └── dashboard/        # Dashboard layout + tabs
│       ├── layout.tsx    # Sidebar, header, WS provider, chatbot
│       └── page.tsx      # Tab routing (messages/live/dashboard)
├── features/
│   ├── messages/         # Message feed, search, review, detail modal
│   ├── live/             # Voice connection, music player, recordings
│   ├── dashboard/        # Stats, users, channels overview
│   └── chatbot/          # AI chatbot
├── lib/
│   ├── api/              # Fetch-based API client (all BE endpoints)
│   ├── ws/               # WebSocket client + React context
│   └── hooks/            # Shared hooks (config, auth)
└── components/
    └── layout/           # Sidebar, header, mobile tab bar
```

## API

Backend berjalan di port 4001. Frontend mengakses API via `window.location` (same-origin atau proxy).

WebSocket terhubung otomatis ke `/ws` di host yang sama.
