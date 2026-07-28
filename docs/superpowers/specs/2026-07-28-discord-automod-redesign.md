---
name: "Discord Automod — Neo Surveillance Redesign"
version: "1.0.0"
date: "2026-07-28"
status: "approved"
inspiration:
  - "Summit Cloud Migration Platform (glassmorphic, dark premium)"
  - "AeroNet Visualization (data panels, modular layout)"
colors:
  canvas: "oklch(0.07 0.015 250)"
  surface: "oklch(0.11 0.02 245 / 0.6)"
  surface-hover: "oklch(0.15 0.02 245 / 0.7)"
  border: "oklch(1 0 0 / 0.06)"
  border-glow: "oklch(0.62 0.17 215 / 0.3)"
  primary: "oklch(0.62 0.17 215)"
  primary-glow: "oklch(0.62 0.17 215 / 0.4)"
  accent-purple: "oklch(0.65 0.2 280)"
  accent-amber: "oklch(0.7 0.17 75)"
  text-primary: "oklch(0.93 0.01 245)"
  text-secondary: "oklch(0.55 0.02 245)"
  text-mono: "oklch(0.62 0.17 215)"
  glass-bg: "oklch(1 0 0 / 0.04)"
  glass-border: "oklch(1 0 0 / 0.08)"
  glass-shadow: "0 8px 32px oklch(0 0 0 / 0.4)"
typography:
  display: "Inter 28-48px weight 600"
  body: "Inter 14-16px weight 400"
  mono: "JetBrains Mono 11-13px weight 500-600"
  data: "JetBrains Mono 24-36px weight 600, teal tint"
radius:
  card: "16px"
  panel: "12px"
  control: "8px"
  pill: "9999px"
---

# Discord Automod — Neo Surveillance Redesign

Full frontend redesign for Discord Automod, a Discord moderation watcher dashboard. Complete rewrite of layout, design system, navigation, and page architecture.

---

## 1. Design Philosophy

**"Neo Surveillance"** — a Security Operations Center (SOC) inspired dashboard where monitoring feels immersive and powerful. Full-screen glass panels float over a dark animated canvas. No persistent sidebar clutter. The interface disappears into the background, letting live data and alerts take center stage.

Key pillars:
- **Immersion** — Full-viewport canvas with ambient motion, glass panels float over content
- **Awareness** — Live data streams, real-time voice waveforms, animated moderation alerts
- **Presence** — Live2D vtuber mascot character as chatbot interface, reacts to server events

---

## 2. Layout & Navigation System

### 2.1 Global Structure

```
┌──────────────────────────────────────────────────────┐
│  ● Discord Automod  Dashboard Msgs Voice …  🟢 ●  │  ← Floating Top Bar (~44px)
├──────────────────────────────────────────────────────┤
│  [Sub-navigation tabs] ← muncul per-page              │
│━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━│
│                                                        │
│   ┌─────────┐  ┌──────────────┐                       │
│   │  Glass   │  │   Content    │                       │
│   │  Panels  │  │   Area       │                       │
│   │          │  │   (scroll)   │                       │
│   └─────────┘  └──────────────┘                       │
│                                                        │
├──────────────────────────────────────────────────────┤
│ 🎵 [Mini-player] ← bottom-left        🎭 [Mascot] ← BR │
└──────────────────────────────────────────────────────┘
```

### 2.2 Floating Top Navigation Bar

- **Style:** Glass (`backdrop-blur-xl`), subtle glow border bottom, `h-11` (44px)
- **Left:** App logo "Discord Automod" with teal live dot indicator + current page name
- **Center:** Horizontal nav links — Dashboard, Messages, Voice, Recordings, Settings
  - Icon + label, active state with glow underline (`box-shadow` teal)
  - Hover: text brighter, no background fill
  - **Search** has no nav link — triggered globally via Cmd+K or `/` shortcut, opens spotlight
- **Right:** Connection status dot (pulse when connected) + theme toggle (sun/moon icon)
- **Hover sidebar hotspot:** Left edge 4px trigger → slide-in sidebar with guild selector, bookmarks, recent channels (auto-hide 300ms after mouse leave)

### 2.3 Sub-navigation

Each page has its own tab bar below the top nav, also glass-styled:
- Dashboard: Stats | Live | Activity
- Messages: All | Images | Review
- Voice: Connection | Activity
- Recordings: Library | Stats
- Settings: Connection | Appearance | Config | About

### 2.4 Hidden Sidebar (Hover-activated)

- Trigger: 4px hotspot at left screen edge
- Slide-in animation (150ms, ease-out-expo)
- Contains: guild selector dropdown, bookmarked channels, recent activity shortcuts
- Auto-hide on mouse leave with 300ms delay

### 2.5 Floating Media Player

- No dedicated Media page — persistent floating mini-player at bottom-left
- Visible only when a track is active
- Click to expand: full queue management overlay
- Controls: play/pause, skip, stop, volume slider, progress bar

---

## 3. Design Tokens

### 3.1 Color Palette

| Token | Value | Usage |
|-------|-------|-------|
| `--canvas` | `oklch(0.07 0.015 250)` | Deep navy background |
| `--surface` | `oklch(0.11 0.02 245 / 0.6)` | Glass card base |
| `--surface-hover` | `oklch(0.15 0.02 245 / 0.7)` | Card hover state |
| `--border` | `oklch(1 0 0 / 0.06)` | Subtle border |
| `--border-glow` | `oklch(0.62 0.17 215 / 0.3)` | Active card border glow |
| `--primary` | `oklch(0.62 0.17 215)` | Teal-cyan accent, buttons |
| `--primary-glow` | `oklch(0.62 0.17 215 / 0.4)` | Active state glow |
| `--accent-purple` | `oklch(0.65 0.2 280)` | Moderation flagged items |
| `--accent-amber` | `oklch(0.7 0.17 75)` | Warnings |
| `--text-primary` | `oklch(0.93 0.01 245)` | Body text |
| `--text-secondary` | `oklch(0.55 0.02 245)` | Secondary labels |
| `--text-mono` | `oklch(0.62 0.17 215)` | Data metrics (teal tint) |
| `--glass-bg` | `oklch(1 0 0 / 0.04)` | Glass base |
| `--glass-border` | `oklch(1 0 0 / 0.08)` | Glass border |
| `--glass-shadow` | `0 8px 32px oklch(0 0 0 / 0.4)` | Glass shadow |

### 3.2 Typography

| Role | Font | Size / Weight |
|------|------|--------------|
| Display | Inter | 28-48px, weight 600 |
| Body | Inter | 14-16px, weight 400 |
| Label / Mono | JetBrains Mono | 11-13px, weight 500-600 |
| Data metrics | JetBrains Mono | 24-36px, weight 600, teal tint |

### 3.3 Radius System

| Token | Value |
|-------|-------|
| Card | 16px |
| Panel | 12px |
| Button / Control | 8px |
| Pill | 9999px |

### 3.4 Motion Tokens

```css
--ease-out-expo: cubic-bezier(0.19, 1, 0.22, 1);
--ease-smooth: cubic-bezier(0.4, 0, 0.2, 1);
--duration-fast: 150ms;
--duration-normal: 250ms;
--duration-slow: 400ms;
```

---

## 4. Component System

### 4.1 Glass Card System

- **Base:** `glass-bg` + `glass-border` + border-radius `16px`
- **Elevated:** Deeper shadow + subtle primary glow border
- **Interactive:** Hover `scale(1.01)` + border glow intensify
- **Danger:** Red-tinted border for critical items
- Inner padding: `20px` (card), `16px` (panel), `12px` (dense)

### 4.2 Button Variants

| Variant | Style |
|---------|-------|
| Primary | `bg-primary` + `shadow-[0_0_12px] shadow-primary/40` (glow) |
| Secondary | `glass-bg` + `border` |
| Ghost | Transparent, hover → subtle glass bg |
| Icon | Size 32px, rounded 8px |
| Danger | Red-tinted variant for destructive actions |

### 4.3 Status Indicators

- **Live dot:** Pulsing ring animation (`pulse-ring` 1.5s)
- **AI Badge:** Teal pill with sparkle icon, mono font
- **Severity badges:** Clean (green), Warn (amber), Flagged (purple), Critical (red)
- **Connection:** Green (connected), Yellow (connecting), Red (disconnected)

### 4.4 Charts (Recharts)

Custom theme matching design tokens:
- Line/Area: gradient fill (primary → transparent)
- Bar: rounded bars, teal-cyan gradient
- Heatmap: activity by hour × weekday
- Radar: multi-axis for moderation categories

### 4.5 Live2D Mascot / Chatbot

- Replaces the existing `Chatbot` component entirely — mascot panel is the new chat interface
- **Location:** Floating panel, bottom-right corner, draggable
- **Default size:** Compact — upper body visible (~200×280px)
- **Click character:** Expand with full chat panel
- **Dynamic expressions:**
  - Idle: subtle breathing, blink every 4s
  - New message: head tilt "listening"
  - Flagged detected: eyes widen, ! bubble
  - User click: happy wave
  - Voice active: ear/head tilt toward audio
  - Chat reply: mouth sync animation
  - Disconnect: sad expression
- **Technology:** Live2D Cubism SDK (WebGL via pixi.js wrapper), `.model3.json` + `.moc3` format
- **Chat panel:** Glass-styled input + message history, context-aware (server context)

### 4.6 Loading States

- **Skeleton:** Glass card shape with shimmer gradient (teal → transparent → teal)
- **Button loading:** Spinner within button
- **Full page:** Glass skeleton grid matching target layout

---

## 5. Page Layouts

### 5.1 Dashboard — "Ops Center"

Full-viewport command center:
- **Stat cards row:** Total Messages, Today, Users, Active 24h, Flagged, Clean — each with micro sparkline chart (Recharts mini area) behind the number
- **Live Message Stream:** Auto-scrolling glass panel showing recent messages, fade-in animation, click for detail
- **Mod Queue:** Flagged messages with quick action buttons (approve/delete/escalate)
- **Message Trend Chart:** 7-day area chart
- **Activity Heatmap:** Hour × day-of-week, moderation event density
- **Top Channels:** Bar chart with channel names
- **Mascot visible** floating bottom-right

### 5.2 Messages — Split Pane

- **Left pane:** Scrollable message list, glass cards with severity badge, channel tag, timestamp
- **Right pane:** Detail/preview — full message content, attachments gallery, AI analysis breakdown (severity, flags, confidence, categories)
- **Global search bar** in top area: spotlight-style overlay (Cmd+K)
- **State in URL params:** `?guild=xxx&channel=yyy&selected=msg123&tab=all`
- **Tabs:** All | Images (grid view) | Review (flagged queue)
- **Actions:** Reanalyze, Moderate (dropdown: delete/warn/escalate)

### 5.3 Voice — Connection Center

- **Connection card:** Guild/channel selectors, status with live dot + duration
- **Active Speakers:** Per-user waveform visualization (canvas-based, 100ms update)
- **Microphone/Transmit:** Toggle mic, volume slider
- **Voice Activity Timeline:** Bar chart showing who spoke and total duration
- **Recordings quick link** to Recordings page

### 5.4 Recordings — Voice Library

- **Search + filter bar:** By user, channel, date range
- **Recording cards:** Glass card, waveform preview (canvas), duration, timestamp
- **Inline playback:** Play button, audio player without leaving page
- **Actions:** Download, Copy Link

### 5.5 Settings

- **Sections:** Connection (WebSocket status, guild info), Appearance (theme toggle), Server Config (read-only), About
- All glass cards, mono font for config values
- Toggle switches with glass styling

---

## 6. Animations & Micro-interactions

### 6.1 Ambient Background
- Gradient mesh with slow-shift (30s cycle)
- 2-3 soft color blobs (teal, purple, amber), opacity 0.03-0.06
- Grid dot pattern: `radial-gradient(circle, oklch(1 0 0 / 0.025) 1px, transparent 1px)`, 24px spacing

### 6.2 Page Transitions
- Route change: `fade-in-up` 200ms ease-out
- Content section: `scale(0.98→1)` + `opacity(0.6→1)`

### 6.3 Card Interactions
- Hover: `scale(1.01)` + border glow intensify + shadow lift
- Click: `scale(0.98)` brief (100ms)
- Panel enter: `translateY(-4px)` + `opacity` fade-in
- Stat counter: count-up animation (JS tween, 400ms)

### 6.4 Live Data
- Message stream: fade-in from top, slide down as new arrive
- Voice waveform: real-time canvas draw, 100ms interval
- Recording: pulsing dot + ring expansion (1.5s loop)
- Connection: slow pulse when connected
- Flagged: brief red/purple border flash on new flagged message

### 6.5 Micro-interactions
- Toggle: slide with glow
- Scrollbar: custom thin (6px), auto-hide, rounded
- Drag handle: subtle dot grip for split pane
- Copy: brief "Copied!" toast
- Reanalyze: 360° icon rotation

---

## 7. Data Flow & State Management

### 7.1 Architecture

```
WS Provider (auto-reconnect, typed events, event buffer)
  ↓
TanStack Query (fetches + cache)
  ↓
Query invalidation on WS events
  ↓
Optimistic cache updates for real-time data
```

### 7.2 WS → Cache Strategy

| WS Event | Action |
|----------|--------|
| `message_created` | Optimistic insert to message list + dashboard stats |
| `message_analyzed` | Update AI fields in message cache |
| `message_deleted` | Remove from cache + update counters |
| `voice_recording_started` | Update voice status |
| `voice_pcm_data` | Buffer to waveform canvas (bypass React) |
| `voice_active_user` | Update speakers cache |
| `analysis_queue_status` | Update queue progress |

### 7.3 Query Config

- `staleTime: 10_000` (10s)
- `gcTime: 5 * 60 * 1000` (5 min)
- `refetchOnWindowFocus: false`

### 7.4 Global State (React Context)

- `useMediaPlayer()` — current track, queue, play/skip/stop/volume
- `useMascot()` — expression, minimized, chatHistory, setExpression
  - Externally triggerable: `mascot.setExpression("surprise")` on flagged message, `("listening")` on voice activity

### 7.5 URL State

Persistent page state via search params (not React state):
```
/messages?guild=xxx&channel=yyy&selected=msg123&tab=all
```

### 7.6 Error Boundaries

Each page has its own error boundary. One page failure doesn't affect others.

---

## 8. Technology Stack

- **Framework:** Next.js 16 (App Router, static export)
- **Language:** TypeScript strict
- **Styling:** Tailwind v4 + CSS custom properties
- **UI Base:** shadcn/ui components (adapted for glass theme)
- **Icons:** lucide-react
- **State/data:** @tanstack/react-query v5
- **Charts:** Recharts 3.8 (with custom theme)
- **3D/Mascot:** Live2D Cubism SDK WebGL (pixi.js wrapper)
- **Audio:** Web Audio API for waveform visualization
- **Animation:** CSS animations + transitions (no GSAP/framer-motion dependency unless specifically needed)

---

## 9. File Structure (New)

```
src/
├── app/
│   ├── layout.tsx                    # Root layout (fonts, theme script, Toaster)
│   ├── page.tsx                      # Redirect → /dashboard
│   ├── globals.css                   # Complete redesign CSS (tokens, glass, animations)
│   └── (dashboard)/
│       ├── layout.tsx                # Dashboard layout (top nav, QueryClient, WS, mascot)
│       ├── dashboard/
│       │   └── page.tsx              # Ops Center
│       ├── messages/
│       │   └── page.tsx              # Split pane messages
│       ├── voice/
│       │   └── page.tsx              # Voice connection center
│       ├── recordings/
│       │   └── page.tsx              # Recording library
│       └── settings/
│           └── page.tsx              # Settings page
│
├── components/
│   ├── layout/
│   │   ├── top-nav.tsx               # Floating top navigation bar
│   │   ├── sub-nav.tsx               # Per-page sub-navigation tabs
│   │   ├── hidden-sidebar.tsx        # Hover-activated guild sidebar
│   │   └── mobile-nav.tsx           # Mobile bottom nav (updated design)
│   │
│   ├── glass/
│   │   ├── card.tsx                  # Glass card component (base, elevated, interactive)
│   │   ├── panel.tsx                 # Glass panel wrapper
│   │   └── divider.tsx              # Glass-styled separator
│   │
│   ├── dashboard/
│   │   ├── stat-card.tsx             # Stat card with micro sparkline
│   │   ├── live-stream.tsx           # Auto-scrolling message stream
│   │   ├── mod-queue.tsx             # Moderation queue with quick actions
│   │   ├── message-trend-chart.tsx   # 7-day area chart
│   │   ├── activity-heatmap.tsx      # Hour × day heatmap
│   │   └── top-channels-chart.tsx    # Top channels bar chart
│   │
│   ├── messages/
│   │   ├── message-list.tsx          # Left pane — scrollable message list
│   │   ├── message-card.tsx          # Individual message card (redesigned)
│   │   ├── message-detail.tsx        # Right pane — full detail
│   │   ├── attachments-grid.tsx      # Attachments gallery
│   │   ├── ai-analysis-panel.tsx     # AI analysis breakdown
│   │   └── search-overlay.tsx        # Cmd+K search spotlight
│   │
│   ├── voice/
│   │   ├── connection-card.tsx       # Guild/channel selector + status
│   │   ├── speaker-waveform.tsx      # Canvas waveform per speaker
│   │   ├── mic-control.tsx           # Mic toggle + volume
│   │   └── activity-timeline.tsx     # Voice activity bar chart
│   │
│   ├── recordings/
│   │   ├── recording-card.tsx        # Glass card with waveform preview
│   │   └── recording-player.tsx      # Inline audio player
│   │
│   ├── mascot/
│   │   ├── mascot-container.tsx      # Floating L2D container
│   │   ├── mascot-canvas.tsx         # WebGL canvas for L2D rendering
│   │   ├── chat-panel.tsx            # Chat input + history
│   │   └── mascot-context.tsx        # Context provider
│   │
│   ├── media/
│   │   └── mini-player.tsx           # Floating mini media player
│   │
│   ├── shared/
│   │   ├── error-state.tsx           # Error boundary fallback
│   │   ├── loading-skeleton.tsx      # Glass shimmer skeleton
│   │   └── empty-state.tsx           # Empty state illustration
│   │
│   └── ui/                           # shadcn/ui components (adapted to glass)
│       ├── button.tsx, badge.tsx, dialog.tsx, ...
│
├── lib/
│   ├── api/                          # Existing API client (unchanged)
│   ├── ws/
│   │   ├── context.tsx               # WS provider (unchanged)
│   │   └── types.ts                  # WS event types
│   ├── hooks/                        # Existing hooks + new ones
│   │   ├── use-media-player.ts       # Global media state
│   │   ├── use-mascot.ts             # Mascot context hook
│   │   └── use-heatmap.ts           # Heatmap data hook
│   ├── types/                        # Existing types (unchanged)
│   ├── navigation.ts                 # Nav items (updated)
│   └── format.ts                     # Format utilities
```

---

## 10. Implementation Order

### Phase 1 — Foundation
1. Update `globals.css` with new design tokens (colors, glass, radius, typography, animations)
2. Rewrite root `layout.tsx` with theme system
3. Build glass component system (`card.tsx`, `panel.tsx`)
4. Build `top-nav.tsx`, `sub-nav.tsx`, `hidden-sidebar.tsx`
5. Update dashboard layout with new nav

### Phase 2 — Dashboard Ops Center
6. Build `stat-card.tsx` with micro sparkline
7. Build `live-stream.tsx`
8. Build `mod-queue.tsx`
9. Build charts: `message-trend-chart.tsx`, `activity-heatmap.tsx`, `top-channels-chart.tsx`
10. Rewrite dashboard page

### Phase 3 — Messages (Split Pane)
11. Build `message-list.tsx`, `message-card.tsx` (redesigned)
12. Build `message-detail.tsx`, `ai-analysis-panel.tsx`, `attachments-grid.tsx`
13. Build `search-overlay.tsx`
14. Rewrite messages page with split-pane layout

### Phase 4 — Voice, Recordings, Settings
15. Build voice components and rewrite voice page
16. Build recording components and rewrite recordings page
17. Rewrite settings page

### Phase 5 — Floating Elements
18. Build `mini-player.tsx` for media
19. Build mascot components (L2D integration)

---

## 11. Testing

- Visual regression checks per component
- WS integration tests for cache updates
- Responsive breakpoint testing (mobile bottom nav)
- L2D mascot load + expression trigger

---

## 12. Non-Goals (Out of Scope)

- Authentication — remains public
- Backend API changes — only frontend redesign
- Database changes — no schema modifications
- New backend WebSocket events — reuse existing
- L2D model creation — integration only (model file provided separately)
