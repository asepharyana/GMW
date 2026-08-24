import { createHash } from "node:crypto";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";
import { findBestEmbeddingMatch } from "./embeddingClient.js";
import {
  deleteQdrantPoint,
  deleteQdrantPointsByContentHash,
  isQdrantConfigured,
  type QdrantVerdictPayload,
  searchQdrant,
  upsertQdrantPoint,
} from "./qdrantClient.js";

const logger = createChildLogger("text-cache-store");

export interface TextCacheEntry {
  text: string;
  flags: string[];
  source: "local" | "primary_ai" | "vision_llm";
  analyzed_at: number;
  expires_at: number;
  hit_count: number;
}

/**
 * Delete expired cache entries. Run periodically to keep the table clean.
 */
export async function pruneExpiredTexts(): Promise<number> {
  try {
    const result = await executeAll(
      `DELETE FROM text_analysis_cache WHERE expires_at < $1`,
      [Date.now()],
    );
    return (result as unknown as { rowCount?: number }).rowCount ?? 0;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to prune expired texts",
    );
    return 0;
  }
}

// ---------------------------------------------------------------------------
// Media / vision analysis cache helpers (reuses text_analysis_cache table)
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic cache key for a sticker.
 * Same sticker name → same key across sessions and servers.
 */
export function makeStickerCacheKey(stickerName: string): string {
  return `sticker:${stickerName}`;
}

/**
 * Generate a deterministic cache key for a custom emoji by its Discord ID.
 */
export function makeCustomEmojiCacheKey(emojiId: string): string {
  return `emoji:${emojiId}`;
}

/**
 * Generate a deterministic cache key for an image from its source URL
 * (Discord CDN / embed URL / inline URL).
 *
 * The CDN URL is the stable identity of an attachment: re-analysis of the
 * same message (recovery worker, retries) always hits the cache regardless
 * of resize/encoding output. Query params are stripped (Discord signed
 * tokens `?ex=&is=&hm=` and render variants `?format=&width=`) so the same
 * attachment resolves to the same key even when fetched with different
 * signatures or sizes.
 *
 * No SHA/phash — the CDN URL is the cache key itself. This makes
 * re-analysis of the SAME attachment cache-hit, while different attachments
 * (different URLs) never collide.
 */
export function makeImageCacheKey(imageUrl: string): string {
  // Hash the URL to a fixed-length key. The raw Discord CDN URL is short,
  // but callers sometimes pass base64 data URLs (can be multi-MB) or very
  // long signed/external URLs. text_analysis_cache.text is the PK and lives
  // in a B-tree index with an 8191-byte per-row limit — inserting a long URL
  // as the key aborts the whole INSERT ("index row requires N bytes, maximum
  // size is 8191"), which fails acquireMediaAnalysisLock and silently skips
  // every media analysis. A 32-char sha256 keeps the key well under the limit
  // and is still deterministic (same attachment → same key).
  const hash = createHash("sha256")
    .update(normalizeDiscordImageUrl(imageUrl))
    .digest("hex")
    .slice(0, 32);
  return `image:${hash}`;
}

/**
 * Strip volatile query params from Discord CDN URLs so the SAME attachment
 * always maps to ONE vision-cache key regardless of how it reached us
 * (signed `?ex=&is=&hm=` tokens rotate per fetch; render variants differ by
 * `format/width/height/size`). Previously each token variant hashed to its
 * own key → the same image was re-downloaded and re-analyzed by the vision
 * model once per variant. Non-Discord URLs and data: URLs are returned
 * untouched (their query can be semantically meaningful).
 */
export function normalizeDiscordImageUrl(imageUrl: string): string {
  try {
    const parsed = new URL(imageUrl);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return imageUrl;
    }
    const host = parsed.hostname;
    const isAttachmentCdn = host === "cdn.discordapp.com";
    const isRenderOrPreview =
      host === "media.discordapp.net" ||
      /^images-ext-\d+\.discordapp\.net$/.test(host);
    if (!isAttachmentCdn && !isRenderOrPreview) return imageUrl;
    if (!parsed.search) return imageUrl;
    // Path IS the stable identity of the attachment; everything after "?" is
    // signing or a render variant.
    return `${parsed.origin}${parsed.pathname}`;
  } catch {
    return imageUrl;
  }
}

/**
 * Lookup a cached media analysis result.
 * Returns the full cached text (the analysis summary string) or null if not found or expired.
 */
export async function getCachedMediaAnalysis(
  cacheKey: string,
): Promise<string | null> {
  try {
    const row = await executeGet(
      `SELECT flags, hit_count
       FROM text_analysis_cache
       WHERE text = $1 AND expires_at > $2 AND source != 'vision_llm_processing'`,
      [cacheKey, Date.now()],
    );

    if (!row) return null;

    // flags stores the analysis result for media entries
    const result = JSON.parse(row.flags) as string;
    return result || null;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get cached media analysis",
    );
    return null;
  }
}

/**
 * Store a media analysis result in the cache.
 */
export async function upsertCachedMediaAnalysis(
  cacheKey: string,
  analysisResult: string,
  source: "vision_llm",
  expiresAt: number,
): Promise<void> {
  const now = Date.now();

  try {
    await executeAll(
      `INSERT INTO text_analysis_cache (text, flags, source, analyzed_at, expires_at, hit_count)
       VALUES ($1, $2, $3, $4, $5, 0)
       ON CONFLICT (text) DO UPDATE SET
         flags = EXCLUDED.flags,
         source = EXCLUDED.source,
         analyzed_at = EXCLUDED.analyzed_at,
         expires_at = EXCLUDED.expires_at`,
      [cacheKey, JSON.stringify(analysisResult), source, now, expiresAt],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to upsert cached media analysis",
    );
  }
}

export async function acquireMediaAnalysisLock(
  cacheKey: string,
  expiresAt: number,
): Promise<boolean> {
  try {
    const rows = await executeAll(
      `INSERT INTO text_analysis_cache (text, flags, source, analyzed_at, expires_at, hit_count)
       VALUES ($1, $2, $3, $4, $5, 0)
       ON CONFLICT (text) DO UPDATE SET
         flags = EXCLUDED.flags,
         source = EXCLUDED.source,
         analyzed_at = EXCLUDED.analyzed_at,
         expires_at = EXCLUDED.expires_at
       WHERE text_analysis_cache.expires_at < $4
       RETURNING text`,
      [cacheKey, '""', "vision_llm_processing", Date.now(), expiresAt],
    );
    return Array.isArray(rows) && rows.length > 0;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to acquire media analysis lock",
    );
    return false;
  }
}

export async function deleteCachedMediaAnalysis(
  cacheKey: string,
): Promise<void> {
  try {
    await executeAll(
      `DELETE FROM text_analysis_cache
       WHERE text = $1 AND source = 'vision_llm_processing'`,
      [cacheKey],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to delete cached media analysis lock",
    );
  }
}

// ---------------------------------------------------------------------------
// Per-user moderation result cache (for spammer deduplication)
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic cache key for a per-conversation moderation result.
 *
 * Format: text_mod:<context>:<sha256(content).slice(0,16)>
 *
 * `context` is "channel:thread" — the LLM verdict depends on conversation
 * context, so the same text in a different channel/thread is analyzed
 * separately instead of silently reusing a context-free verdict.
 * (Previously the key was content-only, which made the "per-user" comment
 * misleading — the user ID never participates in the key.)
 */
export function makeTextModerationCacheKey(
  content: string,
  context?: string,
): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  const ctx = context ? `${context}:` : "";
  return `text_mod:${ctx}${hash}`;
}

/**
 * Conversation context signature used in moderation cache keys.
 * Thread-scoped messages use the thread id (discussions inside a thread
 * share context), everything else uses the channel id.
 */
export function makeModerationContextKey(message: {
  channel_id: string;
  thread_id?: string | null;
}): string {
  return message.thread_id ?? message.channel_id;
}

/**
 * Invalidate cached moderation verdicts for a piece of content: removes
 * matching Postgres rows AND Qdrant points. Called when a moderator
 * corrects a verdict so a stale/wrong cached decision cannot resurface.
 *
 * Handles both key formats:
 * - legacy `text_mod:<hash>` (content-only, pre-context keys)
 * - current `text_mod:<context>:<hash>` (channel/thread-scoped)
 */
export async function invalidateTextModerationCache(
  content: string,
): Promise<void> {
  const bareHash = createHash("sha256")
    .update(content)
    .digest("hex")
    .slice(0, 16);
  const legacyKey = `text_mod:${bareHash}`;

  const queries: Promise<unknown>[] = [
    executeAll(`DELETE FROM text_analysis_cache WHERE text LIKE $1`, [
      `text_mod:%${bareHash}`,
    ]).catch(() => {}),
  ];
  if (isQdrantConfigured()) {
    queries.push(
      deleteQdrantPoint(legacyKey).catch(() => {}),
      deleteQdrantPointsByContentHash(bareHash).catch(() => {}),
    );
  }
  await Promise.all(queries).catch(() => {});
}

/**
 * Normalize a stored verdict status to the full three-state union.
 *
 * Bug history (2026-08-22): both cache readers narrowed their types to
 * "clean" | "flagged", so a stored "warn" verdict fell into the legacy
 * `flags.length === 0 ? clean : flagged` branch and was served back as
 * FLAGGED (breaking auto-delete gating + dashboard labels). New entries
 * store the exact status; legacy rows without one derive from flags.
 */
export function normalizeStoredStatus(
  storedStatus: string | undefined,
  flags: string[],
): "clean" | "warn" | "flagged" {
  if (
    storedStatus === "clean" ||
    storedStatus === "warn" ||
    storedStatus === "flagged"
  ) {
    return storedStatus;
  }
  return flags.length === 0 ? "clean" : "flagged";
}

/** Shape shared by every moderation-cache read path. */
export interface StoredModerationVerdict {
  status: "clean" | "warn" | "flagged";
  flags: string[];
  score: number;
  analysis: string;
  categories: string[];
  severity: string;
  confidence: number;
  recommendedAction: string;
}

/** Raw DB row shape needed to rebuild a StoredModerationVerdict. */
interface VerdictRow {
  flags: string;
  analyzed_at?: number;
}

/**
 * Parse one `text_analysis_cache` row into a StoredModerationVerdict.
 * Shared by the single-key and batched getters so their semantics can never
 * drift apart (status normalization lives in exactly one place).
 */
export function parseStoredVerdictRow(
  row: VerdictRow,
): StoredModerationVerdict | null {
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(row.flags) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;

  const flags = Array.isArray(parsed.flags) ? (parsed.flags as string[]) : [];
  const status = normalizeStoredStatus(
    parsed.status as string | undefined,
    flags,
  );
  return {
    status,
    flags,
    score: (parsed.score as number) ?? 0,
    analysis: (parsed.analysis as string) ?? "",
    categories: (parsed.categories as string[]) ?? [],
    severity: (parsed.severity as string) ?? "none",
    confidence: (parsed.confidence as number) ?? 0,
    recommendedAction: (parsed.recommendedAction as string) ?? "none",
  };
}

/**
 * Increment the hit counter for a cache key (fire-and-forget).
 *
 * Bug history: `hit_count` was written as 0 on insert and never updated by
 * any reader, so cache effectiveness was unmeasurable. This is best-effort
 * observability — a failed bump must never affect the read path.
 */
function bumpHitCount(cacheKey: string): void {
  executeAll(
    `UPDATE text_analysis_cache SET hit_count = hit_count + 1 WHERE text = $1`,
    [cacheKey],
  ).catch(() => {});
}

/** Error-artifact flags that make a cached verdict unusable. */
export const ERROR_ARTIFACT_FLAGS = [
  "analysis_api_failed",
  "analysis_parse_failed",
  "analysis_incomplete",
] as const;

/**
 * Lookup a cached moderation result for a text content.
 * Returns the stored result fields or null.
 */

export async function getCachedTextModeration(
  cacheKey: string,
): Promise<StoredModerationVerdict | null> {
  try {
    const row = await executeGet(
      `SELECT flags, source, analyzed_at, expires_at, hit_count
       FROM text_analysis_cache
       WHERE text = $1 AND expires_at > $2`,
      [cacheKey, Date.now()],
    );

    if (!row) return null;

    const verdict = parseStoredVerdictRow(row);
    if (!verdict) return null;

    bumpHitCount(cacheKey);
    return verdict;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get cached user moderation",
    );
    return null;
  }
}

/**
 * Batched exact-hash lookup: ONE query for N keys.
 *
 * Semantics are identical to calling `getCachedTextModeration` per key
 * (unexpired rows only, shared row parser). Per-key hit-count bumps are NOT
 * issued here — the orchestrator logs an aggregate "cache applied" line
 * instead, keeping a 60-message burst at exactly one round-trip.
 * `analyzedAt` is surfaced so callers can apply freshness guards.
 */
export interface BatchedVerdictEntry {
  verdict: StoredModerationVerdict;
  analyzedAt: number | null;
}

export async function getCachedTextModerations(
  cacheKeys: string[],
): Promise<Map<string, BatchedVerdictEntry>> {
  const results = new Map<string, BatchedVerdictEntry>();
  const uniqueKeys = Array.from(new Set(cacheKeys)).filter(Boolean);
  if (uniqueKeys.length === 0) return results;

  const CHUNK_SIZE = 200;
  try {
    for (let i = 0; i < uniqueKeys.length; i += CHUNK_SIZE) {
      const chunk = uniqueKeys.slice(i, i + CHUNK_SIZE);
      // Postgres has a 32k bind-parameter ceiling; ANY($1) keeps it at one
      // array param per chunk regardless of chunk length.
      const rows = await executeAll(
        `SELECT text, flags, analyzed_at
         FROM text_analysis_cache
         WHERE text = ANY($1::text[]) AND expires_at > $2`,
        [chunk, Date.now()],
      );
      for (const row of rows ?? []) {
        if (results.has(row.text)) continue;
        const verdict = parseStoredVerdictRow(row);
        if (!verdict) continue;
        results.set(row.text, {
          verdict,
          analyzedAt:
            typeof row.analyzed_at === "number" ? row.analyzed_at : null,
        });
      }
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed batched text moderation lookup",
    );
  }
  return results;
}

/**
 * Fire-and-forget bulk hit-count bump for keys actually served as hits.
 * Companion to the batched getter (which skips per-row bumps): one UPDATE
 * per analysis batch keeps hit-rate metrics working at zero extra latency
 * cost per message.
 */
export function bumpTextModerationHitCounts(cacheKeys: string[]): void {
  const uniqueKeys = Array.from(new Set(cacheKeys)).filter(Boolean);
  if (uniqueKeys.length === 0) return;
  executeAll(
    `UPDATE text_analysis_cache SET hit_count = hit_count + 1 WHERE text = ANY($1::text[])`,
    [uniqueKeys],
  ).catch(() => {});
}

// ---------------------------------------------------------------------------
// Semantic two-band acceptance
// ---------------------------------------------------------------------------

/**
 * True when a semantic-cache hit may be reused given its verdict class.
 * Two bands (2026-08-24): non-actionable verdicts (clean / flagless /
 * action=none) are accepted from the LOOSER clean band; actionable verdicts
 * (warn/flagged or any flags/action) keep the strict historical gate.
 * Between the bands → reject → the message falls through to the LLM
 * (fail-open toward accuracy).
 */
export function isSemanticBandAccepted(
  verdict: StoredModerationVerdict,
  similarity: number,
): boolean {
  const isNonActionable =
    verdict.status === "clean" &&
    verdict.flags.length === 0 &&
    (verdict.recommendedAction ?? "none") === "none";
  return isNonActionable
    ? similarity >= config.AI_LLM_EMBEDDING_MIN_SIMILARITY_CLEAN
    : similarity >= config.AI_LLM_EMBEDDING_MIN_SIMILARITY;
}

// ---------------------------------------------------------------------------
// Global exact-cache reuse guard (context-free fallback)
// ---------------------------------------------------------------------------

/**
 * True when a stored verdict is safe to reuse OUTSIDE its original channel:
 * only verdicts that cannot trigger an action and carry no flags qualify,
 * and they must be confident + fresh. Flagged/warn verdicts are NEVER
 * globally reused — enforcement is context-sensitive by design.
 */
export function isGloballyReusableCleanVerdict(
  verdict: Omit<StoredModerationVerdict, "status"> & { status: string },
  analyzedAtMs: number | undefined,
): boolean {
  if (verdict.status !== "clean") return false;
  if (verdict.flags.length > 0) return false;
  if ((verdict.recommendedAction ?? "none") !== "none") return false;
  if (!(verdict.confidence >= config.AI_CACHE_GLOBAL_REUSE_MIN_CONFIDENCE))
    return false;
  if (
    typeof analyzedAtMs === "number" &&
    Date.now() - analyzedAtMs >
      config.AI_CACHE_GLOBAL_REUSE_MAX_AGE_H * 60 * 60 * 1000
  ) {
    return false;
  }
  return true;
}

/**
 * Parse a Qdrant verdict payload into the result shape shared by the
 * semantic cache lookups. Returns null on malformed payloads (callers then
 * fall through to the LLM).
 */
export function parseQdrantVerdict(
  payload: QdrantVerdictPayload,
  similarity: number,
):
  | (StoredModerationVerdict & {
      text: string;
      similarity: number;
    })
  | null {
  const parsed = parseStoredVerdictRow({ flags: payload.flags });
  if (!parsed) return null;

  return {
    ...parsed,
    text: payload.text,
    similarity,
  };
}

/**
 * Semantic moderation cache lookup.
 *
 * Primary: Qdrant vector search (when QDRANT_URL configured) — nearest
 * unexpired verdict above `minSimilarity`. Fallback: Postgres embedding
 * column (legacy rows written before Qdrant was wired in).
 * Returns null on no match or any failure — callers then proceed to the LLM.
 */
export async function findSimilarTextModeration(
  embedding: number[],
  minSimilarity: number,
  limit: number,
): Promise<
  (StoredModerationVerdict & { text: string; similarity: number }) | null
> {
  // Qdrant path (primary)
  if (isQdrantConfigured()) {
    const hits = await searchQdrant(embedding, limit, minSimilarity);
    if (hits.length > 0) {
      const hit = hits[0];
      return parseQdrantVerdict(hit.payload, hit.score);
    }
    // No Qdrant hit — fall through to Postgres legacy rows.
  }

  try {
    const rows = await executeAll(
      `SELECT text, flags, embedding
       FROM text_analysis_cache
       WHERE source = 'user_moderation'
         AND embedding IS NOT NULL
         AND expires_at > $1
       ORDER BY analyzed_at DESC
       LIMIT $2`,
      [Date.now(), limit],
    );
    if (!rows || rows.length === 0) return null;

    const candidates = rows.flatMap((row) => {
      let embeddingArr: number[] = [];
      let parsed: Record<string, unknown>;
      try {
        embeddingArr = JSON.parse(row.embedding) as number[];
        parsed = JSON.parse(row.flags) as Record<string, unknown>;
      } catch {
        return [];
      }
      // Skip processing locks / malformed entries — never reuse an
      // in-flight or non-verdict row.
      const storedStatus = parsed.status as string | undefined;
      if (storedStatus === "processing" || storedStatus === undefined) {
        return [];
      }
      if (!Array.isArray(parsed.flags)) return [];
      return [
        {
          text: row.text,
          embedding: embeddingArr,
          parsed,
        },
      ];
    });

    const match = findBestEmbeddingMatch(
      embedding,
      candidates.map((c) => c.embedding),
      minSimilarity,
    );
    if (!match) return null;

    const hit = candidates[match.index];
    const parsed = hit.parsed;
    const flags = (parsed.flags as string[]) ?? [];
    const status = normalizeStoredStatus(
      parsed.status as string | undefined,
      flags,
    );
    return {
      text: hit.text,
      similarity: match.similarity,
      status,
      flags,
      score: (parsed.score as number) ?? 0,
      analysis: (parsed.analysis as string) ?? "",
      categories: (parsed.categories as string[]) ?? [],
      severity: (parsed.severity as string) ?? "none",
      confidence: (parsed.confidence as number) ?? 0,
      recommendedAction: (parsed.recommendedAction as string) ?? "none",
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed semantic text moderation lookup",
    );
    return null;
  }
}

/**
 * Store a moderation result for a (user, content) pair.
 * The `flags` field stores the full result object as JSON.
 * `embedding` (optional) is stored for semantic near-duplicate lookups.
 */
export async function setCachedTextModeration(
  cacheKey: string,
  result: {
    flags: string[];
    score: number;
    analysis: string;
    categories: string[];
    severity: string;
    confidence: number;
    recommendedAction: string;
    status?: "clean" | "warn" | "flagged" | "processing";
  },
  embedding?: number[] | null,
): Promise<void> {
  const now = Date.now();
  const USER_MOD_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

  try {
    // Qdrant is the primary vector store when configured: upsert the point
    // with the verdict payload; skip the Postgres embedding column entirely.
    if (isQdrantConfigured() && embedding && embedding.length > 0) {
      await upsertQdrantPoint(cacheKey, embedding, {
        text: cacheKey,
        flags: JSON.stringify(result),
        analyzed_at: now,
        expires_at: now + USER_MOD_CACHE_TTL_MS,
        content_hash: cacheKey.split(":").pop() ?? "",
      });
    }

    await executeAll(
      `INSERT INTO text_analysis_cache (text, flags, source, analyzed_at, expires_at, hit_count, embedding)
       VALUES ($1, $2, $3, $4, $5, 0, $6)
       ON CONFLICT (text) DO UPDATE SET
        flags = EXCLUDED.flags,
        source = EXCLUDED.source,
        analyzed_at = EXCLUDED.analyzed_at,
        expires_at = EXCLUDED.expires_at,
        embedding = COALESCE(EXCLUDED.embedding, text_analysis_cache.embedding)`,
      [
        cacheKey,
        JSON.stringify(result),
        "user_moderation",
        now,
        now + USER_MOD_CACHE_TTL_MS,
        // Postgres embedding stays as legacy fallback; Qdrant is primary.
        embedding && embedding.length > 0 ? JSON.stringify(embedding) : null,
      ],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to set cached user moderation",
    );
  }
}

// ---------------------------------------------------------------------------
// Corrected Moderation (false-positive) helpers for dynamic few-shot injection
// ---------------------------------------------------------------------------

export interface CorrectedModerationEntry {
  id: string;
  originalFlags: string[];
  correctedFlags: string[];
  correctionNotes: string | null;
  contentSnippet: string;
}

/**
 * Fetch the most recent corrected false positives from the database.
 * Used to inject dynamic few-shot examples into the moderation prompt.
 * Limit: 5 most recent entries.
 */
export async function getRecentCorrectedModerations(
  limit: number = 5,
): Promise<CorrectedModerationEntry[]> {
  try {
    const rows = await executeAll(
      `SELECT id, original_flags, corrected_flags, correction_notes, content_snippet
       FROM corrected_moderations
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit],
    );

    if (!rows || rows.length === 0) return [];

    return (
      rows as Array<{
        id: string;
        original_flags: string;
        corrected_flags: string;
        correction_notes: string | null;
        content_snippet: string;
      }>
    ).map((row) => ({
      id: row.id,
      originalFlags: JSON.parse(row.original_flags) as string[],
      correctedFlags: JSON.parse(row.corrected_flags) as string[],
      correctionNotes: row.correction_notes,
      contentSnippet: row.content_snippet,
    }));
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get recent corrected moderations",
    );
    return [];
  }
}

/**
 * Store a corrected moderation entry for future few-shot injection.
 *
 * Also invalidates any cached verdicts for the corrected content (both
 * Postgres rows and Qdrant points) so the corrected decision propagates
 * immediately instead of being shadowed by a stale cache entry. Full
 * content is looked up by message_id when available — more precise than
 * the (possibly truncated) snippet.
 */
export async function insertCorrectedModeration(entry: {
  messageId: string;
  originalFlags: string[];
  correctedFlags: string[];
  correctionNotes?: string | null;
  contentSnippet: string;
}): Promise<void> {
  const id = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const created_at = Date.now();

  try {
    await executeAll(
      `INSERT INTO corrected_moderations (id, message_id, original_flags, corrected_flags, correction_notes, content_snippet, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        entry.messageId,
        JSON.stringify(entry.originalFlags),
        JSON.stringify(entry.correctedFlags),
        entry.correctionNotes ?? null,
        entry.contentSnippet,
        created_at,
      ],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to insert corrected moderation",
    );
    return;
  }

  // Best-effort invalidation: prefer full content from the messages table.
  try {
    const row = await executeGet(
      `SELECT content, edited_content FROM messages WHERE id = $1`,
      [entry.messageId],
    );
    const fullContent = (row?.edited_content ?? row?.content ?? "").trim();
    await invalidateTextModerationCache(
      fullContent || entry.contentSnippet,
    ).catch(() => {});
  } catch {
    await invalidateTextModerationCache(entry.contentSnippet).catch(() => {});
  }
}
