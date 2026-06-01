# Frontend Major Refactor — Design Document

**Date:** 2026-06-01
**Scope:** `/mnt/code/bete/frontend/` — React + Vite + Tailwind
**Stack:** React 18, Vite, TailwindCSS, TanStack Query, lucide-react

## Problem Statement

1. `package.json` hilang — project tidak bisa `pnpm install`
2. `App.tsx` 285 baris monolithic (audio, socket, state, layout semua satu file)
3. `useMemo` dipakai untuk side effect (LivePanel:47) — anti-pattern React
4. Shared `ArrayBuffer` bug saat kirim PCM ke WebSocket (App:166)
5. `ws/client.ts` duplikat socket logic dengan `hooks/useDashboardSocket.ts`
6. Async handler tanpa await (MessageCard:88)
7. UI terlihat "jelek" — flat dark theme tanpa depth/visual interest
8. Mobile UX buruk — tab bar di atas, tidak ada sidebar drawer

## Section 1: Arsitektur — Feature-Sliced Directory

```
frontend/
├── index.html
├── package.json                    # [NEW] Lengkap dengan semua deps
├── vite.config.ts
├── tailwind.config.js
├── postcss.config.js
├── tsconfig.json
└── src/
    ├── main.tsx                    # React entry + QueryClient
    ├── styles.css                  # Tailwind + design tokens
    ├── App.tsx                     # Thin shell (~60 baris)
    │
    ├── entities/                   # Domain types
    │   ├── message/types.ts
    │   ├── guild/types.ts
    │   ├── voice/types.ts
    │   ├── media/types.ts
    │   └── ui/types.ts
    │
    ├── shared/                     # Cross-cutting utilities
    │   ├── api/client.ts           # HTTP client + typed endpoints
    │   ├── ws/socket.ts            # WebSocket connection manager
    │   ├── ws/events.ts            # Typed event map + dispatcher
    │   ├── hooks/useAudioPlayback.ts
    │   ├── hooks/useAudioTransmit.ts
    │   ├── hooks/useLocalStorage.ts
    │   └── ui/                     # UI primitives
    │       ├── button.tsx
    │       ├── card.tsx
    │       ├── badge.tsx
    │       ├── input.tsx
    │       ├── select.tsx
    │       ├── tabs.tsx
    │       └── scroll-area.tsx
    │
    ├── features/                   # Feature-specific logic + presentation
    │   ├── live/
    │   │   ├── hooks/useVoiceControl.ts
    │   │   ├── hooks/useMediaControl.ts
    │   │   ├── index.tsx           # LivePanel
    │   │   ├── components/VoiceConnectionCard.tsx
    │   │   ├── components/AudioVisualizer.tsx
    │   │   ├── components/ActiveSpeakers.tsx
    │   │   ├── components/NowPlaying.tsx
    │   │   ├── components/MusicSubPanel.tsx
    │   │   ├── components/ScreenSubPanel.tsx
    │   │   └── components/RecordingsSubPanel.tsx
    │   ├── messages/
    │   │   ├── hooks/useMessages.ts
    │   │   ├── index.tsx           # MessagesPanel
    │   │   ├── components/MessageFeed.tsx
    │   │   ├── components/MessageCard.tsx
    │   │   └── components/ImageGrid.tsx
    │   ├── analytics/
    │   │   ├── hooks/useAnalytics.ts
    │   │   ├── index.tsx           # AnalyticsPanel
    │   │   └── components/         # (charts, tables kept as-is)
    │   └── auth/
    │       └── index.tsx           # AuthOverlay
    │
    └── widgets/                    # Composite layouts
        ├── DashboardLayout.tsx
        ├── Header.tsx
        └── Sidebar.tsx
```

### Key Architectural Decisions

- **`App.tsx`** = hanya layout shell + providers. Semua hooks pindah ke `features/`.
- **Socket** = satu instance di `shared/ws/socket.ts`. Features subscribe via typed event bus.
- **Entities** = pure types, zero logic.
- **Features** = self-contained (hooks + components). Tidak cross-import antar feature.
- **Widgets** = layout compositions (sidebar, header, dashboard shell).

## Section 2: Bug Fixes

| # | Bug | Location | Fix |
|---|-----|----------|-----|
| 1 | `useMemo` untuk async fetch (anti-pattern) | `LivePanel.tsx:47` | Ganti ke `useEffect` + `useCallback` |
| 2 | Shared `ArrayBuffer` dikirim ke WS | `App.tsx:166` | `.slice()` sebelum send |
| 3 | Missing useEffect deps | `App.tsx:187` | Add proper dependency arrays |
| 4 | Unstable keys (`i` sebagai fallback) | `LivePanel.tsx:246` | Gunakan `s.userId ?? 'unknown-${i}'` |
| 5 | Async handler tanpa await | `MessageCard.tsx:88` | `onReanalyze` → `Promise<void>`, di-await |
| 6 | `monitorGuild` recompute tiap render | `App.tsx:65` | Pakai `useMemo` |
| 7 | Socket localStorage tanpa validasi | `useUIState.ts:9` | Schema validation sebelum parse |
| 8 | Duplikat socket (`ws/client.ts` vs `hooks/useDashboardSocket.ts`) | Global | Hapus `ws/client.ts`, satu socket di `shared/ws/socket.ts` |

## Section 3: UI Redesign — Glass-morphism Modern

### Color Tokens

```css
--background: 222 47% 8%;       /* slightly darker */
--foreground: 210 40% 98%;
--card: 222 47% 12% / 0.7;       /* semi-transparent */
--card-border: 222 47% 25% / 0.4;/* translucent border */
--primary: 199 89% 52%;          /* brighter cyan-blue */
--accent: 217 33% 20%;
--muted: 217 33% 20%;
--radius: 0.85rem;
```

### Visual Changes

- **Background**: Gradient mesh (dark → dark-purple → dark) dengan subtle noise overlay
- **Cards**: `backdrop-blur-xl` + semi-transparent bg + subtle glow border
- **Sidebar**: Expandable — icon-only (w-16) ↔ full (w-64) dengan smooth transition
- **Mobile**: Bottom tab bar (bukan top tabs), slide-in sidebar
- **Typography**: Inter tetap, heading scale lebih besar, weight lebih variatif
- **Micro-interactions**: `transition-all duration-200`, hover scale `1.01`, focus rings
- **Audio Visualizer**: CSS animated bars (bukan static levels map)
- **Message cards**: Rounded-xl, subtle shadow, AI badge dengan color coding yang lebih jelas
- **Charts**: Recharts-based (existing), tapi dengan color scheme yang matching theme

### Responsive Breakpoints

| Breakpoint | Layout |
|------------|--------|
| `< 768px` | Bottom tab bar, no sidebar, full-width content |
| `768px–1024px` | Collapsed sidebar (icon-only), full content |
| `> 1024px` | Full sidebar (w-64), spaced content |

## Section 4: Error Handling

- **Error Boundaries**: Setiap feature punya error boundary (existing `AnalyticsErrorBoundary` pattern)
- **API Errors**: Global error toast via `shared/ui/Toast` component
- **Socket Errors**: Auto-reconnect dengan exponential backoff (existing pattern, diperbaiki)
- **Loading States**: Skeleton loaders (bukan text "Loading...") untuk semua data panels

## Section 5: Data Flow

```
Browser → shared/ws/socket.ts → shared/ws/events.ts (dispatch)
                                    ↓
                        features/* subscribe via typed handlers
                                    ↓
                        features/*/hooks/ (React Query / useState)
                                    ↓
                        features/*/components (render)
                                    ↓
                        widgets/ (layout shell)
```

- **REST API**: React Query hooks di `features/*/hooks/`
- **WebSocket Events**: Event bus di `shared/ws/events.ts`, hooks subscribe ke events
- **UI State**: `localStorage` + `shared/ws/socket.ts` sync (existing pattern, dengan validasi)

## Section 6: Testing Strategy

- **Unit**: Hooks testing dengan `@testing-library/react` — socket mocking
- **Integration**: Component render tests untuk panels
- **E2E**: Tidak termasuk scope initial refactor (future enhancement)

## Section 7: Migration Plan

### Phase 1: Foundation
1. `package.json` lengkap
2. `tsconfig.json` + `vite.config.ts` verified
3. `shared/` structure + UI primitives
4. `entities/` types extracted

### Phase 2: Bug Fixes + Hooks Extraction
5. Extract hooks dari `App.tsx` → `features/*/hooks/`
6. Fix semua 8 bugs yang teridentifikasi
7. Single socket instance di `shared/ws/socket.ts`
8. `App.tsx` thin shell

### Phase 3: UI Polish
9. Design tokens baru (glass-morphism)
10. Sidebar redesign (expandable + mobile drawer)
11. Audio visualizer animated
12. Message card redesign
13. Loading skeletons
14. Error boundaries + toast

### Phase 4: Verification
15. `pnpm run typecheck` — zero errors
16. `pnpm run lint` — zero warnings
17. App runs + all 3 tabs functional
18. WebSocket connects + events work
19. Mobile responsive verified
