import { createHash } from "node:crypto";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";
import { createChildLogger } from "../../shared/logger/logger.js";

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
  } catch (error) {
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
    return (result as any).rowCount ?? 0;
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
       WHERE text = $1 AND expires_at > $2`,
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
