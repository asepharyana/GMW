import Redis from "ioredis";
import { createChildLogger } from "@bete/shared/logger";
import { createAbortTimeout } from "./abortHelper.js";

const log = createChildLogger("searxng-search");

const SEARXNG_BASE_URL = "https://searxng.imrnes.team";
const MAX_RESULTS = 3;
const TIMEOUT_MS = 8000;
const CACHE_TTL = 86400; // 24 hours
const CACHE_PREFIX = "searxng:";
/** How often to attempt reconnection when Redis is down (ms). */
const RECONNECT_INTERVAL_MS = 60_000;

let redis: Redis | null = null;
let _initialized = false;
let _redisUrl = "";
/** Tracks whether Redis is currently healthy (connected + responding). */
let _redisHealthy = false;
let _lastLogAt = 0; // throttle repeated warn logs to once per 60s

// ---------------------------------------------------------------------------
// Health tracking
// ---------------------------------------------------------------------------

/**
 * Returns true if the SearXNG Redis cache is connected and healthy.
 * Use this for health-check endpoints or status dashboards.
 */
export function isSearxngCacheAvailable(): boolean {
  return _redisHealthy;
}

/**
 * Returns a human-readable status string for logging / health endpoints.
 */
export function getSearxngCacheStatus(): string {
  if (!_initialized) return "not-initialized";
  if (!redis) return "no-url";
  return _redisHealthy ? "healthy" : "disconnected";
}

// ---------------------------------------------------------------------------
// Reconnection helper
// ---------------------------------------------------------------------------

/**
 * Schedule a one-shot reconnection attempt after RECONNECT_INTERVAL_MS.
 * Only one reconnection timer runs at a time.
 */
let _reconnectTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleReconnect(): void {
  if (_reconnectTimer) return; // already scheduled
  _reconnectTimer = setTimeout(async () => {
    _reconnectTimer = null;
    if (!redis || _redisHealthy) return; // nothing to do

    log.info("SearXNG Redis: attempting reconnection...");
    try {
      // ioredis reconnects automatically if `lazyConnect` is false,
      // but we set it to true, so we need to manually call connect().
      await redis.connect();
      // If we get here, connection succeeded
      _redisHealthy = true;
      log.info("SearXNG Redis: reconnected successfully ✅");
    } catch {
      _redisHealthy = false;
      const now = Date.now();
      if (now - _lastLogAt > 60_000) {
        log.warn(
          { nextRetryMs: RECONNECT_INTERVAL_MS },
          "SearXNG Redis: reconnection failed — will retry",
        );
        _lastLogAt = now;
      }
      // Schedule another attempt
      scheduleReconnect();
    }
  }, RECONNECT_INTERVAL_MS);
  _reconnectTimer.unref?.();
}

// ---------------------------------------------------------------------------
// Initialization
// ---------------------------------------------------------------------------

/**
 * Initialize Redis connection for SearXNG cache.
 * Safe to call multiple times — only creates one connection.
 * Returns true if Redis cache is available, false if falling back to no-cache.
 */
export function initSearxngCache(redisUrl: string): boolean {
  if (_initialized) return _redisHealthy;
  _initialized = true;
  _redisUrl = redisUrl;

  if (!redisUrl) {
    log.warn("No REDIS_URL provided — SearXNG cache disabled");
    return false;
  }

  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    lazyConnect: true,
    enableReadyCheck: false,
  });

  redis.on("error", (err) => {
    const wasHealthy = _redisHealthy;
    _redisHealthy = false;
    if (wasHealthy) {
      // State transition: healthy → unhealthy — always log
      log.warn(
        { error: err.message },
        "SearXNG Redis: connection lost — falling back to no-cache",
      );
    } else {
      // Already unhealthy — throttle repeated error logs
      const now = Date.now();
      if (now - _lastLogAt > 60_000) {
        log.warn(
          { error: err.message },
          "SearXNG Redis: still disconnected",
        );
        _lastLogAt = now;
      }
    }
    scheduleReconnect();
  });

  redis.on("ready", () => {
    if (!_redisHealthy) {
      _redisHealthy = true;
      log.info("SearXNG Redis: connected and healthy ✅");
    }
  });

  redis.connect().catch(() => {
    _redisHealthy = false;
    log.warn("SearXNG Redis: initial connection failed — running without cache");
    scheduleReconnect();
  });

  log.info("SearXNG Redis cache initialized");
  return true;
}

// ---------------------------------------------------------------------------
// Cache operations with visible failure logging
// ---------------------------------------------------------------------------

async function cacheGet(key: string): Promise<string | null> {
  if (!redis || !_redisHealthy) return null;
  try {
    const result = await redis.get(key);
    return result;
  } catch (err) {
    // Log once per minute to avoid log spam
    const now = Date.now();
    if (now - _lastLogAt > 60_000) {
      log.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "SearXNG Redis: cache read failed",
      );
      _lastLogAt = now;
    }
    _redisHealthy = false;
    scheduleReconnect();
    return null;
  }
}

function cacheSet(key: string, value: string, ttlSeconds: number): void {
  if (!redis || !_redisHealthy) return;
  redis.setex(key, ttlSeconds, value).catch((err) => {
    const now = Date.now();
    if (now - _lastLogAt > 60_000) {
      log.warn(
        { error: err instanceof Error ? err.message : String(err) },
        "SearXNG Redis: cache write failed",
      );
      _lastLogAt = now;
    }
    _redisHealthy = false;
    scheduleReconnect();
  });
}

// ---------------------------------------------------------------------------
// Search
// ---------------------------------------------------------------------------

export interface SearxngResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Search SearXNG for a query and return structured results.
 * Uses Redis cache when available — same query within 24h returns cached results.
 */
export async function searchSearxng(
  query: string,
  category: "general" | "news" | "science" = "general",
): Promise<SearxngResult[]> {
  const cacheKey = `${CACHE_PREFIX}${category}:${query.toLowerCase().trim()}`;

  // Try cache first
  const cached = await cacheGet(cacheKey);
  if (cached) {
    log.debug({ query, category }, "SearXNG cache HIT");
    try {
      return JSON.parse(cached) as SearxngResult[];
    } catch {
      // Corrupted cache entry — continue to API
    }
  }

  // Cache miss — hit SearXNG API
  try {
    const url = `${SEARXNG_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&language=id&categories=${category}`;
    const { signal, cleanup } = createAbortTimeout(TIMEOUT_MS);

    const response = await fetch(url, {
      signal,
      headers: {
        Accept: "application/json",
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      },
    });
    cleanup();

    if (!response.ok) {
      log.warn({ status: response.status, query }, "SearXNG search failed");
      return [];
    }

    const data = (await response.json()) as {
      results?: Array<{ title?: string; url?: string; content?: string }>;
    };
    const results = data.results ?? [];
    const mapped = results.slice(0, MAX_RESULTS).map((r) => ({
      title: r.title ?? "",
      url: r.url ?? "",
      snippet: (r.content ?? "").slice(0, 500),
    }));

    // Store in cache (fire and forget — don't block on write)
    cacheSet(cacheKey, JSON.stringify(mapped), CACHE_TTL);

    log.debug({ query, category, resultCount: mapped.length }, "SearXNG search OK");
    return mapped;
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err), query },
      "SearXNG search error",
    );
    return [];
  }
}

// ---------------------------------------------------------------------------
// Query extraction
// ---------------------------------------------------------------------------

/**
 * Extract meaningful search queries from message content.
 * Uses multiple strategies to find terms worth searching.
 * Returns up to 3 clean queries.
 */
export function extractSearchQueries(content: string): string[] {
  const queries = new Set<string>();

  // 1. Quoted phrases (explicit user intent)
  const quotedPhrases = content.match(/"([^"]+)"|'([^']+)'/g);
  if (quotedPhrases) {
    for (const phrase of quotedPhrases) {
      const clean = phrase.replace(/["']/g, "").trim();
      if (clean.length >= 3) queries.add(clean);
    }
  }

  // 2. "nonton X" pattern — extract the title
  const nontonMatch = content.match(
    /\b(nonton|tonton|rekomen|cari|search|google)\s+(.+?)(?:\s+(?:anime|kartun|film|movie|series|serial))?\s*[!?.]*$/i,
  );
  if (nontonMatch) {
    const title = nontonMatch[2].trim();
    if (title.length >= 2 && title.length <= 80) {
      queries.add(title);
    }
  }

  // 3. "X anime/film" pattern — title before category
  const titleBeforeCategory = content.match(
    /\b(\w[\w\s]{2,40})\s+(?:anime|kartun|film|movie|series|serial)\b/i,
  );
  if (titleBeforeCategory) {
    const title = titleBeforeCategory[1].trim();
    if (title.length >= 3 && !/^(yang|yang|sama|dari|untuk|ini|itu|ada)$/i.test(title)) {
      queries.add(title);
    }
  }

  // 4. Standalone proper nouns (2+ words, capitalized) that look like titles
  const properNouns = content.match(
    /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,4})\b/g,
  );
  if (properNouns) {
    for (const noun of properNouns) {
      // Skip common non-title proper nouns
      const skip = /^(Discord|YouTube|Google|Facebook|Instagram|Twitter|Github|ChatGPT|OpenAI|Claude|Telegram|WhatsApp|TikTok|Netflix|Spotify|Steam|Instagram)$/i;
      if (!skip.test(noun) && noun.length >= 5) {
        queries.add(noun);
      }
    }
  }

  // 5. Terms that suggest research intent
  const researchTerms = content.match(
    /\b(apa\s+(?:itu|sih)|what\s+is|siapa\s+itu|who\s+is|arti|meaning|definisi|definition)\s+(.{3,60})/i,
  );
  if (researchTerms) {
    const term = researchTerms[2].trim().replace(/[?!.]+$/, "");
    if (term.length >= 3) queries.add(term);
  }

  return Array.from(queries).slice(0, 3);
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/**
 * Format SearXNG results as XML for LLM context.
 */
export function formatSearchResults(results: SearxngResult[]): string {
  if (results.length === 0) return "";
  const lines = results.map(
    (r) =>
      `  <result title="${escapeXml(r.title)}">${escapeXml(r.snippet)}</result>`,
  );
  return `<web_search>\n${lines.join("\n")}\n</web_search>`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
