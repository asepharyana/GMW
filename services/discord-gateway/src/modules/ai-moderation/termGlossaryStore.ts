/**
 * termGlossaryStore.ts
 *
 * Permanent Postgres layer for the term glossary. Resolved definitions
 * (which carry content) are persisted here because they rarely change —
 * Redis/LRU only act as fast read caches in front of this table. Terms with
 * no definition (misses) are deliberately NOT persisted; they stay ephemeral
 * in Redis with a short TTL so transient lookup failures get retried.
 *
 * All calls are best-effort: any DB error degrades to a cache miss (the
 * glossary then falls through to Redis/live search as if the DB layer
 * didn't exist).
 */

import { createChildLogger } from "@/shared/logger/index";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";

const log = createChildLogger("term-glossary-store");

export interface StoredTermDefinition {
  definition: string;
  sourceUrl: string;
}

/**
 * Read a permanently stored definition for a term (lowercase key).
 * Returns null when missing or on any DB error (callers fall through).
 * A successful read bumps hit_count for observability (fire-and-forget).
 */
export async function getTermDefinitionFromDb(
  term: string,
): Promise<StoredTermDefinition | null> {
  try {
    const row = await executeGet(
      `SELECT definition, source_url FROM term_glossary_cache WHERE term = $1`,
      [term.toLowerCase().trim()],
    );
    if (!row) return null;
    try {
      await executeAll(
        `UPDATE term_glossary_cache SET hit_count = hit_count + 1 WHERE term = $1`,
        [term.toLowerCase().trim()],
      );
    } catch {
      // hit_count is observability only — never fail a read for it
    }
    return {
      definition: row.definition as string,
      sourceUrl: (row.source_url as string | null) ?? "",
    };
  } catch (error) {
    log.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "getTermDefinitionFromDb failed — falling back to live search",
    );
    return null;
  }
}

/**
 * Persist a resolved definition permanently (UPSERT by term).
 * Only called for successful resolutions — never for misses.
 * Best-effort: a DB write failure does not affect the returned definition.
 */
export async function setTermDefinitionInDb(
  term: string,
  definition: string,
  sourceUrl: string,
): Promise<void> {
  try {
    await executeAll(
      `INSERT INTO term_glossary_cache (term, definition, source_url, resolved_at, hit_count)
       VALUES ($1, $2, $3, $4, 0)
       ON CONFLICT (term) DO UPDATE SET
         definition = EXCLUDED.definition,
         source_url = EXCLUDED.source_url,
         resolved_at = EXCLUDED.resolved_at`,
      [term.toLowerCase().trim(), definition, sourceUrl, Date.now()],
    );
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "setTermDefinitionInDb failed — definition stays memory/Redis only",
    );
  }
}
