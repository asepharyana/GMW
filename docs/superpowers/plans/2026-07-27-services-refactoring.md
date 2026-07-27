# Services Refactoring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor backend (4.2k lines) and discord-gateway (17.9k lines) for consistency, reduced file sizes, deduplication, and pattern uniformity across 11 phases.

**Architecture:** Phase1-3 target backend unchanged; Phase4-8 split large gateway files; Phase9 deduplicates shared database init; Phase10-11 are minor consolidation. Each phase is independently testable by verifying the service still compiles and runs.

**Tech Stack:** TypeScript (ESM), Express 5, ws, Discord.js selfbot, Drizzle ORM, Redis (ioredis), pino logger, Biome (formatter)

## Global Constraints

- All files use ESM (`.js` extensions in imports)
- Biome formatter handles formatting — run `pnpm run format` after each phase
- TypeScript strict mode — run `pnpm run typecheck` after each phase (for node services)
- Logging uses `createChildLogger(context)` from `@bete/shared/logger`
- Import via barrel files where available
- No logic changes — pure refactoring

---

## Task 1: Fix messages.controller.ts pattern (Phase 1)

**Files:**
- Modify: `services/backend/src/modules/messages/messages.controller.ts`

**Interfaces:**
- Consumes: `asyncHandler` from `../../shared/middlewares/index.js`
- Produces: Same exported handler functions, but using decorator pattern

- [ ] **Step 1: Read current messages.controller.ts**

The file currently uses the convoluted pattern:
```ts
export function handleListMessages(req, res, next) {
  return asyncHandler(async (req, res) => {
    // ...
  })(req, res, next);
}
```

- [ ] **Step 2: Rewrite all handlers to decorator pattern**

Replace every handler to use the clean decorator pattern:

```ts
import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { messageQuerySchema } from "./messages.schema.js";
import { messagesService } from "./messages.service.js";

const logger = createChildLogger("messages.controller");

export const handleListMessages = asyncHandler(async (req: Request, res: Response) => {
  const query = messageQuerySchema.parse(req.query);
  logger.debug({ query }, "Handling list messages request");
  const result = await messagesService.listMessages(query);
  res.json(result);
});

export const handleGetMessagesByChannel = asyncHandler(async (req: Request, res: Response) => {
  const channelId = String(req.params.channelId ?? "");
  if (!channelId) {
    res.status(400).json({ error: "MISSING_CHANNEL_ID" });
    return;
  }
  const query = messageQuerySchema.parse(req.query);
  logger.debug({ channelId, query }, "Handling get messages by channel");
  const result = await messagesService.getMessagesByChannel(channelId, query);
  res.json(result);
});

export const handleGetMessageById = asyncHandler(async (req: Request, res: Response) => {
  const id = String(req.params.id ?? "");
  if (!id) {
    res.status(400).json({ error: "MISSING_ID" });
    return;
  }
  logger.debug({ id }, "Handling get message by ID");
  const result = await messagesService.getMessageById(id);
  res.json(result);
});

export const handleGetImageMessages = asyncHandler(async (req: Request, res: Response) => {
  const guildId = String(req.query.guildId ?? "");
  if (!guildId) {
    res.status(400).json({ error: "MISSING_GUILD_ID" });
    return;
  }
  const limit = Number(req.query.limit) || 50;
  logger.debug({ guildId, limit }, "Handling get image messages");
  const result = await messagesService.getImageMessages(guildId, limit);
  res.json(result);
});

export const handleGetAttachmentsByChannel = asyncHandler(async (req: Request, res: Response) => {
  const channelId = String(req.params.channelId ?? "");
  if (!channelId) {
    res.status(400).json({ error: "MISSING_CHANNEL_ID" });
    return;
  }
  const query = messageQuerySchema.parse(req.query);
  logger.debug({ channelId, query }, "Handling get attachments by channel");
  const result = await messagesService.getAttachmentsByChannel(channelId, query);
  res.json(result);
});
```

NOTE: The old pattern used `requireParam` from middlewares to validate params. The new pattern uses simple string checks with early returns. This is equivalent since `requireParam` threw `ValidationError` which the errorHandler middleware catches — but for these handlers the decorator pattern can't throw synchronously in the handler wrapper; the `asyncHandler` catches async rejects. Early return with explicit error response is cleaner.

- [ ] **Step 3: Verify the module still compiles**

Run: `cd /home/code/GMW && pnpm run typecheck`
Expected: No TypeScript errors

- [ ] **Step 4: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 5: Commit**

```bash
git add services/backend/src/modules/messages/messages.controller.ts
git commit -m "refactor(backend): fix messages.controller.ts to use decorator pattern

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 2: Clean up response.ts usage (Phase 2)

**Files:**
- Modify: `services/backend/src/modules/health/health.controller.ts` (remove `success()` usage, use plain `res.json()`)
- Modify: `services/backend/src/modules/response.ts` (deprecate/remove)

**Interfaces:**
- Consumes: all response-producing route files
- Produces: consistent plain `res.json()` pattern everywhere

- [ ] **Step 1: Check all places that import from response.ts**

Run: `grep -r 'from.*response\.js' services/backend/src/`

- [ ] **Step 2: Remove `success()` usage from health.controller.ts**

Replace:
```ts
import { success } from "../response.js";
// ...
res.status(status).json(success(result));
```
With:
```ts
res.status(status).json({ success: true, data: result });
```

- [ ] **Step 3: Run biome format + typecheck**

Run: `cd /home/code/GMW && pnpm run format && pnpm run typecheck`

- [ ] **Step 4: Commit**

```bash
git add services/backend/src/modules/health/health.controller.ts services/backend/src/modules/response.ts
git commit -m "refactor(backend): remove response.ts helpers, inline health response

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 3: Add ws/ barrel (Phase 3)

**Files:**
- Create: `services/backend/src/ws/index.ts`

- [ ] **Step 1: Create barrel file**

```ts
export { setBroadcastFunctions, clearBroadcastFunctions, broadcastEvent, broadcastBinary } from "./broadcast.js";
export { startRedisBridge, stopRedisBridge } from "./redis-bridge.js";
export { createWebSocketServer, closeWebSocketServer } from "./server.js";
```

- [ ] **Step 2: Run typecheck**

Run: `cd /home/code/GMW && pnpm run typecheck`

- [ ] **Step 3: Commit**

```bash
git add services/backend/src/ws/index.ts
git commit -m "refactor(backend): add ws barrel index

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 4: Split moderationPrompt.ts (Phase 4)

**Files:**
- Create: `services/discord-gateway/src/modules/ai-moderation/prompts/text-analysis.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/prompts/media-analysis.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/prompts/stickers.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/prompts/emojis.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/prompts/system.ts`
- Modify: `services/discord-gateway/src/modules/ai-moderation/moderationPrompt.ts` (become barrel re-export)

- [ ] **Step 1: Read the full moderationPrompt.ts**

Read the file to identify all exports and their dependencies.

- [ ] **Step 2: Create `prompts/system.ts` — system prompt builder + shared helpers**

Move: `buildSystemPrompt` function, `sanitizeAiContent`, `escapeXml`, `buildCustomEmojiVisionPrompt`, any shared helper functions.

- [ ] **Step 3: Create `prompts/text-analysis.ts` — text moderation prompts**

Move: All text-specific prompt strings and builders.

- [ ] **Step 4: Create `prompts/media-analysis.ts` — image/video prompts**

Move: `buildGeneralImageVisionPrompt` and related media prompt builders.

- [ ] **Step 5: Create `prompts/stickers.ts` — sticker prompts**

Move: `buildStickerVisionPrompt`, `buildStickerTextOnlyWarning`.

- [ ] **Step 6: Create `prompts/emojis.ts` — emoji prompts**

Move: `buildCustomEmojiVisionPrompt` if it exists separately.

- [ ] **Step 7: Replace moderationPrompt.ts with barrel re-exports**

```ts
export { buildSystemPrompt, sanitizeAiContent } from "./prompts/system.js";
export { buildGeneralImageVisionPrompt } from "./prompts/media-analysis.js";
export { buildStickerVisionPrompt, buildStickerTextOnlyWarning } from "./prompts/stickers.js";
export { buildCustomEmojiVisionPrompt } from "./prompts/emojis.js";
```

- [ ] **Step 8: Run typecheck**

Run: `cd /home/code/GMW && pnpm run typecheck`
Expected: No errors. Existing importers continue to work via the barrel.

- [ ] **Step 9: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 10: Commit**

```bash
git add services/discord-gateway/src/modules/ai-moderation/prompts/ services/discord-gateway/src/modules/ai-moderation/moderationPrompt.ts
git commit -m "refactor(gateway): split moderationPrompt.ts into domain-specific prompt files

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 5: Split moderationOrchestrator.ts (Phase 5)

**Files:**
- Create: `services/discord-gateway/src/modules/ai-moderation/textBatchProcessor.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/mediaBatchProcessor.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/simpleFallback.ts`
- Modify: `services/discord-gateway/src/modules/ai-moderation/moderationOrchestrator.ts` (extract & re-export)
- Modify: `services/discord-gateway/src/modules/ai-moderation/index.ts` (update exports if needed)

- [ ] **Step 1: Read full moderationOrchestrator.ts**

Map all exports and dependencies.

- [ ] **Step 2: Extract `runTextOnlyBatch` into `textBatchProcessor.ts`**

Move the function and its helper `buildCorrectedFewShotExamples`. Export it.

- [ ] **Step 3: Extract `runMediaBatch` into `mediaBatchProcessor.ts`**

Move the function and all its dependencies. Export it.

- [ ] **Step 4: Extract `runSimpleTextFallback` into `simpleFallback.ts`**

Move the function. Export it.

- [ ] **Step 5: Update moderationOrchestrator.ts**

Replace extracted functions with imports:
```ts
export { runTextOnlyBatch } from "./textBatchProcessor.js";
export { runMediaBatch } from "./mediaBatchProcessor.js";
export { runSimpleTextFallback } from "./simpleFallback.js";
```
Keep the `runModerationAnalysis` entry point function which orchestrates text + media + caching.

- [ ] **Step 6: Run typecheck**

Run: `cd /home/code/GMW && pnpm run typecheck`

- [ ] **Step 7: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 8: Commit**

```bash
git add services/discord-gateway/src/modules/ai-moderation/textBatchProcessor.ts services/discord-gateway/src/modules/ai-moderation/mediaBatchProcessor.ts services/discord-gateway/src/modules/ai-moderation/simpleFallback.ts services/discord-gateway/src/modules/ai-moderation/moderationOrchestrator.ts
git commit -m "refactor(gateway): split moderationOrchestrator into dedicated processors

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 6: Split mediaAnalysisClient.ts (Phase 6)

**Files:**
- Create: `services/discord-gateway/src/modules/ai-moderation/mediaCache.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/mediaDownloader.ts`
- Create: `services/discord-gateway/src/modules/ai-moderation/visionAnalyzer.ts`
- Modify: `services/discord-gateway/src/modules/ai-moderation/mediaAnalysisClient.ts` (become barrel)

- [ ] **Step 1: Read full mediaAnalysisClient.ts**

Map all exports and dependencies across the 826 lines.

- [ ] **Step 2: Extract all cache logic into `mediaCache.ts`**

Move: LRU cache, phash dedup, `getCachedMediaAnalysis`, `setCachedMediaAnalysis`, `computeImagePhash`, `deleteCachedMediaAnalysis`, `acquireMediaAnalysisLock`.

- [ ] **Step 3: Extract all download logic into `mediaDownloader.ts`**

Move: Image download, video download, ffmpeg frame extraction, temporary file handling.

- [ ] **Step 4: Extract vision LLM logic into `visionAnalyzer.ts`**

Move: Vision LLM calls, message preparation for vision, `prepareMediaMessage`.

- [ ] **Step 5: Update mediaAnalysisClient.ts to re-export**

```ts
export { getCachedMediaAnalysis, setCachedMediaAnalysis, computeImagePhash } from "./mediaCache.js";
export { downloadAndExtractFrame } from "./mediaDownloader.js";
export { prepareMediaMessage, hasMediaContent } from "./visionAnalyzer.js";
```

- [ ] **Step 6: Run typecheck**

Run: `cd /home/code/GMW && pnpm run typecheck`

- [ ] **Step 7: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 8: Commit**

```bash
git add services/discord-gateway/src/modules/ai-moderation/mediaCache.ts services/discord-gateway/src/modules/ai-moderation/mediaDownloader.ts services/discord-gateway/src/modules/ai-moderation/visionAnalyzer.ts services/discord-gateway/src/modules/ai-moderation/mediaAnalysisClient.ts
git commit -m "refactor(gateway): split mediaAnalysisClient into cache, downloader, and vision analyzer

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 7: Extract retention cleanup from bootstrap.ts (Phase 7)

**Files:**
- Create: `services/discord-gateway/src/app/retention.ts`
- Modify: `services/discord-gateway/src/app/bootstrap.ts`

- [ ] **Step 1: Create `app/retention.ts`**

Move `deleteExpiredRecords` and `startRetentionCleanup` from `bootstrap.ts`:
```ts
import { createChildLogger } from "@bete/shared/logger";
import { lt, inArray } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import { config } from "../shared/config/config.js";
import { getDatabase } from "../shared/database/drizzle.js";
import * as schema from "../shared/database/schema.js";
import { messagesTable, attachmentsTable, voiceRecordingsTable } from "../shared/database/schema.js";

const log = createChildLogger("retention");

// ... move deleteExpiredRecords here ...

// ... move startRetentionCleanup here ...

export { startRetentionCleanup };
```

- [ ] **Step 2: Remove inline retention code from bootstrap.ts**

- Remove the `deleteExpiredRecords` function
- Remove the `startRetentionCleanup` function
- Add: `import { startRetentionCleanup } from "./retention.js";`
- Replace the call: call `startRetentionCleanup()` directly

- [ ] **Step 3: Run typecheck**

Run: `cd /home/code/GMW && pnpm run typecheck`

- [ ] **Step 4: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 5: Commit**

```bash
git add services/discord-gateway/src/app/retention.ts services/discord-gateway/src/app/bootstrap.ts
git commit -m "refactor(gateway): extract retention cleanup from bootstrap into dedicated module

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 8: Consolidate EventBroadcaster (Phase 8)

**Files:**
- Modify: `services/discord-gateway/src/modules/event-broadcaster/eventBroadcaster.ts`
- Modify: `services/discord-gateway/src/modules/event-broadcaster/index.ts`

- [ ] **Step 1: Read current eventBroadcaster.ts**

Identify `RedisEventPublisher` and `EventBroadcaster` classes.

- [ ] **Step 2: Merge RedisEventPublisher into EventBroadcaster**

Inline `RedisEventPublisher` as a private detail inside `EventBroadcaster`. Keep the public API unchanged.

- [ ] **Step 3: Update index.ts if needed**

Ensure the barrel still exports `EventBroadcaster`.

- [ ] **Step 4: Run typecheck**

Run: `cd /home/code/GMW && pnpm run typecheck`

- [ ] **Step 5: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 6: Commit**

```bash
git add services/discord-gateway/src/modules/event-broadcaster/eventBroadcaster.ts services/discord-gateway/src/modules/event-broadcaster/index.ts
git commit -m "refactor(gateway): merge RedisEventPublisher into EventBroadcaster

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 9: Cross-cutting database initialization dedup (Phase 9)

**Files:**
- Modify: `packages/shared/src/database/schema.ts` — add database lifecycle helpers
- Modify: `services/backend/src/shared/database/index.ts` — use shared helpers
- Modify: `services/discord-gateway/src/shared/database/drizzle.ts` — use shared helpers

- [ ] **Step 1: Check current shared database setup**

Read `packages/shared/` structure to see if there's already a database module.

- [ ] **Step 2: Add pool creation helper in @bete/shared**

In `packages/shared/src/database/schema.ts` or create `packages/shared/src/database/pool.ts`:

```ts
import { Pool } from "pg";

export function createPostgresPool(url: string, opts?: { min?: number; max?: number }): Pool {
  return new Pool({
    connectionString: url,
    min: opts?.min ?? 2,
    max: opts?.max ?? 10,
  });
}

export interface PoolConfig {
  host?: string;
  port?: number;
  user?: string;
  password?: string;
  database?: string;
  url?: string;
  min?: number;
  max?: number;
}

export function createPoolFromConfig(cfg: PoolConfig): Pool {
  if (cfg.url) return createPostgresPool(cfg.url, { min: cfg.min, max: cfg.max });
  return new Pool({
    host: cfg.host,
    port: cfg.port,
    user: cfg.user,
    password: cfg.password,
    database: cfg.database,
    min: cfg.min ?? 2,
    max: cfg.max ?? 10,
  });
}
```

Export from `packages/shared/src/database/schema.ts` or create a barrel.

- [ ] **Step 3: Update backend's shared/database/index.ts**

Replace inline Pool creation with `createPoolFromConfig` from `@bete/shared`.

- [ ] **Step 4: Update gateway's shared/database/drizzle.ts**

Replace inline Pool creation with `createPoolFromConfig` from `@bete/shared`.

- [ ] **Step 5: Run typecheck across all services**

Run: `cd /home/code/GMW && pnpm run typecheck`

- [ ] **Step 6: Run biome format**

Run: `cd /home/code/GMW && pnpm run format`

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/database/ services/backend/src/shared/database/index.ts services/discord-gateway/src/shared/database/drizzle.ts
git commit -m "refactor: extract shared database pool creation into @bete/shared

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 10: Audit moderationState vs conversationState overlap (Phase 10)

**Files:**
- Read: `services/discord-gateway/src/modules/ai-moderation/moderationState.ts`
- Read: `services/discord-gateway/src/modules/ai-moderation/conversationState.ts`

- [ ] **Step 1: Read both files and identify overlap**

Look for duplicated state management (maps, sets, timers).

- [ ] **Step 2: If overlap found, merge into one file**

Otherwise, just add comments documenting the boundary.

- [ ] **Step 3: Commit**

```bash
git add services/discord-gateway/src/modules/ai-moderation/
git commit -m "refactor(gateway): consolidate conversattion/moderation state management

Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>"
```

---

## Task 11: Redis connection audit (Phase 11)

**Files:**
- Read: all Redis connection sites in gateway

- [ ] **Step 1: Identify all Redis connections**

Search for `new Redis(` patterns in gateway.

- [ ] **Step 2: Verify each has a valid reason for a separate connection**

Document with comments if needed.

- [ ] **Step 3: Commit (if any changes made)**

