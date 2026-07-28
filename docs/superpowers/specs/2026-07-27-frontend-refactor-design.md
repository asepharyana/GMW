# Frontend Refactor: Cleanup, API Alignment & Rebrand

## Goal
Refactor the frontend (`services/frontend/`) to be cleaner, more maintainable, properly aligned with backend API, and rebranded from "bete/GMW" to "Discord Automod" and from "chatbot" to "chatbot".

## Scope

### A. Code Quality & Structure
1. **Extract inline page components** into dedicated files under `components/<feature>/`
2. **Remove dead code** (`live-stats.tsx`, `useSearch`, `Item`, etc.)
3. **Remove duplicate code** (merge `extractImage`/`extractFirstImage`, consolidate `WsHook` type, consolidate `isActive` functions)
4. **Fix Tailwind v4 dynamic class** (`grid-cols-${columns}`) in `LoadingSkeleton`
5. **Fix navigation icon** (Settings should use `Settings`, not `BarChart3`)

### B. API Layer Separation
- Split `voiceApi` into `voiceApi` + `mediaApi`
- Keep `chatbot.ts` as is (frontend already uses "chatbot" naming)

### C. Data Fetching Consistency
- `GuildSelector` → use `useGuilds` + `useConfig` React Query hooks
- `useVoiceChannels` → convert from manual `useState` to `useQuery`
- Chatbot → convert to `useQuery` + `useMutation` (user approved this)

### D. Rebrand
- **bete/GMW → Discord Automod**: page title, sidebar, settings, comments
- **chatbot → chatbot**: the frontend already uses "chatbot" naming for the component and API module; backend paths (`/api/chatbot/chat`) stay unchanged on frontend since they reference the actual backend path

### E. Dead Code Removal
- Remove `components/landing/` (including `live-stats.tsx`)
- Remove `components/ui/item.tsx` (unused)
- Remove `useSearch` from `use-messages.ts`
- Remove unused shadcn/ui components (verified by grep)

## Target Directory Structure

```
src/
  app/(dashboard)/
    messages/page.tsx        # slim → imports from components/messages/
    dashboard/page.tsx       # slim
    voice/page.tsx           # slim
    media/page.tsx           # slim
    recordings/page.tsx      # slim
    analysis/page.tsx        # slim
    settings/page.tsx        # slim
    layout.tsx               # unchanged
  app/layout.tsx             # update title
  app/page.tsx               # unchanged (redirect)
  
  components/
    messages/
      message-card.tsx          # from inline in messages/page.tsx
      message-detail-view.tsx   # from inline DetailView
      ai-status-badge.tsx       # from inline AiStatusBadge
      images-grid.tsx           # images tab content
      review-list.tsx           # review tab content
    dashboard/
      stats-section.tsx
      users-section.tsx
      user-detail-section.tsx
      channels-section.tsx
      channel-detail-section.tsx
    voice/
      voice-connection-card.tsx
      active-speakers-panel.tsx
      microphone-card.tsx
    media/
      music-player.tsx
    recordings/
      recording-list.tsx
    analysis/
      search-panel.tsx
    shared/                     # existing
    layout/                     # existing
    chatbot/                    # existing
    ui/                         # shadcn — remove unused
    
  hooks/
    use-messages.ts             # cleaned, use shared WsHook type
    use-dashboard.ts
    use-voice.ts                # cleaned
    use-media.ts                # cleaned
    use-recordings.ts           # cleaned
    use-guilds.ts
    use-config.ts
    use-mobile.ts
    index.ts
    
  lib/
    ws-hook.ts                  # NEW: shared WsHook type
    api/
      client.ts
      messages.ts
      voice.ts                  # voice-only
      media.ts                  # NEW: extracted from voiceApi
      dashboard.ts
      recordings.ts
      config.ts
      chatbot.ts
      ui-state.ts
      index.ts
    types/                      # no structural changes, verify alignment
    ws/                         # no structural changes
    format.ts
    navigation.ts
    utils.ts
```

## Key Changes Detail

### 1. Component Extraction
Each page file that has inline components (messages=689 lines, dashboard=570 lines) will have those components extracted into dedicated files. The page file becomes a thin composition layer.

### 2. WsHook Type Consolidation
Three files define `type WsHook = { on: <E>(eventType: E, handler: ...) => () => void }`. This moves to `lib/ws-hook.ts` and all three hooks import it.

### 3. LoadingSkeleton Fix
Replace dynamic `grid-cols-${columns}` with explicit Tailwind classes or inline style:
```tsx
const gridCols = columns === 2 ? "grid-cols-1 md:grid-cols-2" : "grid-cols-1";
```

### 4. API Separation
```typescript
// lib/api/voice.ts — voice + guilds only
export const voiceApi = {
  getGuilds, getTextChannels, getVoiceChannels,
  getStatus, connect, disconnect, sendCommand,
};

// lib/api/media.ts — media player only (NEW)
export const mediaApi = {
  getStatus, queue, skip, stop, volume,
};
```

### 5. Data Fetching Consistency
`GuildSelector` will use `useGuilds()` and `useConfig()` hooks instead of manual fetch in useEffect.
`useVoiceChannels` will use `useQuery` with `enabled: !!guildId`.
Chatbot will use `useQuery` for history and `useMutation` for send.

### 6. Rebrand
- `app/layout.tsx`: title → "Discord Automod"
- Sidebar brand: keep "DC Automod" (already done)
- Settings page: keep "DC Automod" reference
- Comments referencing "bete" → update
- No changes to package names or external references (backend still "bete" internally)

### Non-Goals
- No changes to backend API paths
- No changes to package.json names (pnpm workspace naming)
- No changes to Router/App Router structure
- No changes to CSS/styling system
- No functional changes — visual behavior identical
