# Backend & Gateway Refactoring — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Clean up ~130 lines of dead/duplicate code, consolidate duplicated database initialization, and simplify the MessageStore layering in discord-gateway.

**Architecture:** Three independent tasks that can be done in any order. Task 1 consolidates database pool/drizzle init into `@bete/shared` so both services use one canonical pattern. Task 2 removes backward-compat function wrappers from `messageStore.ts`. Task 3 deletes dead files and functions.

**Tech Stack:** TypeScript, Node.js, Drizzle ORM, PostgreSQL, pnpm workspace

## Global Constraints

- All imports use `.js` extensions (ESM convention)
- Follow existing code style (Biome, 2-space indent)
- Keep `@bete/shared` as the single source of truth for shared infrastructure
- No package.json changes needed — `@bete/shared` already has `drizzle-orm` and `pg` as dependencies
- Do not change any business logic — only structural refactoring

---

### Task 1: Consolidate Database Initialization into `@bete/shared`

**Files:**
- Create: `packages/shared/src/database/init.ts`
- Modify: `packages/shared/src/database/pool.ts` — add `getPool()` export
- Modify: `packages/shared/src/index.ts` — export new `./database/init.js`
- Modify: `packages/shared/package.json` — add `"./database/init"` export entry
- Modify: `services/backend/src/shared/database/index.ts` — re-export from shared
- Modify: `services/discord-gateway/src/shared/database/drizzle.ts` — re-export from shared
- Delete: (functions migrate, no file deletion here — both local files stay as thin wrappers)

**Interfaces:**
- Produces:
  - `@bete/shared/database/init` exports:
    - `let db: ReturnType<typeof drizzle> | null` (module-level, for getDatabase())
    - `let rawPool: Pool | null` (module-level, for getPool())
    - `initializeDatabase(schema?: Record<string, unknown>): Promise<ReturnType<typeof drizzle>>` — creates pool via `createPoolFromConfig`, wraps with `drizzle()`. Accepts optional schema object (gateway needs it, backend doesn't). Reads config from env/config module internally.
    - `getDatabase(): ReturnType<typeof drizzle>` — throws if not initialized
    - `getPool(): Pool` — returns raw pool for raw SQL queries, throws if not initialized
    - `closeDatabase(): Promise<void>` — closes pool and nullifies references
    - `executeAll(sql: string, params?: unknown[]): Promise<unknown[]>` — raw SQL query, returns all rows
    - `executeGet(sql: string, params?: unknown[]): Promise<unknown>` — raw SQL query, returns first row or null
    - `withDatabaseClient<T>(callback: (client: PoolClient) => Promise<T>): Promise<T>`

- [ ] **Step 1: Create `packages/shared/src/database/init.ts`**

This is the canonical database initialization module. It merges what both services currently do:

```typescript
import { createChildLogger } from "@bete/shared/logger";
import { closePool, createPoolFromConfig } from "@bete/shared/database/pool";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";
import { config } from "../config/index.js";

const logger = createChildLogger("database.init");

let db: ReturnType<typeof drizzle> | null = null;
let rawPool: Pool | null = null;

export async function initializeDatabase(schema?: Record<string, unknown>) {
  if (db !== null) return db;

  const pool = config.DATABASE_URL
    ? createPoolFromConfig({
        url: config.DATABASE_URL,
        min: config.POSTGRES_POOL_MIN,
        max: config.POSTGRES_POOL_MAX,
      })
    : createPoolFromConfig({
        host: config.POSTGRES_HOST,
        port: config.POSTGRES_PORT,
        user: config.POSTGRES_USER,
        password: config.POSTGRES_PASSWORD,
        database: config.POSTGRES_DB,
        min: config.POSTGRES_POOL_MIN,
        max: config.POSTGRES_POOL_MAX,
      });

  rawPool = pool;
  db = drizzle(pool, schema ? { schema } : undefined);

  // Test connection
  try {
    const client = await pool.connect();
    client.release();
    logger.info("Database connection successful");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database");
    throw err;
  }

  return db;
}

export function getDatabase() {
  if (db === null) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export function getPool() {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return rawPool;
}

export async function closeDatabase() {
  if (rawPool !== null) {
    await closePool(rawPool);
  }
  rawPool = null;
  db = null;
  logger.info("Database connection closed");
}

function convertPlaceholdersForPostgres(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function executeAll(sql: string, params?: unknown[]) {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  const query = convertPlaceholdersForPostgres(sql);
  const result = await rawPool.query(query, params || []);
  return result.rows;
}

export async function executeGet(sql: string, params?: unknown[]) {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  const query = convertPlaceholdersForPostgres(sql);
  const result = await rawPool.query(query, params || []);
  return result.rows[0] ?? null;
}

export async function withDatabaseClient<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  const client = await rawPool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
```

**Note:** This uses `config` from `@bete/shared/config`. The backend's config proxies to that already (`services/backend/src/shared/config/index.ts` re-exports from `@bete/shared/config`). The gateway's config at `services/discord-gateway/src/shared/config/config.ts` has the same field names but is its own Zod schema. Since `@bete/shared/config` doesn't have the PostgreSQL pool config fields currently, we need to check what it exports.

Actually — `@bete/shared/config` may not have `POSTGRES_HOST` etc. Let me adjust: the `initializeDatabase` function should accept config values as parameters instead of reading from a shared config.

Revised approach for `packages/shared/src/database/init.ts`:

```typescript
import { createChildLogger } from "@bete/shared/logger";
import { closePool, createPoolFromConfig } from "./pool.js";
import { drizzle } from "drizzle-orm/node-postgres";
import type { Pool, PoolClient } from "pg";

const logger = createChildLogger("database.init");

let db: ReturnType<typeof drizzle> | null = null;
let rawPool: Pool | null = null;

export interface DatabaseConfig {
  DATABASE_URL?: string;
  POSTGRES_HOST?: string;
  POSTGRES_PORT?: number;
  POSTGRES_USER?: string;
  POSTGRES_PASSWORD?: string;
  POSTGRES_DB?: string;
  POSTGRES_POOL_MIN?: number;
  POSTGRES_POOL_MAX?: number;
}

export async function initializeDatabase(
  cfg: DatabaseConfig,
  schema?: Record<string, unknown>,
) {
  if (db !== null) return db;

  const pool = cfg.DATABASE_URL
    ? createPoolFromConfig({
        url: cfg.DATABASE_URL,
        min: cfg.POSTGRES_POOL_MIN,
        max: cfg.POSTGRES_POOL_MAX,
      })
    : createPoolFromConfig({
        host: cfg.POSTGRES_HOST,
        port: cfg.POSTGRES_PORT,
        user: cfg.POSTGRES_USER,
        password: cfg.POSTGRES_PASSWORD,
        database: cfg.POSTGRES_DB,
        min: cfg.POSTGRES_POOL_MIN,
        max: cfg.POSTGRES_POOL_MAX,
      });

  rawPool = pool;
  db = drizzle(pool, schema ? { schema } : undefined);

  try {
    const client = await pool.connect();
    client.release();
    logger.info("Database connection successful");
  } catch (err) {
    logger.error({ err }, "Failed to connect to database");
    throw err;
  }

  return db;
}

export function getDatabase() {
  if (db === null) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return db;
}

export function getPool() {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  return rawPool;
}

export async function closeDatabase() {
  if (rawPool !== null) {
    await closePool(rawPool);
  }
  rawPool = null;
  db = null;
  logger.info("Database connection closed");
}

function convertPlaceholdersForPostgres(sql: string) {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function executeAll(sql: string, params?: unknown[]) {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  const query = convertPlaceholdersForPostgres(sql);
  const result = await rawPool.query(query, params || []);
  return result.rows;
}

export async function executeGet(sql: string, params?: unknown[]) {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  const query = convertPlaceholdersForPostgres(sql);
  const result = await rawPool.query(query, params || []);
  return result.rows[0] ?? null;
}

export async function withDatabaseClient<T>(
  callback: (client: PoolClient) => Promise<T>,
): Promise<T> {
  if (!rawPool) {
    throw new Error("Database not initialized. Call initializeDatabase() first.");
  }
  const client = await rawPool.connect();
  try {
    return await callback(client);
  } finally {
    client.release();
  }
}
```

- [ ] **Step 2: Add export to `packages/shared/src/index.ts`**

```typescript
export * from "./database/init.js";
```

- [ ] **Step 3: Add export to `packages/shared/package.json`**

```json
"./database/init": "./dist/database/init.js",
```

- [ ] **Step 4: Build the shared package to verify it compiles**

```bash
cd /home/code/GMW/packages/shared
pnpm run build
```

- [ ] **Step 5: Rewrite `services/backend/src/shared/database/index.ts`**

Change to a thin wrapper that imports from `@bete/shared/database/init` and passes the backend's config:

```typescript
import { createChildLogger } from "@bete/shared/logger";
import { initializeDatabase as sharedInit, getDatabase as sharedGetDb, getPool as sharedGetPool, closeDatabase as sharedCloseDb } from "@bete/shared/database/init";
import { config } from "../config/index.js";

const logger = createChildLogger("database");

const dbConfig = {
  DATABASE_URL: config.DATABASE_URL,
  POSTGRES_HOST: config.POSTGRES_HOST,
  POSTGRES_PORT: config.POSTGRES_PORT,
  POSTGRES_USER: config.POSTGRES_USER,
  POSTGRES_PASSWORD: config.POSTGRES_PASSWORD,
  POSTGRES_DB: config.POSTGRES_DB,
  POSTGRES_POOL_MIN: config.POSTGRES_POOL_MIN,
  POSTGRES_POOL_MAX: config.POSTGRES_POOL_MAX,
};

export async function initializeDatabase() {
  logger.info("Initializing database");
  return sharedInit(dbConfig);
}

export function getDatabase() {
  return sharedGetDb();
}

export function getPool() {
  return sharedGetPool();
}

export async function closeDatabase() {
  logger.info("Closing database");
  return sharedCloseDb();
}
```

- [ ] **Step 6: Rewrite `services/discord-gateway/src/shared/database/drizzle.ts`**

Change to a thin wrapper:

```typescript
import { createChildLogger } from "@bete/shared/logger";
import { initializeDatabase as sharedInit, getDatabase as sharedGetDb, closeDatabase as sharedCloseDb, executeAll as sharedExecAll, executeGet as sharedExecGet, withDatabaseClient as sharedWithClient } from "@bete/shared/database/init";
import { config } from "../../shared/config/config.js";
import * as schema from "./schema.js";

const logger = createChildLogger("drizzle");

const dbConfig = {
  DATABASE_URL: config.DATABASE_URL,
  POSTGRES_HOST: config.POSTGRES_HOST,
  POSTGRES_PORT: config.POSTGRES_PORT,
  POSTGRES_USER: config.POSTGRES_USER,
  POSTGRES_PASSWORD: config.POSTGRES_PASSWORD,
  POSTGRES_DB: config.POSTGRES_DB,
  POSTGRES_POOL_MIN: config.POSTGRES_POOL_MIN,
  POSTGRES_POOL_MAX: config.POSTGRES_POOL_MAX,
};

export async function initializeDatabase() {
  return sharedInit(dbConfig, schema);
}

export function getDatabase() {
  return sharedGetDb();
}

export { sharedCloseDb as closeDatabase };
export { sharedExecAll as executeAll, sharedExecGet as executeGet, sharedWithClient as withDatabaseClient };
```

- [ ] **Step 7: Run typecheck on all packages to verify**

```bash
cd /home/code/GMW
pnpm run typecheck
```

- [ ] **Step 8: Commit**

```bash
git add packages/shared/src/database/init.ts packages/shared/src/index.ts packages/shared/package.json
git add services/backend/src/shared/database/index.ts services/discord-gateway/src/shared/database/drizzle.ts
git commit -m "refactor: consolidate database initialization into @bete/shared/database/init"
```

---

### Task 2: Remove Backward-Compat Function Wrappers from MessageStore

**Files:**
- Modify: `services/discord-gateway/src/modules/message-capture/messageStore.ts` — remove lines 310-398 (backward-compat wrappers), export singleton directly
- Modify: `services/discord-gateway/src/modules/message-capture/index.ts` — update re-exports to use `messageStore` singleton
- Modify: `services/discord-gateway/src/modules/message-capture/messageCapture.ts` — update imports to use `messageStore.methodName()`
- Modify: `services/discord-gateway/src/modules/ai-moderation/batchProcessor.ts` — update imports
- Modify: `services/discord-gateway/src/modules/ai-moderation/batchScheduler.ts` — update imports
- Modify: `services/discord-gateway/src/modules/ai-moderation/individualFallbackProcessor.ts` — update imports
- Modify: `services/discord-gateway/src/modules/ai-moderation/moderationBuilders.ts` — update imports
- Modify: `services/discord-gateway/src/modules/ai-moderation/aiAnalysisWorker.ts` — update imports (uses `getConversationContextBefore` and `updateMessagesAIAnalysisBulk`)
- Modify: `services/discord-gateway/src/modules/ai-moderation/aiAnalyzer.ts` — update imports (uses many functions)
- Possibly modify: other files that import the wrapper functions

**Interfaces:**
- Consumes: Existing `MessageStore` class methods (unchanged signatures)
- Produces: Singleton `messageStore` instance as the single export point

The key insight: the backward-compat wrappers at lines 310-398 of `messageStore.ts` are function-level exports that delegate to `getInstance()`. Every importer can instead import the singleton `messageStore` instance and call methods on it directly.

Current importers of wrapper functions:

| File | Functions Used |
|------|---------------|
| `messageCapture.ts` | `getMessageById`, `insertMessageEdit`, `updateMessageAsEdited`, `updateMessageAsDeleted`, `upsertMessageForCapture` |
| `batchProcessor.ts` | `updateMessagesAIAnalysisBulk` |
| `batchScheduler.ts` | `getPendingMessagesByConversation` |
| `individualFallbackProcessor.ts` | `updateMessagesAIAnalysisBulk` |
| `moderationBuilders.ts` | `getMessageById` |
| `aiAnalysisWorker.ts` | `getConversationContextBefore`, `updateMessagesAIAnalysisBulk` |
| `aiAnalyzer.ts` | `getConversationKeysWithIncompleteAnalysis`, `getIncompleteMessagesByConversation`, `getMessageById`, `getPendingConversationKeys`, `updateMessageAIAnalysis` |

- [ ] **Step 1: Modify `messageStore.ts`** — replace backward-compat wrappers with a singleton export

Replace lines 22-33 (lazy singleton pattern) and lines 310-398 (wrapper functions) with:

```typescript
// ─── Singleton instance ─────────────────────────────────────────────────────

const logger = createChildLogger("message-store");
const database = getDatabase() as unknown as NodePgDatabase<typeof schema>;
export const messageStore = new MessageStore(database, logger);
```

Then remove everything from line 310 onward (the backward-compat function wrappers section).

- [ ] **Step 2: Update `message-capture/index.ts`**

Change the re-exports from individual functions to the `messageStore` singleton:

```typescript
export { messageStore } from "../message-capture/messageStore.js";
export {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
} from "../message-capture/messageMetadata.js";
// ... rest unchanged
```

Also remove the individual function re-exports since they no longer exist.

- [ ] **Step 3: Update `messageCapture.ts`**

Change imports from:
```typescript
import {
  getMessageById,
  insertMessageEdit,
  upsertMessageForCapture,
  updateMessageAsDeleted,
  updateMessageAsEdited,
} from "./messageStore.js";
```
To:
```typescript
import { messageStore } from "./messageStore.js";
```

Then update every call site:
- `upsertMessageForCapture(messageRecord)` → `messageStore.upsertMessageForCapture(messageRecord)`
- `insertMessageEdit(...)` → `messageStore.insertMessageEdit(...)`
- `updateMessageAsEdited(...)` → `messageStore.updateMessageAsEdited(...)`
- `updateMessageAsDeleted(...)` → `messageStore.updateMessageAsDeleted(...)`
- `getMessageById(...)` → `messageStore.getMessageById(...)`

- [ ] **Step 4: Update `batchProcessor.ts`**

Change from:
```typescript
import { updateMessagesAIAnalysisBulk } from "../message-capture/messageStore.js";
```
To:
```typescript
import { messageStore } from "../message-capture/messageStore.js";
```

Then update call sites:
- `updateMessagesAIAnalysisBulk(updates)` → `messageStore.messages.updateMessagesAIAnalysisBulk(updates)`

Wait — `updateMessagesAIAnalysisBulk` is actually defined in `MessagesAnalysis` class, which is called via `MessageStore` → `MessagesDb` → `MessagesAnalysis`. Let me check the actual delegation chain.

Looking at the wrapper functions:
```typescript
export const updateMessagesAIAnalysisBulk = (
  updates: Array<{ messageId: string; result: AIAnalysisUpdate }>,
): Promise<MessageRecord[]> =>
  getInstance().updateMessagesAIAnalysisBulk(updates);
```

And in the class:
```typescript
class MessageStore {
  readonly messages: MessagesDb;
  // ...
}

class MessagesDb {
  readonly analysis: MessagesAnalysis;
  // ...
  updateMessagesAIAnalysisBulk(...) {
    return this.analysis.updateMessagesAIAnalysisBulk(...)
  }
}
```

So the call chain is: `messageStore.messages.updateMessagesAIAnalysisBulk()`. But actually, looking at `MessagesDb`, it might have its own `updateMessagesAIAnalysisBulk` that delegates to `this.analysis.updateMessagesAIAnalysisBulk()`. Let me verify...

Actually, for simplicity and to minimize changes, let me look at whether `MessagesDb` has `updateMessagesAIAnalysisBulk` or if only the wrapper has it.

Let me check:

Actually I already read that `MessagesDb` has methods. Let me look at what methods `MessagesDb` exposes vs the wrapper functions.

Instead of guessing, the safe approach is to keep the thin function wrappers but simplify them. Actually, a better approach for this task:

**Revised approach:** Instead of making all importers use `messageStore.messages.analysis.methodName()`, add all the forwarded methods directly to the `MessageStore` class (which it already does for most), and just have external files import the singleton and call `messageStore.methodName()`.

Let me check what methods `MessageStore` already has vs what's only available as backward-compat wrappers:

Looking at the code:
- `insertMessageEdit` — EXISTS in MessageStore class (line 54)
- `upsertMessageForCapture` — EXISTS in MessageStore class
- `updateMessageAsEdited` — EXISTS in MessageStore class
- `updateMessageAsDeleted` — EXISTS in MessageStore class
- `getMessagesByChannel` — EXISTS in MessageStore class
- `updateMessageAIAnalysis` — EXISTS in MessageStore class
- `updateMessagesAIAnalysisBulk` — EXISTS in MessageStore class
- `getPendingAIAnalysisMessages` — EXISTS in MessageStore class
- `getMessageById` — EXISTS in MessageStore class
- `listMessages` — EXISTS in MessageStore class (delegates to MessagesPagination)
- `listReviewMessages` — EXISTS in MessageStore class (delegates to MessagesPagination)
- `getConversationContextBefore` — EXISTS in MessageStore class
- `getPendingMessagesByConversation` — EXISTS in MessageStore class
- `getPendingConversationKeys` — EXISTS in MessageStore class
- `getConversationKeysWithIncompleteAnalysis` — EXISTS in MessageStore class
- `getIncompleteMessagesByConversation` — EXISTS in MessageStore class

So every function wrapper has a corresponding method on `MessageStore` class. The change is straightforward.

Now, after creating the singleton `messageStore`, all importers just do `messageStore.updateMessagesAIAnalysisBulk(...)` instead of calling the bare function.

But there's one complication: `MessagesDb.updateMessagesAIAnalysisBulk` is actually calling `this.analysis.updateMessagesAIAnalysisBulk()`. Does the `MessageStore` class have its own direct `updateMessagesAIAnalysisBulk`? Let me check the class definition...

Actually, I already saw from the grep output that `MessageStore` class has `updateMessagesAIAnalysisBulk` — the wrapper says `getInstance().updateMessagesAIAnalysisBulk(updates)`, and the class has that method.

OK so the mapping is 1:1 between wrapper functions and MessageStore class methods. This is safe.

- [ ] **Step 5: Update `batchScheduler.ts`**

```typescript
// Before:
import { getPendingMessagesByConversation } from "../message-capture/messageStore.js";
// After:
import { messageStore } from "../message-capture/messageStore.js";
```
And call: `messageStore.getPendingMessagesByConversation(...)`

- [ ] **Step 6: Update `individualFallbackProcessor.ts`**

```typescript
// Before:
import { updateMessagesAIAnalysisBulk } from "../message-capture/messageStore.js";
// After:
import { messageStore } from "../message-capture/messageStore.js";
```
And call: `messageStore.updateMessagesAIAnalysisBulk(...)`

- [ ] **Step 7: Update `moderationBuilders.ts`**

```typescript
// Before:
import { getMessageById } from "../message-capture/messageStore.js";
// After:
import { messageStore } from "../message-capture/messageStore.js";
```
And call: `messageStore.getMessageById(...)`

- [ ] **Step 8: Update `aiAnalysisWorker.ts`**

```typescript
// Before:
import { getConversationContextBefore, updateMessagesAIAnalysisBulk } from "../message-capture/messageStore.js";
// After:
import { messageStore } from "../message-capture/messageStore.js";
```
And update all call sites.

- [ ] **Step 9: Update `aiAnalyzer.ts`**

```typescript
// Before:
import {
  getConversationKeysWithIncompleteAnalysis,
  getIncompleteMessagesByConversation,
  getMessageById,
  getPendingConversationKeys,
  updateMessageAIAnalysis,
} from "../message-capture/messageStore.js";
// After:
import { messageStore } from "../message-capture/messageStore.js";
```
And update all call sites.

- [ ] **Step 10: Update `message-capture/index.ts`**

Remove individual function re-exports, replace with `messageStore`:

```typescript
export { messageStore } from "./messageStore.js";
export {
  getDisplayContent,
  getMessageLocation,
  getMessageMetadata,
} from "./messageMetadata.js";
export type {
  AIRecommendedAction,
  AISeverity,
  AIStatus,
  AttachmentRecord,
  MessageRecord,
  VoiceSegmentRecord,
} from "./types.js";
export type { TextCaptureTarget } from "./messageCapture.js";
export {
  captureMessage,
  registerMessageCapture,
  setEventBroadcaster,
} from "./messageCapture.js";
```

- [ ] **Step 11: Run typecheck**

```bash
cd /home/code/GMW
pnpm run typecheck
```

- [ ] **Step 12: Commit**

```bash
git add services/discord-gateway/src/modules/message-capture/
git add services/discord-gateway/src/modules/ai-moderation/
git commit -m "refactor: remove backward-compat function wrappers from messageStore"
```

---

### Task 3: Remove Dead Code

**Files:**
- Delete: `services/backend/src/modules/response.ts` — empty deprecated file
- Delete: `services/discord-gateway/src/modules/webhook-notifications/webhookNotifier.ts`
- Delete: `services/discord-gateway/src/modules/webhook-notifications/index.ts`
- Delete: `services/discord-gateway/src/modules/webhook-notifications/` (directory)
- Modify: `services/backend/src/ws/server.ts` — remove duplicate `broadcastBinaryToFrontend()` function, keep only `broadcastBinary()`

**Interfaces:**
- None — these are deletions only, no consumer impact

- [ ] **Step 1: Delete `modules/response.ts`**

```bash
rm /home/code/GMW/services/backend/src/modules/response.ts
```

- [ ] **Step 2: Fix `ws/server.ts`** — remove duplicate `broadcastBinaryToFrontend`

In `ws/server.ts`, `broadcastBinaryToFrontend` (line 238) and `broadcastBinary` (line 267) do exactly the same thing. Replace the `broadcastBinaryToFrontend(data)` call on line 147 with a call to `broadcastBinary(data)`, then delete the `broadcastBinaryToFrontend` function.

Edit line 147:
```typescript
// Before:
        broadcastBinaryToFrontend(data);
// After:
        broadcastBinary(data);
```

Remove the `broadcastBinaryToFrontend` function (lines 238-248):
```typescript
  // Remove this entire function:
  function broadcastBinaryToFrontend(data: Buffer) {
    for (const client of frontendClients) {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(data);
        } catch (err) {
          logger.error({ err }, "Failed to send binary to frontend client");
        }
      }
    }
  }
```

- [ ] **Step 3: Check if anything imports `webhook-notifications`**

```bash
grep -rn "webhook-notifications\|webhookNotifier\|triggerWebhook" /home/code/GMW/services/ --include='*.ts' | grep -v "node_modules" | grep -v "services/discord-gateway/src/modules/webhook-notifications/"
```

Expected: empty (confirmed earlier)

- [ ] **Step 4: Delete webhook-notifications module**

```bash
rm -rf /home/code/GMW/services/discord-gateway/src/modules/webhook-notifications/
```

- [ ] **Step 5: Run typecheck to verify no broken imports**

```bash
cd /home/code/GMW
pnpm run typecheck
```

- [ ] **Step 6: Commit**

```bash
git add services/backend/src/modules/response.ts services/backend/src/ws/server.ts
git add services/discord-gateway/src/modules/webhook-notifications/
git commit -m "chore: remove dead code (response.ts, broadcastBinaryToFrontend, webhook-notifications)"
```
