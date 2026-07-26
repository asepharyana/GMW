# Bete Frontend — Project Overview

Next.js 16 (App Router), React 19, TypeScript strict, Tailwind v4, shadcn/ui, base-ui.

Key points:
- **All pages** are `"use client"` — the dashboard is fully client-rendered
- **API client** at `src/lib/api/` — fetch-based, covers all 30+ backend endpoints
- **WebSocket** at `src/lib/ws/` — auto-reconnecting client with typed event subscriptions
- **Static export**: `output: "export"` in next.config.ts, served via nginx
- **No authentication**: all endpoints are public
