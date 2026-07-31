import { createHash } from "node:crypto";
import { createChildLogger } from "@/shared/logger/index";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";
import { findBestEmbeddingMatch } from "./embeddingClient.js";
import {
  isQdrantConfigured,
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
 * Lookup cached analysis result for a normalized text string.
 * Returns null if not found or expired.
 */
export async function getCachedText(
  text: string,
): Promise<TextCacheEntry | null> {
  try {
    const row = await executeGet(
      `SELECT text, flags, source, analyzed_at, expires_at, hit_count
       FROM text_analysis_cache
       WHERE text = $1 AND expires_at > $2`,
      [text, Date.now()],
    );

    if (!row) return null;

    return {
      text: row.text,
      flags: JSON.parse(row.flags),
      source: row.source,
      analyzed_at: row.analyzed_at,
      expires_at: row.expires_at,
      hit_count: row.hit_count,
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get cached text",
    );
    return null;
  }
}

/**
 * Insert or update a text analysis cache entry.
 */
export async function upsertCachedText(
  text: string,
  flags: string[],
  source: "local" | "primary_ai" | "vision_llm",
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
      [text, JSON.stringify(flags), source, now, expiresAt],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to upsert cached text",
    );
  }
}

/**
 * Increment hit count for a cached text entry (called on cache hit).
 */
export async function incrementTextCacheHit(text: string): Promise<void> {
  try {
    await executeAll(
      `UPDATE text_analysis_cache SET hit_count = hit_count + 1 WHERE text = $1`,
      [text],
    );
  } catch (_error) {
    // Silent fail — this is just a counter, not critical
  }
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

/**
 * Get cache statistics for observability.
 */
export async function getTextCacheStats(): Promise<{
  total: number;
  expired: number;
  bySource: Record<string, number>;
}> {
  try {
    const now = Date.now();

    const [totalRow, expiredRow, sourceRows] = await Promise.all([
      executeAll(`SELECT count(*) as cnt FROM text_analysis_cache`),
      executeAll(
        `SELECT count(*) as cnt FROM text_analysis_cache WHERE expires_at < $1`,
        [now],
      ),
      executeAll(
        `SELECT source, count(*) as cnt FROM text_analysis_cache GROUP BY source`,
      ),
    ]);

    const bySource: Record<string, number> = {};
    for (const row of sourceRows) {
      bySource[row.source] = row.cnt;
    }

    return {
      total: totalRow[0]?.cnt ?? 0,
      expired: expiredRow[0]?.cnt ?? 0,
      bySource,
    };
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get text cache stats",
    );
    return { total: 0, expired: 0, bySource: {} };
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
 * Generate a deterministic cache key for an image data URL.
 * Hashes the first 128 chars of the data URL (enough to identify the image
 * without storing the full base64 string as the key).
 */
export function makeImageCacheKey(dataUrl: string): string {
  const prefix = dataUrl.slice(0, 128);
  const hash = createHash("sha256").update(prefix).digest("hex").slice(0, 16);
  return `image:${hash}`;
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
 * Generate a deterministic cache key for a per-user moderation result.
 *
 * Format: user_mod:<userId>:<sha256(content).slice(0,16)>
 * Two users sending the same text get separate cache entries so that
 * per-user action history (e.g. repeated spam) can be tracked later.
 */
export function makeTextModerationCacheKey(content: string): string {
  const hash = createHash("sha256").update(content).digest("hex").slice(0, 16);
  return `text_mod:${hash}`;
}

/**
 * Lookup a cached moderation result for a text content.
 * Returns the stored result fields or null.
 */
export async function getCachedTextModeration(cacheKey: string): Promise<{
  status: "clean" | "flagged";
  flags: string[];
  score: number;
  analysis: string;
  categories: string[];
  severity: string;
  confidence: number;
  recommendedAction: string;
} | null> {
  try {
    const row = await executeGet(
      `SELECT flags, source, analyzed_at, expires_at, hit_count
       FROM text_analysis_cache
       WHERE text = $1 AND expires_at > $2`,
      [cacheKey, Date.now()],
    );

    if (!row) return null;

    const parsed = JSON.parse(row.flags) as Record<string, unknown>;
    const flags = (parsed.flags as string[]) ?? [];
    // Use stored status if available (new entries), otherwise derive from flags (legacy compatibility)
    const storedStatus = parsed.status as string | undefined;
    const status: "clean" | "flagged" =
      storedStatus === "clean" || storedStatus === "flagged"
        ? storedStatus
        : flags.length === 0
          ? "clean"
          : "flagged";

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
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get cached user moderation",
    );
    return null;
  }
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
): Promise<{
  text: string;
  similarity: number;
  status: "clean" | "warn" | "flagged";
  flags: string[];
  score: number;
  analysis: string;
  categories: string[];
  severity: string;
  confidence: number;
  recommendedAction: string;
} | null> {
  // Qdrant path (primary)
  if (isQdrantConfigured()) {
    const hits = await searchQdrant(embedding, limit, minSimilarity);
    if (hits.length > 0) {
      const hit = hits[0];
      let parsed: Record<string, unknown>;
      try {
        parsed = JSON.parse(hit.payload.flags) as Record<string, unknown>;
      } catch {
        return null;
      }
      const storedStatus = (parsed.status as string) ?? "clean";
      const status: "clean" | "warn" | "flagged" =
        storedStatus === "warn" || storedStatus === "flagged"
          ? storedStatus
          : "clean";
      return {
        text: hit.payload.text,
        similarity: hit.score,
        status,
        flags: (parsed.flags as string[]) ?? [],
        score: (parsed.score as number) ?? 0,
        analysis: (parsed.analysis as string) ?? "",
        categories: (parsed.categories as string[]) ?? [],
        severity: (parsed.severity as string) ?? "none",
        confidence: (parsed.confidence as number) ?? 0,
        recommendedAction: (parsed.recommendedAction as string) ?? "none",
      };
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
    const storedStatus = (parsed.status as string) ?? "clean";
    const status: "clean" | "warn" | "flagged" =
      storedStatus === "warn" || storedStatus === "flagged"
        ? storedStatus
        : "clean";
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
// Perceptual hash helpers for image deduplication
// ---------------------------------------------------------------------------

/**
 * Generate a deterministic cache key for a perceptual hash.
 * The phash value is a string like "a1b2c3d4e5f6..." from the imghash library.
 */
export function makePhashCacheKey(phash: string): string {
  return `phash:${phash.slice(0, 16)}`;
}

/**
 * Look up a cached media analysis by perceptual hash.
 * Returns the cached analysis string or null if not found/expired.
 */
export async function getCachedMediaByPhash(
  phash: string,
): Promise<string | null> {
  const cacheKey = makePhashCacheKey(phash);
  return getCachedMediaAnalysis(cacheKey);
}

/**
 * Store a media analysis result keyed by perceptual hash.
 */
export async function upsertCachedMediaByPhash(
  phash: string,
  analysisResult: string,
  source: "vision_llm",
  expiresAt: number,
): Promise<void> {
  const cacheKey = makePhashCacheKey(phash);
  return upsertCachedMediaAnalysis(cacheKey, analysisResult, source, expiresAt);
}

/**
 * Compute perceptual hash from image buffer using imghash.
 * Returns a hexadecimal string representation of the hash.
 * Returns null if hashing fails (e.g., invalid image data).
 */
export async function computeImagePhash(
  buffer: Buffer,
): Promise<string | null> {
  try {
    // Dynamic import — imghash is ESM with a default export containing { hash, hashRaw, ... }
    const imghashModule: {
      default?: { hash?: (buf: Buffer) => Promise<string> };
    } = await import("imghash");
    const hashFn = imghashModule.default?.hash;
    if (typeof hashFn !== "function") return null;
    const hash = await hashFn(buffer);
    return hash;
  } catch {
    return null;
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
  }
}
