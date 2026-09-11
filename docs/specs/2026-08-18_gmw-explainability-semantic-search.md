# GMW — Moderation Explainability (#1) + Semantic Search (#3) Implementation Plan

> **For Hermes:** Use subagent-driven-development to implement task-by-task.
> Hard constraint from user (2026-08-18): web is PUBLIC, read-only, for USERS not admins. Moderation MUST stay FULLY AUTOMATIC. Rules stay in CODE (no per-channel config UI).

**Goal:** Make GMW transparent (users see why a message was moderated) and searchable (users can semantic-search the message corpus), via two fully-automatic, code-driven, read-only-public features.

**Architecture:**
- **#1 Explainability:** Persist the structured moderation verdict that already exists in `AnalysisResult` (`flags[]`, `categories[]`, `severity`, `confidence`, `evidence[]`) into new columns on `moderation_actions`, surface them through the existing public moderation oRPC + the existing public `moderation` dashboard view. No new behavior — only new *data* + new *read* paths.
- **#3 Semantic Search:** Add a SECOND persistent Qdrant collection (`gmw_message_archive`) keyed by message id (NOT the TTL cache). Embed each captured text message at capture time (reuse `embedText`) and upsert. Add a public `messages.semanticSearch` oRPC + a read-only search UI on the public `messages` view. Best-effort / non-blocking — embed failures never affect moderation or capture.

**Tech Stack:** TypeScript (discord-gateway + backend + frontend monorepo), Drizzle ORM + Postgres (PgBouncer on imrnes), Qdrant (100.121.180.82:6333), Next.js 16 App Router + shadcn/ui, oRPC over `/trpc`. pnpm. Deploy via GitHub Actions Nix build + `systemctl restart`.

**Critical existing facts (verified in repo):**
- `AnalysisResult` shape (`src/modules/ai-moderation/ai-analysis-worker.ts:55`): `messageId, status, flags[], categories[], severity, confidence, recommendedAction, score, analysis, correctedFlags?`. The shared `AnalysisResult` (`src/shared/moderation-types.ts:142`) ALSO has `evidence?: string[]` and `policyVersion?: string`. **THESE ARE ALREADY COMPUTED but only logged, never persisted to `moderation_actions`.**
- `moderation_actions` schema is DEFINED TWICE with a divergence:
  - `src/shared/database/schema.ts:638` → `pgModerationActionsTable` (authoritative, has `reset_nickname` in `action_type` enum).
  - `src/shared/database/schema/messages.ts:25` → another `pgModerationActionsTable` (NO `reset_nickname`; gateway-local copy).
  - The gateway's `ModerationActionsDb` (`src/modules/message-capture/moderationActionsDb.ts`) imports from `schema.ts` (the authoritative one). The `messages.ts` copy appears UNUSED for DB ops — but WE MUST ADD NEW COLUMNS TO BOTH to avoid type drift, OR confirm the `messages.ts` copy is dead and delete it. **Decision: add columns to `schema.ts` (authoritative) AND the `messages.ts` copy to keep `$inferInsert`/`$inferSelect` in sync (the gateway `ModerationAction` type flows from shared).** Verify with grep that `messages.ts` `pgModerationActionsTable` is not used by any `.insert()`/`.select()` at runtime before relying on it; if only re-exported, we still patch it for type-safety.
- Migration mechanism: Drizzle-managed via `drizzle/migrations/*.sql` (journal `_journal.json`) applied by `runMigrations()` → `migratePostgres`. **New tables/columns must be added with `drizzle-kit generate` to produce a numbered `.sql` + journal entry**, OR (simpler, matches `0013_rename_*.sql` manual style) write a raw idempotent `.sql` under `drizzle/migrations/` AND register it in `_journal.json`. **Preferred here: use `pnpm drizzle-kit generate` so the journal stays consistent.** The legacy `src/shared/database/migrations/001_drop_unused_ai_columns.sql` is a PRE-drizzle manual script — do NOT follow that pattern.
- **Historical lesson (MUST respect):** a prior migration (`0004_drop_unused_ai_columns.sql` = old `001_drop`) DELETED `ai_evidence`, `ai_policy_version`, `ai_moderation_raw` from `messages` with the note "written but never read". → Our new `moderation_actions` columns MUST be read (serializer + FE render). No write-only columns.
- Embedding client: `embedText(text)` / `embedTexts(texts[])` in `src/modules/ai-moderation/embeddingClient.ts`. Returns `null` if `AI_LLM_EMBEDDING_MODEL` not configured. Reuses `config.AI_LLM_BASE_URL` + `config.AI_LLM_API_KEY`. OpenAI SDK v6 → `encoding_format: "float"` REQUIRED (Nvidia rejects base64).
- Qdrant client: `src/modules/ai-moderation/qdrantClient.ts`. Has `ensureQdrantCollection(vectorSize)`, `upsertQdrantPoint(cacheKey, vector, payload)`, `searchQdrant(vector, limit, scoreThreshold)`. These are hardcoded to the cache collection name `config.QDRANT_COLLECTION ?? "gmw_text_moderation"`. **#3 needs a second collection** → generalize the client to accept a collection name param (add `ensureQdrantCollectionV2(name, size)` / `upsertQdrantPointV2(name, id, vector, payload)` / `searchQdrantV2(name, vector, limit, scoreThreshold)` OR refactor `collectionName()` to take an arg). Keep the cache path unchanged.
- Capture hook: `captureMessage()` (`src/modules/message-capture/messageCapture.ts:201`) calls `messageStore.upsertMessageForCapture(messageRecord)` then (if not backlog) `queueMessageAnalysis`. **#3 embed must happen here**, async + fire-and-forget, after successful insert.
- Public moderation view: `services/frontend/src/app/(dashboard)/moderation/view.tsx` renders `ActionRow` per action. The `ModerationAction` FE type is in `services/frontend/src/lib/types/moderation.ts` (NO new fields yet). The backend `moderationService.listActions` SQL is in `services/backend/src/modules/moderation/moderation.repository.ts:68` (raw SQL, selects fixed columns, joins `messages`).
- oRPC wiring: `services/backend/src/orpc/router.ts` → `moderationRouter` (stats, actions) and `messagesRouter` (list, byChannel, getById, review, attachments). New procedures added here.

---

## TASK 1 — Schema: add explainability columns to `moderation_actions`

**Objective:** Persist structured verdict on moderation actions so it can be surfaced (read) later.

**Files:**
- Modify: `services/discord-gateway/src/shared/database/schema.ts` (authoritative `pgModerationActionsTable`, ~line 638)
- Modify: `services/discord-gateway/src/shared/database/schema/messages.ts` (`pgModerationActionsTable` copy, ~line 25) to keep type in sync
- Create: `services/discord-gateway/drizzle/migrations/0015_add_moderation_explainability.sql`
- Update: `services/discord-gateway/drizzle/migrations/meta/_journal.json` (add new entry)

**Step 1: Add columns to both schema definitions**
Add after `executed_at` in BOTH `pgModerationActionsTable` definitions:
```ts
    // ── Explainability (structured verdict, surfaced read-only to public web) ──
    flags: pgText("flags"),            // JSON array of string flags, e.g. ["sara_agama","vulgar"]
    categories: pgText("categories"), // JSON array of category strings
    severity: pgText("severity", {
      enum: ["none", "low", "medium", "high", "critical"],
    }),
    confidence: pgReal("confidence"),  // 0..1
    score: pgReal("score"),            // 0..1 raw model score
    evidence: pgText("evidence"),      // JSON array of short quoted snippets
    policy_version: pgText("policy_version"), // rules.ts policy version string
```
Note: `flags`/`categories`/`evidence` stored as JSON-stringified TEXT (consistent with how `messages.ai_moderation_flags`/`ai_categories` are stored as TEXT elsewhere — confirm storage format in `updateMessageAIAnalysis`). Keep nullable.

**Step 2: Generate/author the migration SQL**
`0015_add_moderation_explainability.sql` (idempotent):
```sql
-- Add structured explainability columns to moderation_actions (read-only surfaced to public web).
ALTER TABLE IF EXISTS "moderation_actions"
  ADD COLUMN IF NOT EXISTS "flags" text,
  ADD COLUMN IF NOT EXISTS "categories" text,
  ADD COLUMN IF NOT EXISTS "severity" text
    CHECK ("severity" IS NULL OR "severity" IN ('none','low','medium','high','critical')),
  ADD COLUMN IF NOT EXISTS "confidence" real,
  ADD COLUMN IF NOT EXISTS "score" real,
  ADD COLUMN IF NOT EXISTS "evidence" text,
  ADD COLUMN IF NOT EXISTS "policy_version" text;
```
Register in `_journal.json`: append an entry with `idx: 15`, a new unique `tag` (hash), `version`, `when` = Date.now(), `tag` short, `breakpoints: false`. Use `pnpm drizzle-kit generate` if possible to get a correct tag; otherwise hand-edit the journal carefully (copy an existing entry's shape).

**Step 3: Type-check gateway**
Run: `cd services/discord-gateway && pnpm typecheck`
Expected: PASS (no new compile errors).

**Step 4: Commit**
```bash
git add services/discord-gateway/src/shared/database/schema.ts \
        services/discord-gateway/src/shared/database/schema/messages.ts \
        services/discord-gateway/drizzle/migrations/0015_add_moderation_explainability.sql \
        services/discord-gateway/drizzle/migrations/meta/_journal.json
git commit -m "feat(db): add explainability columns to moderation_actions"
```

---

## TASK 2 — Persist verdict at the auto-delete + command-handler call sites

**Objective:** Populate the new columns from the already-computed `AnalysisResult` when a moderation action is logged. Fully automatic, no new behavior.

**Files:**
- Modify: `services/discord-gateway/src/modules/ai-moderation/autoDeleteManager.ts` (`logAutoDeleteAttempt` ~line 166, and the second `createModerationAction` call ~line 234 for nickname/mute paths)
- Modify: `services/discord-gateway/src/modules/command-handler/moderation.handler.ts` (`createModerationAction` ~line 95)
- Helper (create): `services/discord-gateway/src/modules/ai-moderation/verdictToActionFields.ts` — shared mapper so all 3 call sites stay DRY.

**Step 1: Create the mapper helper**
`verdictToActionFields.ts`:
```ts
import type { AnalysisResult } from "@/modules/ai-moderation/ai-analysis-worker";
import type { ModerationActionInsert } from "@/shared/index"; // or inline shape

/**
 * Map a computed AI verdict into the explainability columns of a moderation
 * action. Null-safe: missing fields stay null (e.g. manual admin actions have
 * no AnalysisResult). This is read-only structured data — it does NOT change
 * any enforcement decision.
 */
export function verdictToActionFields(result?: {
  flags?: string[];
  categories?: string[];
  severity?: string;
  confidence?: number;
  score?: number;
  evidence?: string[];
  policyVersion?: string;
}): {
  flags: string | null;
  categories: string | null;
  severity: string | null;
  confidence: number | null;
  score: number | null;
  evidence: string | null;
  policy_version: string | null;
} {
  if (!result) {
    return { flags: null, categories: null, severity: null, confidence: null,
             score: null, evidence: null, policy_version: null };
  }
  const j = (v: unknown) => (v == null ? null : JSON.stringify(v));
  return {
    flags: j(result.flags),
    categories: j(result.categories),
    severity: result.severity ?? null,
    confidence: result.confidence ?? null,
    score: result.score ?? null,
    evidence: j(result.evidence),
    policy_version: result.policyVersion ?? null,
  };
}
```

**Step 2: Wire `logAutoDeleteAttempt`**
Find the `createModerationAction({...})` in `logAutoDeleteAttempt` and spread the verdict fields:
```ts
await messageStore.createModerationAction({
  message_id: message.id,
  user_id: message.user_id,
  guild_id: message.guild_id,
  action_type: "delete_message",
  reason: result.reason,
  ...verdictToActionFields(result.analysisResult), // <-- pass the AnalysisResult through
  executed_by: "auto-delete-manager",
  status: ...,
});
```
**IMPORTANT:** `result` here is `AutoDeleteResult` — verify it carries the `AnalysisResult` (or the verdict). If `AutoDeleteResult` does NOT carry the full `AnalysisResult`, trace where `attemptAutoDeleteFlaggedMessage` is called from and pass the `AnalysisResult` down (it is available in the analysis worker that triggered the delete). Confirm by reading `AutoDeleteResult` type + its producer. If the verdict is only available at the orchestrator level, add an optional `verdict?: AnalysisResult` field to `AutoDeleteResult` and populate it at the call site.

**Step 3: Wire the second call site in `autoDeleteManager.ts`** (the mute/nickname path ~line 234) similarly, if it has an `AnalysisResult` available; otherwise leave fields null (manual-style action).

**Step 4: Wire `moderation.handler.ts`** command path (~line 95) — pass `verdictToActionFields(verdict)` if the command handler has the `AnalysisResult` for the target message; otherwise nulls. Confirm what the handler receives.

**Step 5: Type-check + lint**
Run: `cd services/discord-gateway && pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 6: Commit**
```bash
git add services/discord-gateway/src/modules/ai-moderation/verdictToActionFields.ts \
        services/discord-gateway/src/modules/ai-moderation/autoDeleteManager.ts \
        services/discord-gateway/src/modules/command-handler/moderation.handler.ts
git commit -m "feat(mods): persist structured verdict into moderation_actions"
```

---

## TASK 3 — Backend: surface explainability in `moderation.actions`

**Objective:** Read the new columns in the public oRPC so the frontend can render them. (Read path — satisfies the "never write-only" rule.)

**Files:**
- Modify: `services/backend/src/modules/moderation/moderation.repository.ts` (`listActions` raw SQL ~line 68) — add new columns to SELECT + map.
- Modify: `services/frontend/src/lib/types/moderation.ts` (`ModerationAction` interface) — add new fields.
- Modify: `services/frontend/src/app/(dashboard)/moderation/view.tsx` (`ActionRow`) — render flags/categories badges + severity + confidence + evidence snippet.

**Step 1: Extend backend SELECT**
In `listActions`, add to the SELECT list: `a.flags, a.categories, a.severity, a.confidence, a.score, a.evidence, a.policy_version`. In the `.map(...)` add:
```ts
flags: r.flags ? safeJsonArray(String(r.flags)) : null,
categories: r.categories ? safeJsonArray(String(r.categories)) : null,
severity: r.severity ? String(r.severity) : null,
confidence: r.confidence != null ? Number(r.confidence) : null,
score: r.score != null ? Number(r.score) : null,
evidence: r.evidence ? safeJsonArray(String(r.evidence)) : null,
policy_version: r.policy_version ? String(r.policy_version) : null,
```
where `safeJsonArray(s)` = `JSON.parse(s)` wrapped in try/catch returning `[]` on failure (define a tiny local helper in the repository file).

**Step 2: Extend FE type**
In `services/frontend/src/lib/types/moderation.ts` `ModerationAction`:
```ts
  flags: string[] | null;
  categories: string[] | null;
  severity: "none" | "low" | "medium" | "high" | "critical" | null;
  confidence: number | null;
  score: number | null;
  evidence: string[] | null;
  policy_version: string | null;
```

**Step 3: Render in `ActionRow`**
After the existing reason block, add (using existing `Badge` + `aiTone` from `@/lib/ai-status`):
```tsx
{a.severity && (
  <Badge tone={aiTone(a.severity === "none" ? "clean" : a.severity)}>
    {a.severity}
  </Badge>
)}
{a.flags?.length ? (
  <div className="mt-1 flex flex-wrap gap-1">
    {a.flags.map((f) => <Badge key={f} tone="amber">{f}</Badge>)}
  </div>
) : null}
{a.evidence?.length ? (
  <div className="mt-1 text-xs text-ink-faint border-l-2 border-hairline pl-2">
    “{a.evidence[0]}”
  </div>
) : null}
{a.confidence != null && (
  <div className="mono mt-0.5 text-[0.6rem] text-ink-faint">
    conf {(a.confidence * 100).toFixed(0)}%
  </div>
)}
```
Keep `ActionRow` read-only. No admin controls.

**Step 4: Type-check both services**
Run: `cd services/backend && pnpm typecheck && pnpm lint` and `cd services/frontend && pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 5: Commit**
```bash
git add services/backend/src/modules/moderation/moderation.repository.ts \
        services/frontend/src/lib/types/moderation.ts \
        services/frontend/src/app/\(dashboard\)/moderation/view.tsx
git commit -m "feat(web): surface moderation explainability (flags/severity/evidence)"
```

---

## TASK 4 — Qdrant client: support a second persistent collection

**Objective:** Generalize the Qdrant client so #3 can use a dedicated archive collection without disturbing the automod cache.

**Files:**
- Modify: `services/discord-gateway/src/modules/ai-moderation/qdrantClient.ts`

**Step 1: Add collection-aware variants**
Refactor `collectionName()` to accept an optional name, and add V2 functions that take an explicit collection:
```ts
function collectionName(fallback = config.QDRANT_COLLECTION ?? "gmw_text_moderation"): string {
  return fallback;
}
export const ARCHIVE_COLLECTION = config.QDRANT_ARCHIVE_COLLECTION ?? "gmw_message_archive";

export async function ensureQdrantCollectionV2(name: string, vectorSize: number): Promise<boolean> {
  // same body as ensureQdrantCollection but uses `name` instead of collectionName()
}
export async function upsertQdrantPointV2(
  name: string, pointId: number, vector: number[], payload: QdrantVerdictPayload,
): Promise<boolean> { /* PUT /collections/{name}/points with wait:true */ }
export async function searchQdrantV2(
  name: string, vector: number[], limit: number, scoreThreshold: number,
): Promise<QdrantSearchHit[]> { /* POST /collections/{name}/points/search */ }
```
Keep all existing `ensureQdrantCollection` / `upsertQdrantPoint` / `searchQdrant` UNCHANGED (cache path). V2 functions mirror them with the `name` param. Reuse `request()` and the existing payload/score types.

**Step 2: Type-check**
Run: `cd services/discord-gateway && pnpm typecheck`
Expected: PASS.

**Step 3: Commit**
```bash
git add services/discord-gateway/src/modules/ai-moderation/qdrantClient.ts
git commit -m "feat(qdrant): add collection-aware V2 upsert/search for archive"
```

---

## TASK 5 — Capture-time embed + archive upsert

**Objective:** Make every (non-backlog, text) captured message searchable in the persistent archive. Non-blocking / best-effort.

**Files:**
- Modify: `services/discord-gateway/src/modules/message-capture/messageCapture.ts` (`captureMessage` ~line 201)
- Create: `services/discord-gateway/src/modules/message-capture/archiveEmbedder.ts` — wraps embed + upsert with fire-and-forget + rate-limit guard.

**Step 1: Create `archiveEmbedder.ts`**
```ts
import { createChildLogger } from "@/shared/logger/index";
import { embedText } from "@/modules/ai-moderation/embeddingClient";
import { ARCHIVE_COLLECTION, ensureQdrantCollectionV2, upsertQdrantPointV2, qdrantPointId } from "@/modules/ai-moderation/qdrantClient";
import { config } from "@/shared/config/config";

const log = createChildLogger("archive-embedder");

/**
 * Fire-and-forget: embed a captured message and upsert into the persistent
 * archive collection. Failures are swallowed — searching is a nice-to-have,
 * never a precondition for capture or moderation.
 */
export function archiveMessageEmbedded(message: {
  id: string; content: string; username: string; channel_id: string; guild_id: string; created_at: number;
}): void {
  if (!config.AI_LLM_EMBEDDING_MODEL) return; // embeddings disabled → skip
  if (!message.content || message.content.trim().length < 3) return;
  void (async () => {
    try {
      const vector = await embedText(message.content);
      if (!vector) return;
      const ok = await ensureQdrantCollectionV2(ARCHIVE_COLLECTION, vector.length);
      if (!ok) return;
      await upsertQdrantPointV2(ARCHIVE_COLLECTION, qdrantPointId(`archive:${message.id}`), vector, {
        text: message.content.slice(0, 4000),
        flags: "", // not a verdict payload; keep shape compatible
        analyzed_at: Date.now(),
        expires_at: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5, // 5y persistent
        content_hash: undefined,
      });
    } catch (err) {
      log.debug({ messageId: message.id, error: err instanceof Error ? err.message : String(err) }, "archive embed skipped");
    }
  })();
}
```
Payload type reuse: `QdrantVerdictPayload` has `text`, `flags`, `analyzed_at`, `expires_at`, `content_hash?`. For the archive we only need `text` + timestamps; set `flags: ""` (empty, ignored by search filter which keys on `expires_at`). **Acceptable:** the search path filters `expires_at >= now` — 5y window satisfies that.

**Step 2: Call from `captureMessage`**
In `captureMessage`, after `const inserted = await messageStore.upsertMessageForCapture(messageRecord); if (!inserted) return;` and BEFORE the backlog branch, add:
```ts
if (!isBacklog && messageRecord.content) {
  archiveMessageEmbedded(messageRecord);
}
```
(`messageRecord` is the `MessageRecord` from `buildMessageRecord`; confirm it carries `content`, `channel_id`, `guild_id`, `created_at`. It does — see `messagesCrud`/`types`.)

**Step 3: Type-check + lint**
Run: `cd services/discord-gateway && pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 4: Commit**
```bash
git add services/discord-gateway/src/modules/message-capture/archiveEmbedder.ts \
        services/discord-gateway/src/modules/message-capture/messageCapture.ts
git commit -m "feat(archive): embed captured messages into persistent Qdrant archive"
```

---

## TASK 6 — Backend: `messages.semanticSearch` oRPC

**Objective:** Public, read-only semantic search over the message archive.

**Files:**
- Modify: `services/backend/src/modules/messages/messages.repository.ts` — add `semanticSearch(query, limit, guildId?)`.
- Modify: `services/backend/src/modules/messages/messages.service.ts` — expose `semanticSearch`.
- Modify: `services/backend/src/orpc/router.ts` — add `messages.semanticSearch` procedure.
- Create (or reuse): an embedding call from the backend. The backend does NOT import the gateway's `embeddingClient`. **Decision:** add a minimal backend embed helper `services/backend/src/modules/messages/embed.ts` that calls the same OpenAI-compatible endpoint via `config` (reuse `config.AI_LLM_BASE_URL`/`AI_LLM_API_KEY`/`AI_LLM_EMBEDDING_MODEL` if present on the backend; if not configured, return a clear "search unavailable" error). Mirror `encoding_format: "float"`.
- Modify: `services/backend/src/modules/messages/messages.schema.ts` — add `semanticSearchQuery` zod schema (limit, guildId?, query).

**Step 1: Backend embed helper** (`embed.ts`)
```ts
import OpenAI from "openai";
import { config } from "@/shared/config/index";
import { createChildLogger } from "@/shared/logger/index";
const log = createChildLogger("messages-embed");
let client: OpenAI | null = null;
function getClient() {
  if (!config.AI_LLM_API_KEY || !config.AI_LLM_EMBEDDING_MODEL) return null;
  if (!client) client = new OpenAI({ apiKey: config.AI_LLM_API_KEY, baseURL: config.AI_LLM_BASE_URL, maxRetries: 0, timeout: 30_000 });
  return client;
}
export async function embedQuery(text: string): Promise<number[] | null> {
  const c = getClient(); if (!c) return null;
  try {
    const r = await c.embeddings.create({ model: config.AI_LLM_EMBEDDING_MODEL as string, input: text, encoding_format: "float" });
    return r.data[0].embedding;
  } catch (e) { log.warn({ error: e instanceof Error ? e.message : String(e) }, "query embed failed"); return null; }
}
```

**Step 2: Repository `semanticSearch`**
```ts
async semanticSearch(queryVector: number[], limit: number, guildId?: string) {
  // Search archive collection, then join messages for text + channel.
  const hits = await searchQdrantV2(ARCHIVE_COLLECTION, queryVector, limit, 0.6);
  const ids = hits.map(h => h.cacheKey.replace("qdrant:", "")); // point id → we stored archive:<messageId>
  // decode: qdrantPointId is a uint64; we need the original message id.
  // SIMPLER: store message_id inside the payload too. → update archiveEmbedder payload to include `message_id`.
  ...
}
```
**REFINEMENT (important):** `qdrantPointId` is a hash, not reversible. So the archive payload MUST carry `message_id` (and `channel_id`, `guild_id`, `username`, `created_at`) so the backend can return full results without a reverse lookup. **Update `archiveEmbedder.ts` payload** to include those fields, and relax `QdrantVerdictPayload` (or create `QdrantArchivePayload`) to allow them. Then `semanticSearch` returns the payloads directly (already contain text + metadata) — no DB join needed, and it works even for deleted messages (archive keeps the text). Apply `guildId` filter client-side on the returned payloads.

**Step 3: Service + router**
`messages.service.ts`: `async semanticSearch(query: string, limit: number, guildId?: string)` → embed → `repository.semanticSearch`.
`orpc/router.ts` under `messagesRouter`:
```ts
semanticSearch: os
  .input(z.object({ query: z.string().min(1), limit: z.coerce.number().int().positive().max(50).default(10), guildId: z.string().optional() }))
  .handler(async ({ input }) => {
    const results = await messagesService.semanticSearch(input.query, input.limit, input.guildId);
    return { results, nextCursor: null };
  }),
```

**Step 4: Type-check + lint (backend)**
Run: `cd services/backend && pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 5: Commit**
```bash
git add services/backend/src/modules/messages/embed.ts \
        services/backend/src/modules/messages/messages.repository.ts \
        services/backend/src/modules/messages/messages.service.ts \
        services/backend/src/modules/messages/messages.schema.ts \
        services/backend/src/orpc/router.ts
git commit -m "feat(api): public semantic message search over archive"
```

---

## TASK 7 — Frontend: semantic search UI on `messages` view

**Objective:** Public, read-only search box + results on the existing messages dashboard.

**Files:**
- Modify: `services/frontend/src/app/(dashboard)/messages/page.tsx` + `view.tsx` — add a search input (debounced) that calls a new `useMessagesSemanticSearch` hook → `messages.semanticSearch` oRPC, renders results as message cards (reuse `GlassPanel`/`Badge`/existing message row components).
- Modify: `services/frontend/src/lib/types/message.ts` — add `SemanticSearchResult` + `SemanticSearchResponse` types.
- Modify: `services/frontend/src/lib/api/client.ts` (or `server.ts`) — add `semanticSearch` fetcher/routers export if using oRPC client; if the FE uses raw fetch through the proxy, add a `POST /api/messages/semantic-search` or an oRPC client call consistent with existing `messages.*` calls (follow the EXISTING pattern in `src/lib/api/` — inspect how `messages.list` is called and replicate).

**Step 1: Add FE types**
```ts
export interface SemanticSearchResult {
  message_id: string;
  content: string;
  username: string;
  channel_id: string;
  guild_id: string;
  created_at: number;
  score: number;
}
export interface SemanticSearchResponse { results: SemanticSearchResult[]; nextCursor: string | null; }
```

**Step 2: Add hook + wire view**
Follow the existing `use-moderation.ts` SWR pattern. Add `useMessagesSemanticSearch(query, guildId?)` returning `{ data, isLoading, error }`. In `messages/view.tsx`, add a search `Input` (from `@/components/primitives`) at the top, debounce ~300ms, and render results below the live list when a query is present. Reuse the message-row rendering already in that view (do not invent a new component).

**Step 3: Type-check + lint (frontend)**
Run: `cd services/frontend && pnpm typecheck && pnpm lint`
Expected: PASS.

**Step 4: Commit**
```bash
git add services/frontend/src/app/\(dashboard\)/messages/ \
        services/frontend/src/lib/types/message.ts \
        services/frontend/src/lib/api/ \
        services/frontend/src/hooks/
git commit -m "feat(web): public semantic message search UI"
```

---

## TASK 8 — Build all services + deploy + verify

1. `cd services/discord-gateway && pnpm typecheck && pnpm build && pnpm lint`
2. `cd services/backend && pnpm typecheck && pnpm build && pnpm lint`
3. `cd services/frontend && pnpm typecheck && pnpm build && pnpm lint`
4. Commit any formatting fixes (biome `--unsafe` if import order), author `asepharyana`, NO Co-Authored-By.
5. `git push origin main` → watch `gh run watch` on "Build & Deploy (Nix)".
6. After deploy: verify `systemctl show gmw-discord-gateway.service --property=ActiveEnterTimestamp,SubState` reflects new timestamp; same for backend + frontend.
7. Smoke: `curl -s http://127.0.0.1:4001/trpc/messages.semanticSearch?input=<urlencoded json>` OR via the public web `imphnen.asepharyana.my.id` messages page → type a query → expect results (after some messages have been embedded; embeddings only run on NEW captures post-deploy, so seed a few test messages or backfill).
8. Moderation explainability: trigger/observe a flagged message → confirm `moderation_actions.flags` is populated (SQL `SELECT flags, severity FROM moderation_actions ORDER BY created_at DESC LIMIT 5;`) and the public moderation view shows badges.

---

## RISKS / TRADEOFFS / OPEN QUESTIONS
- **Embedding cost:** #3 embeds EVERY captured message → more embedding API calls. Mitigated: only text ≥3 chars, fire-and-forget, skip if model unconfigured. If cost is a concern, batch embed (reuse `embedTexts`) per capture burst — but start simple (per-message) and observe.
- **Backfill:** post-deploy, the archive is empty until new messages arrive. Optional follow-up: a one-off backfill script over existing `messages` (out of scope for this plan unless user asks).
- **Schema duplication:** the `pgModerationActionsTable` double-definition must stay in sync (Task 1 patches both). If `messages.ts` copy is provably dead, a follow-up can delete it — but NOT in this plan (avoid scope creep / risk).
- **`AutoDeleteResult` verdict availability (Task 2):** requires confirming the `AnalysisResult` is reachable at the `createModerationAction` call sites. If not, we add an optional field to `AutoDeleteResult` at the orchestrator call site. This is the highest-risk integration point — verify before assuming.
- **Public exposure:** semantic search returns message text + usernames. This is INTENDED (web is public for users). No auth added. If a guild wants private, that is a future config (out of scope).
- **Qdrant payload type:** reusing `QdrantVerdictPayload` for archive is slightly awkward (carries `flags`/`expires_at` semantics). Cleaner: introduce `QdrantArchivePayload` with `message_id`, `channel_id`, `guild_id`, `username`, `content`, `created_at`, `expires_at`. **Prefer the dedicated payload type in Task 4/5** to avoid confusion.

## VERIFICATION CHECKLIST
- [ ] `moderation_actions` has 7 new columns (DB + both schema defs).
- [ ] A real auto-delete populates `flags`/`severity`/`evidence` (verified via SQL).
- [ ] Public moderation view renders badges + evidence (manual browser check on imphnen.asepharyana.my.id/moderation).
- [ ] New message capture upserts a point into `gmw_message_archive` (verify via Qdrant `/collections/gmw_message_archive/points/count`).
- [ ] `messages.semanticSearch` returns relevant results for a known phrase.
- [ ] All three services: typecheck + build + lint green; CI "Build & Deploy (Nix)" green; systemd timestamps updated.
