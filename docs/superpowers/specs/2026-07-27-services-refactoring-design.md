# Refactoring Backend & Discord-Gateway Services

**Date:** 2026-07-27
**Status:** Draft

## Overview

Comprehensive refactoring of `services/backend` (4.2k lines) and `services/discord-gateway` (17.9k lines) targeting code consistency, file-size reduction, deduplication, and pattern uniformity.

## Scope

### Phase 1 — Backend Controller Consistency

**Problem:** Two competing controller patterns.

- `messages.controller.ts`, `mascot-chat.controller.ts` use convoluted `asyncHandler` inside function body (Gaya A)
- `voice.controller.ts`, `health.controller.ts` use clean `asyncHandler` decorator (Gaya B)

**Fix:** Convert all controllers to **Gaya B** (decorator pattern).

Before (Gaya A):
```ts
export function handleListMessages(req, res, next) {
  return asyncHandler(async (req, res) => {
    // ...
  })(req, res, next);
}
```

After (Gaya B):
```ts
export const handleListMessages = asyncHandler(async (req, res) => {
  // ...
});
```

**Files affected:**
- `modules/messages/messages.controller.ts`
- `modules/mascot-chat/mascot-chat.controller.ts`

### Phase 2 — Backend `response.ts` Cleanup

**Problem:** `success()`/`error()` helpers exist but are unused (except health controller).

**Fix:** Apply `success()` consistently to all API responses that are successful data returns. Remove `error()` if unused after audit.

**Files affected:** All route/service files that `res.json()` data.

### Phase 3 — Backend `ws/` Barrel

**Problem:** `ws/broadcast.ts`, `ws/redis-bridge.ts`, `ws/server.ts` — no barrel.

**Fix:** Add `ws/index.ts` barrel.

### Phase 4 — Gateway: Split `moderationPrompt.ts` (1015 lines)

**Problem:** Monolithic prompt file mixing all prompt types.

**Fix:** Split into:
- `prompts/text-analysis.ts` — Text moderation prompts
- `prompts/media-analysis.ts` — Image/video analysis prompts
- `prompts/stickers.ts` — Sticker analysis prompts
- `prompts/emojis.ts` — Custom emoji prompts
- `prompts/system.ts` — System prompt builder and shared helpers

### Phase 5 — Gateway: Split `moderationOrchestrator.ts` (955 lines)

**Problem:** Entry point that also contains inline text-only batch, media batch, and simple fallback.

**Fix:** Extract into:
- `textBatchProcessor.ts` — All text-only batching logic
- `mediaBatchProcessor.ts` — All media batching logic
- `simpleFallback.ts` — The `runSimpleTextFallback` function

### Phase 6 — Gateway: Split `mediaAnalysisClient.ts` (826 lines)

**Problem:** Cache logic (LRU + phash + DB), download logic (image/video + ffmpeg), and vision LLM in one file.

**Fix:** Extract into:
- `mediaCache.ts` — All caching layers (LRU, phash dedup, DB)
- `mediaDownloader.ts` — Image/video download, ffmpeg frame extraction
- `visionAnalyzer.ts` — Vision LLM orchestration

### Phase 7 — Gateway: Consolidate `bootstrap.ts`

**Problem:** 304-line bootstrap that embeds retention cleanup inline.

**Fix:** Extract `startRetentionCleanup` into `app/retention.ts`. Leave event registrations in bootstrap as they're inherently app-wide wiring.

### Phase 8 — Gateway: Simplify EventBroadcaster

**Problem:** `RedisEventPublisher` wrapping is thin — only adds a `publish` wrapper.

**Fix:** Merge `RedisEventPublisher` into `EventBroadcaster` as a private inner detail.

### Phase 9 — Cross-cutting: Database initialization dedup

**Problem:** Backend (`shared/database/index.ts`) and gateway (`shared/database/drizzle.ts`) have near-identical pool creation and lifecycle code.

**Fix:** Extract common pool/drizzle lifecycle into `@bete/shared`:
```ts
// packages/shared/src/database/index.ts
export function createDatabasePool(url: string, opts?: PoolOpts): Pool
export function createDrizzleClient(pool: Pool): DrizzleClient
export function closePool(pool: Pool): Promise<void>
```
Both services keep their own getDatabase/close wrappers but delegate pool creation to shared.

### Phase 10 — Gateway: Consolidate `moderationState.ts` / `conversationState.ts`

**Problem:** Two state files with overlapping concerns.

**Fix:** Audit both for overlap, merge if significant duplication found.

### Phase 11 — Gateway: Redis connection usage audit

**Problem:** Multiple independent Redis connections for EventBroadcaster and CommandHandler.

**Fix:** Both already need separate connections (Redis pub/sub limits). Document the pattern. No structural change.

## Files Changed

| Phase | Files | Type |
|-------|-------|------|
| 1 | 3 | edit |
| 2 | ~15 | edit |
| 3 | 1 | create |
| 4 | ~6 | split |
| 5 | ~4 | split |
| 6 | ~4 | split |
| 7 | 2 | split |
| 8 | 2 | refactor |
| 9 | 2 | refactor |
| 10 | 1-2 | audit+merge |
