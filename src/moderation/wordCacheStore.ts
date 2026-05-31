import { executeAll } from "../database/drizzle.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("word-cache-store");

export interface WordCacheEntry {
  word: string;
  flags: string[];
  source: "local" | "nvidia" | "primary_ai" | "groq";
  analyzed_at: number;
  expires_at: number;
  hit_count: number;
}

/**
 * Fetch cached word analysis entries for the given words.
 * Only returns non-expired entries. Increments hit_count for each hit.
 */
export async function getCachedWords(
  words: string[],
): Promise<Map<string, WordCacheEntry>> {
  if (words.length === 0) return new Map();

  const results = new Map<string, WordCacheEntry>();

  try {
    // SELECT all matching words that are not expired
    const rows = await executeAll(
      `SELECT word, flags, source, analyzed_at, expires_at, hit_count
       FROM word_analysis_cache
       WHERE word = ANY($1) AND expires_at > $2`,
      [words, Date.now()],
    );

    for (const row of rows) {
      const entry: WordCacheEntry = {
        word: row.word,
        flags: JSON.parse(row.flags),
        source: row.source,
        analyzed_at: row.analyzed_at,
        expires_at: row.expires_at,
        hit_count: row.hit_count,
      };
      results.set(entry.word, entry);
    }

    // Increment hit counts for cached words
    const cachedWordList = Array.from(results.keys());
    if (cachedWordList.length > 0) {
      await executeAll(
        `UPDATE word_analysis_cache
         SET hit_count = hit_count + 1
         WHERE word = ANY($1)`,
        [cachedWordList],
      );
    }
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to get cached words",
    );
  }

  return results;
}

interface WordCacheUpsert {
  word: string;
  flags: string[];
  source: "local" | "nvidia" | "primary_ai" | "groq";
  expiresAt: number;
}

/**
 * Insert or update word analysis cache entries.
 * Uses INSERT ... ON CONFLICT to upsert efficiently.
 */
export async function upsertCachedWords(
  entries: WordCacheUpsert[],
): Promise<void> {
  if (entries.length === 0) return;

  const now = Date.now();

  try {
    const values = entries
      .map(
        (_, i) =>
          `($${i * 5 + 1}, $${i * 5 + 2}, $${i * 5 + 3}, $${i * 5 + 4}, $${i * 5 + 5})`,
      )
      .join(", ");

    const params: unknown[] = [];
    for (const entry of entries) {
      params.push(
        entry.word,
        JSON.stringify(entry.flags),
        entry.source,
        now,
        entry.expiresAt,
      );
    }

    await executeAll(
      `INSERT INTO word_analysis_cache (word, flags, source, analyzed_at, expires_at)
       VALUES ${values}
       ON CONFLICT (word) DO UPDATE SET
         flags = EXCLUDED.flags,
         source = EXCLUDED.source,
         analyzed_at = EXCLUDED.analyzed_at,
         expires_at = EXCLUDED.expires_at`,
      params,
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to upsert cached words",
    );
  }
}

/**
 * Delete expired cache entries. Run periodically to keep the table clean.
 */
export async function pruneExpiredWords(): Promise<number> {
  try {
    const result = await executeAll(
      `DELETE FROM word_analysis_cache WHERE expires_at < $1`,
      [Date.now()],
    );

    // pg returns { rowCount } for DELETE
    return (result as any).rowCount ?? 0;
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to prune expired words",
    );
    return 0;
  }
}

/**
 * Get cache statistics for observability.
 */
export async function getWordCacheStats(): Promise<{
  total: number;
  expired: number;
  bySource: Record<string, number>;
}> {
  try {
    const now = Date.now();

    const [totalRow, expiredRow, sourceRows] = await Promise.all([
      executeAll(`SELECT count(*) as cnt FROM word_analysis_cache`),
      executeAll(
        `SELECT count(*) as cnt FROM word_analysis_cache WHERE expires_at < $1`,
        [now],
      ),
      executeAll(
        `SELECT source, count(*) as cnt FROM word_analysis_cache GROUP BY source`,
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
      "Failed to get word cache stats",
    );
    return { total: 0, expired: 0, bySource: {} };
  }
}
