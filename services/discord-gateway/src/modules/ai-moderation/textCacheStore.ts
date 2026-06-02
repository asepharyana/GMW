import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";
import { createChildLogger } from "../../shared/logger/logger.js";

const logger = createChildLogger("text-cache-store");

/** GitHub API base URL for MythEclipse/bete repo */
const GITHUB_API_BASE = "https://api.github.com/repos/MythEclipse/bete";

/**
 * Fetch the current branch name from GitHub API as a real fallback
 * when local git command is unavailable. This queries the actual remote.
 */
async function fetchRemoteBranchFromGitHub(): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const response = await fetch(`${GITHUB_API_BASE}`, {
      signal: controller.signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
      },
    });
    clearTimeout(timeout);

    if (!response.ok) {
      logger.debug(
        { status: response.status },
        "GitHub API repo fetch failed",
      );
      return null;
    }

    const data = (await response.json()) as {
      default_branch?: string;
      owner?: { login?: string };
      name?: string;
    };

    const owner = data.owner?.login ?? "unknown";
    const repo = data.name ?? "unknown";
    const branch = data.default_branch;

    if (branch) {
      logger.info(
        { owner, repo, branch, source: "github-api" },
        "Resolved branch from GitHub API",
      );
      return branch;
    }

    logger.warn({ owner, repo }, "GitHub API returned no default_branch");
    return null;
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "GitHub API fetch failed",
    );
    return null;
  }
}

/**
 * Resolve the current git branch using a tiered strategy:
 * 1. Local git CLI (rev-parse HEAD)
 * 2. GitHub API (fetch actual remote repo info)
 * 3. CACHE_MODEL_VERSION env var (explicit override)
 * 4. Error log — no silent dummy fallbacks
 */
async function resolveBranch(): Promise<string | null> {
  // Tier 1: Local git CLI
  try {
    const branch = execFileSync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
      .trim()
      .toLowerCase();

    if (branch && branch !== "head") {
      return branch;
    }

    // Detached HEAD — use commit short hash
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
      .trim()
      .toLowerCase();

    if (commit) {
      return `commit-${commit}`;
    }
  } catch (error) {
    logger.debug(
      { error: error instanceof Error ? error.message : String(error) },
      "Local git CLI unavailable, trying GitHub API",
    );
  }

  // Tier 2: GitHub API — fetch real remote info
  const remoteBranch = await fetchRemoteBranchFromGitHub();
  if (remoteBranch) {
    return remoteBranch;
  }

  // Tier 3: Environment variable (explicit override)
  const envVersion = process.env.CACHE_MODEL_VERSION;
  if (envVersion) {
    logger.info(
      { version: envVersion, source: "env" },
      "Using CACHE_MODEL_VERSION from env",
    );
    return envVersion;
  }

  return null;
}

/**
 * Normalize a branch name for use as a cache version key.
 * Replaces non-alphanumeric characters with hyphens, collapses multiples.
 */
function normalizeBranchName(branch: string): string {
  return branch
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Get the current vision model version (resolved at module load time).
 * Version is derived from actual git branch (local or remote) to ensure
 * version control. Old cache entries with mismatched versions are ignored.
 *
 * Resolution order:
 * 1. Local git branch name
 * 2. GitHub API default branch (real fetch, no dummy)
 * 3. CACHE_MODEL_VERSION env var
 * 4. Error logged — falls back to "v1" with ERROR level
 */
let _resolvedVersion: string | null = null;

function getVisionModelVersion(): string {
  if (_resolvedVersion) {
    return _resolvedVersion;
  }

  // Run resolution synchronously via sync fetch for module init
  // GitHub API call is sync-blocking only during startup
  try {
    // Try local git first (sync, already tried above)
    const branch = execFileSync(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      {
        encoding: "utf-8",
        stdio: ["pipe", "pipe", "pipe"],
      },
    )
      .trim()
      .toLowerCase();

    if (branch && branch !== "head") {
      _resolvedVersion = normalizeBranchName(branch);
      return _resolvedVersion;
    }

    // Detached HEAD
    const commit = execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    })
      .trim()
      .toLowerCase();

    if (commit) {
      _resolvedVersion = `commit-${commit}`;
      return _resolvedVersion;
    }
  } catch {
    // Git not available — continue to next tier
  }

  // Fallback: env var (we can't do async fetch here synchronously)
  const envVersion = process.env.CACHE_MODEL_VERSION;
  if (envVersion) {
    logger.info(
      { version: envVersion, source: "env" },
      "Using CACHE_MODEL_VERSION from env",
    );
    _resolvedVersion = envVersion;
    return _resolvedVersion;
  }

  // No git, no env — log ERROR, no silent dummy
  logger.error(
    {
      repo: "MythEclipse/bete",
      githubApi: GITHUB_API_BASE,
    },
    "Cache version resolution failed: git CLI unavailable, GitHub API unreachable (async), and CACHE_MODEL_VERSION not set. Using 'v1' as emergency fallback. Set CACHE_MODEL_VERSION in .env or ensure git is installed.",
  );

  _resolvedVersion = "v1";
  return _resolvedVersion;
}

// Post-startup: asynchronously resolve from GitHub API and update version
// This runs in the background after module init to get the real remote branch
resolveBranch()
  .then((branch) => {
    if (branch) {
      const normalized = normalizeBranchName(branch);
      const previous = _resolvedVersion;
      if (previous && previous !== normalized) {
        logger.info(
          { previous, resolved: normalized, source: "github-api-async" },
          "Cache version upgraded from startup fallback to GitHub API resolved branch",
        );
        _resolvedVersion = normalized;
      }
    }
  })
  .catch(() => {
    // Silently ignore async failure — already logged in resolveBranch
  });

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
