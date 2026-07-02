# Leptos Rewrite — Frontend Architecture Design

**Date:** 2026-07-03
**Status:** Approved Design

## Overview

Rewrite the React 19 + Vite + Tailwind dashboard (46 source files, ~6k LOC) to a Rust Leptos CSR WASM app. All layers — components, styling, animations, WebSocket, audio, icons — are rewritten in Rust.

## Motivation

- **Performance** — WASM eliminates JS bundle parsing/execution overhead
- **Type Safety** — Rust's type system catches more errors at compile time
- **Bundle Size** — WASM binary smaller than equivalent JS bundle

## Status

The current React frontend (`services/frontend/`) remains in active use. The new Leptos app lives in `services/frontend-leptos/`. No React code is removed until the Leptos version is feature-complete.

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Leptos 0.7 (CSR) | WASM-native reactive framework, signals-based |
| Styling | Plain CSS | No framework dependency, port from existing CSS |
| Animations | CSS keyframes + transitions | Replace all Framer Motion usage |
| Icons | `lucide-leptos` | Direct port of current lucide-react icons |
| HTTP | `gloo-net` | Rust fetch wrapper, works with WASM |
| WS | `web-sys::WebSocket` | Direct binding, no abstraction overhead |
| Audio Viz | Canvas 2D (`web-sys`) | AudioVisualizer, WaveformPlayer |
| Audio Playback | Web Audio API (`web-sys`) | PCM stream playback |
| State | Leptos signals + contexts | No external state library needed |
| Build | `trunk` | Standard WASM builder for Leptos |

## Architecture

```
Leptos App (WASM)
  │
  ├── App Shell (layout, sidebar, header, tabs)
  ├── Messages Panel (feed, cards, search, filters)
  ├── Live Panel (voice, music, screen, recordings, audio viz)
  └── Dashboard Panel (stats, users, channels)

Shared infrastructure:
  ├── WebSocket Context (singleton + per-event channels)
  ├── API Client (fetch wrapper + typed endpoint functions)
  ├── UI Primitives (Button, Card, Badge, Input, Tabs, Toast, etc.)
  └── CSS Design System (custom properties, component classes, animations)
```

### Workspace Structure

```
services/frontend-leptos/
├── Cargo.toml              # workspace root
├── shared-types/           # Rust types (port of @bete/shared)
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── message.rs       # MessageRecord, AttachmentRecord
│       ├── guild.rs         # Guild, Channel
│       ├── voice.rs         # VoiceStatus, ActiveSpeaker
│       ├── media.rs         # MediaItem, MediaState, MediaMode
│       ├── dashboard.rs     # DashboardStats, DashboardUser, DashboardChannel
│       ├── recording.rs     # VoiceRecording
│       └── ui_state.rs      # UIState, AppConfig
├── frontend/
│   ├── Cargo.toml           # Leptos + deps
│   ├── Trunk.toml           # Build config
│   ├── index.html           # Entry point (lang="id", Poppins font)
│   └── src/
│       ├── main.rs          # mount_to_body with panic_hook + logger
│       ├── app.rs           # Root component (providers + auth gate + routing)
│       ├── app.css          # Full CSS design system
│       ├── lib.rs           # Module declarations
│       ├── auth.rs          # AuthOverlay + login logic
│       ├── ws/              # WebSocket context & event system
│       ├── api/             # HTTP client + typed API functions
│       ├── ui/              # Shared UI primitives
│       ├── layout/          # App shell components
│       └── features/
│           ├── messages/    # Message feed, cards, search, filters
│           ├── live/        # Voice, audio, media, recordings
│           └── dashboard/   # Stats, users, channels
├── rust-toolchain.toml      # nightly (required by Leptos CSR)
└── .env                     # API_URL, WS_URL
```

### Component Tree

```
<App>
  <ToastProvider>
    {!authenticated && !is_public → <AuthOverlay />}
    <DashboardLayout>
      <ParticleBackground />
      <Sidebar>
        <NavLinks> Messages | Live | Dashboard </NavLinks>
        <MascotImage on:click → toggle MascotChatbot />
      </Sidebar>
      <Header>
        <Logo />
        <ConnectionIndicator />
        <ThemeToggle />
      </Header>
      <TabStrip />
      {active_tab == "messages" → <MessagesPanel />}
      {active_tab == "live"     → <LivePanel />}
      {active_tab == "dashboard" → <DashboardPanel />}
    </DashboardLayout>
    <MascotChatbot />
  </ToastProvider>
</App>
```

### State Architecture

**Contexts** (provided at `<App>` level via `provide_context`):

| Context | Key Signals | Persisted |
|---------|-------------|-----------|
| AuthContext | `authenticated: ReadSignal<bool>` | sessionStorage |
| WsContext | `status: ReadSignal<WsStatus>`, per-event channels | — |
| UiContext | `active_tab: RwSignal<Tab>`, `selected_guild: RwSignal<Option<String>>`, etc. | localStorage |

**Data fetching** via Leptos `Resource` (parallel to React useEffect + fetch, with built-in loading/error/ok states).

**WebSocket events** dispatched through per-event-type `mpsc::UnboundedReceiver` channels. Components subscribe to relevant channels via `watch!` or `create_effect`.

## State Machine: Tab Navigation

```
[messages] ←── [live] ←──→ [dashboard]
     |                       ↑
     └─── (unauth redirect) ──┘
```

- Default: "messages"
- Unauthenticated on "live" → redirect to "messages" (same as current behavior)
- Tab state persisted via localStorage

## Data Flow

### Message Capture → Display
```
Discord → gateway → Redis → backend → WS → ws::socket receive
  → parse JSON → match event type → WsContext.on_message_created.send(data)
  → watch! { set_messages.update(|msgs| merge(msgs, data)) }
  → UI re-renders via Leptos reactivity
```

### Voice PCM → Audio Playback
```
Discord → gateway → Redis → backend → WS binary frame
  → ws::socket onbinary → parse [u32be userId][i16 samples]
  → WsContext.on_voice_pcm.send(packet)
  → use_audio_playback → AudioContext.decodeAudioData → play via AudioBufferSourceNode
  → AudioVisualizer: CanvasRenderingContext2D draw 32 bars on requestAnimationFrame
```

### User Action → Command
```
Button click → call api::voice_connect(guild_id, channel_id)
  → POST /api/voice/connect
  → backend → Redis (backend:command) → discord-gateway
  → gateway connects → Redis (discord:voice:started)
  → WS event → komponen update status
```

## Phase Breakdown

### Phase 1: Foundation (project scaffold + types + build)
- [ ] Cargo workspace with `shared-types` and `frontend` crates
- [ ] All Rust types (port 1:1 from TypeScript types + `@bete/shared`)
- [ ] `Trunk.toml` + `index.html` + `main.rs` with `mount_to_body`
- [ ] `rust-toolchain.toml` (nightly)
- [ ] `.env` for API/WS URLs
- [ ] Build verification: `trunk serve` produces a blank WASM page

### Phase 2: Skeleton (shell, auth, WS, API, UI primitives)
- [ ] CSS Design System (`app.css`) — custom properties, component classes, keyframes, dark theme
- [ ] `<App>` component with providers
- [ ] AuthOverlay + login flow
- [ ] WebSocket singleton (connect, reconnect with exponential backoff, per-event channels)
- [ ] API client (fetch wrapper with auth header, typed endpoint functions)
- [ ] UI primitives: Button (7 variants), Badge (9), Card, Input, Select, Tabs, ScrollArea, Toast, Skeleton, StatusBadge, EmptyState, Modal
- [ ] Layout shell: DashboardLayout, Sidebar, Header, TabStrip, MobileTabBar

### Phase 3: Messages Feature
- [ ] MessagesPanel with AI status filter tabs
- [ ] MessageFeed (infinite scroll via IntersectionObserver)
- [ ] MessageCard with user grouping
- [ ] MessageRow (content, edited/deleted indicators, Discord emoji, stickers, attachments, AI analysis box, severity badge, reanalyze)
- [ ] ImageGrid (masonry grid from attachments/embeds/stickers)
- [ ] ModerationAlertListener → Toast dispatch
- [ ] Search (via `/api/analysis/search`)
- [ ] Reanalyze (single + batch)

### Phase 4: Live Feature
- [ ] VoiceConnectionCard (guild/channel selectors, join/disconnect/listen/transmit)
- [ ] ActiveSpeakers (user list with speaking indicators)
- [ ] AudioVisualizer (Canvas 2D, 32 bars, gradient, ResizeObserver)
- [ ] MicLevelMeter (horizontal bar, 0-100%, green→red scale)
- [ ] NowPlaying (current media + queue)
- [ ] MusicSubPanel (URL input, volume slider, queue/skip/stop)
- [ ] ScreenSubPanel (URL input, start/skip/stop)
- [ ] RecordingsSubPanel (list + pagination + delete + status badges)
- [ ] WaveformPlayer (Canvas 64 bars, AudioContext, play/pause/seek)
- [ ] PCM audio playback (Web Audio API via web-sys)
- [ ] Mic transmit (AudioContext → WebSocket binary frames)

### Phase 5: Dashboard Feature
- [ ] StatsOverview (8 stat cards, top channels, moderation queue)
- [ ] UserSummaryList (search + pagination + grid)
- [ ] UserProfileDetail (stats + recent messages)
- [ ] ChannelSummaryList (search + pagination + grid)
- [ ] ChannelProfileDetail (stats + culture + recent messages)

### Phase 6: Polish
- [ ] ParticleBackground (3 CSS glow orbs)
- [ ] MascotChatbot (floating chat panel, API integration)
- [ ] MascotImage (clickable mascot)
- [ ] Edge cases: WS reconnect, stale data handling, concurrent requests
- [ ] Mobile responsive (< md: sidebar → bottom nav, cards → single column)
- [ ] Loading states + error boundaries + empty states for all panels
- [ ] Theme toggle (dark/light via CSS custom properties)
- [ ] Error animation states (Framer Motion fade/slide ported to CSS keyframes)

## API Client

All existing endpoints mapped to typed Rust functions:

```rust
// pattern
pub async fn get_messages(guild_id: &str, params: &MessageParams) -> Result<PageResult<MessageRecord>, ApiError>;

// All endpoints (20+):
// auth, messages, review, reanalyze, guilds, voice, media, recordings,
// dashboard (stats/users/channels), ui-state, chat, search
```

Full list in `services/frontend/src/shared/api/client.ts` — 1:1 port.

## CSS Design System

### Source: `services/frontend/src/styles.css` (676 lines)

**Port strategy:**
1. CSS custom properties (`:root` / `[data-theme="dark"]`) — port verbatim
2. Component classes (`.im-btn`, `.im-card`, etc.) — rename to `.btn`, `.card` etc., port styling
3. Keyframes — rename from `.im-*` prefix, port verbatim
4. Layout utility classes (`.flex`, `.grid`, `.gap-*`) — keep as utility classes or inline
5. Remove all Tailwind-specific directives

**Component classes to define:**
- `.btn` / `.btn-primary` / `.btn-secondary` / `.btn-ghost` / `.btn-destructive` / `.btn-outline` / `.btn-link` + `.btn-sm` / `.btn-lg` / `.btn-icon`
- `.card` / `.card-elevated` / `.card-bordered` + `.card-header` / `.card-title` / `.card-content` / `.card-footer`
- `.badge` / `.badge-primary` / `.badge-success` / `.badge-warning` / `.badge-destructive` / `.badge-outline`
- `.input` / `.input-soft` + `.input-error`
- `.tabs` / `.tab-list` / `.tab-trigger` / `.tab-content`
- `.skeleton` / `.skeleton-circular` / `.skeleton-rectangular`
- `.toast` / `.toast-success` / `.toast-error` / `.toast-warning`

## WebSocket Protocol (unchanged from current)

- **Binary**: PCM audio `[4-byte userIdHash UInt32LE][Int16 PCM samples @ 24kHz mono]`
- **JSON**: Typed envelope `{ type, data }` — 20+ event types (see `events.md`)

Reconnection: exponential backoff with full jitter (1s base, 30s max, 20 attempts).

## Out of Scope (Phase 1)

- React Native / mobile apps
- PWA / service worker
- E2E testing
- Performance benchmarking
- Bundle size optimization
- Server-side rendering (Leptos SSR mode)
- CI/CD integration

These can be added after the CSR WASM version is stable.

## Dependencies

### Rust crates

| Crate | Version | Purpose |
|-------|---------|---------|
| leptos | 0.7 (csr) | Reactive UI framework |
| leptos-use | latest | `use_local_storage`, `use_interval`, `use_event_listener` etc. |
| lucide-leptos | latest | SVG icons |
| wasm-bindgen | 0.2 | JS/WASM bindings |
| web-sys | 0.3 | Browser API bindings |
| js-sys | 0.3 | JS type bindings |
| gloo-net | 0.6 | HTTP fetch |
| serde | 1 + derive | JSON serialization |
| serde-wasm-bindgen | 0.6 | Serde ↔ JS interop |
| wasm-logger | 0.2 | Logging to console |
| console_error_panic_hook | 0.1 | Debug panic traces |

### web-sys features required

WebSocket, CanvasRenderingContext2d, AudioContext, Window, Document, Element, HtmlElement, KeyboardEvent, Storage, IntersectionObserver, ResizeObserver, Url, Headers, Request, RequestInit, Response, HtmlInputElement, HtmlAudioElement, HtmlCanvasElement, MediaDevices, MediaStream, AudioBuffer, AudioBufferSourceNode

## Migration Notes

- The React app (`services/frontend/`) stays intact until Leptos version is complete
- No shared code between React and Leptos versions — complete rewrite
- Build output: `trunk build` → `dist/` folder, deployable as static files alongside or replacing the current Vite build
- Environment variables: port from `.env` to Rust compile-time config or runtime JS interop
