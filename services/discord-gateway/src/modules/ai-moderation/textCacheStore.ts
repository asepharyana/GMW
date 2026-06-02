import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";
import { createChildLogger } from "../../shared/logger/logger.js";

const logger = createChildLogger("text-cache-store");

/**
 * Model version for vision/LLM cache entries.
 * Dynamically derived from git branch name to ensure version control.
 *
 * Branch naming convention:
 * - main/master → "main" or "master" (stable, original cache)
 * - feature/terminal-fix → "feature-terminal-fix" (feature branch cache)
 * - hotfix/gambling-false-positive → "hotfix-gambling-false-positive" (hotfix branch cache)
 *
 * Old cache entries with mismatched versions are automatically ignored.
 * This ensures each branch/deployment gets fresh analyses if it changes moderation logic.
 *
 * Fallback: If git branch detection fails, uses environment variable or defaults to "v1".
 */
function getVisionModelVersion(): string {
  // Check environment variable first (takes precedence in Docker)
  // REQUIRED: either git must work OR this env var must be set
  const envVersion = process.env.CACHE_MODEL_VERSION;

  try {
    // Get current git branch name using execFileSync (safe, no shell injection)
    const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"], // Suppress stderr
    })
      .trim()
      .toLowerCase();

    if (!branch || branch === "head") {
      // Detached HEAD state — use commit hash prefix
      const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"], // Suppress stderr
      })
        .trim()
        .toLowerCase();
      return `commit-${commit}`;
    }

    // Normalize branch name: replace slashes with hyphens, remove special chars
    const normalized = branch
      .replace(/[^a-z0-9-]/g, "-") // Replace non-alphanumeric with hyphens
      .replace(/-+/g, "-") // Collapse multiple hyphens
      .replace(/^-|-$/g, ""); // Remove leading/trailing hyphens

    return normalized || "v1";
  } catch (error) {
    // Git not available or failed
    if (envVersion) {
      logger.info(
        { version: envVersion },
        "Git detection failed; using CACHE_MODEL_VERSION from env",
      );
      return envVersion;
    }

    // No git AND no env var — this is a real issue in production
    const errorMsg =
      error instanceof Error ? error.message : String(error);
    logger.error(
      { error: errorMsg },
      "Git command unavailable AND CACHE_MODEL_VERSION env not set. Cache versioning disabled. Set CACHE_MODEL_VERSION env var or ensure git is installed.",
    );

    // ONLY fall back to "v1" if we have no choice, but log it as an error
    // This ensures we're not silently using a dummy value
    return "v1";
  }
}

/**
 * Get the current vision model version (cached at module load time).
 * Version is derived from git branch name and remains constant for this process.
 */
export const VISION_MODEL_VERSION = getVisionModelVersion();

logger.info({ version: VISION_MODEL_VERSION }, "Vision model version initialized");

export interface TextCacheEntry {
  text: string;
  flags: string[];
  source: "local" | "nvidia" | "primary_ai" | "groq" | "vision_llm";
  analyzed_at: number;
  expires_at: number;
  hit_count: number;
}

/**
 * Lookup cached analysis result for a normalized text string.
 * Returns null if not found, expired, or model version mismatch.
 */
export async function getCachedText(
  text: string,
): Promise<TextCacheEntry | null> {
  try {
    const row = await executeGet(
      `SELECT text, flags, source, analyzed_at, expires_at, hit_count, model_version
       FROM text_analysis_cache
       WHERE text = $1 AND expires_at > $2 AND model_version = $3`,
      [text, Date.now(), VISION_MODEL_VERSION],
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
 * Insert or update a text analysis cache entry with model version.
 */
export async function upsertCachedText(
  text: string,
  flags: string[],
  source: "local" | "nvidia" | "primary_ai" | "groq" | "vision_llm",
  expiresAt: number,
): Promise<void> {
  const now = Date.now();

  try {
    await executeAll(
      `INSERT INTO text_analysis_cache (text, flags, source, analyzed_at, expires_at, hit_count, model_version)
       VALUES ($1, $2, $3, $4, $5, 0, $6)
       ON CONFLICT (text) DO UPDATE SET
         flags = EXCLUDED.flags,
         source = EXCLUDED.source,
         analyzed_at = EXCLUDED.analyzed_at,
         expires_at = EXCLUDED.expires_at,
         model_version = EXCLUDED.model_version`,
      [text, JSON.stringify(flags), source, now, expiresAt, VISION_MODEL_VERSION],
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
// Media / Vision analysis cache helpers (reuses text_analysis_cache table)
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
 * Returns the full cached text (the analysis summary string) or null if not found, expired, or version mismatch.
 */
export async function getCachedMediaAnalysis(
  cacheKey: string,
): Promise<string | null> {
  try {
    const row = await executeGet(
      `SELECT flags, hit_count, model_version
       FROM text_analysis_cache
       WHERE text = $1 AND expires_at > $2 AND model_version = $3`,
      [cacheKey, Date.now(), VISION_MODEL_VERSION],
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
 * Store a media analysis result in the cache with model version tracking.
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
      `INSERT INTO text_analysis_cache (text, flags, source, analyzed_at, expires_at, hit_count, model_version)
       VALUES ($1, $2, $3, $4, $5, 0, $6)
       ON CONFLICT (text) DO UPDATE SET
         flags = EXCLUDED.flags,
         source = EXCLUDED.source,
         analyzed_at = EXCLUDED.analyzed_at,
         expires_at = EXCLUDED.expires_at,
         model_version = EXCLUDED.model_version`,
      [cacheKey, JSON.stringify(analysisResult), source, now, expiresAt, VISION_MODEL_VERSION],
    );
  } catch (error) {
    logger.error(
      { error: error instanceof Error ? error.message : String(error) },
      "Failed to upsert cached media analysis",
    );
  }
}
