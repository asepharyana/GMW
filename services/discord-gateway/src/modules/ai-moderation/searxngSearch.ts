import Redis from "ioredis";
import { createChildLogger } from "@bete/shared/logger";
import { createAbortControllerWithTimeout } from "@bete/shared/utils";

const log = createChildLogger("searxng-search");

const SEARXNG_BASE_URL = "https://searxng.imrnes.team";
const MAX_RESULTS = 3;
const TIMEOUT_MS = 8000;
const CACHE_TTL = 86400; // 24 hours
const CACHE_PREFIX = "searxng:";

let redis: Redis | null = null;

/**
 * Initialize Redis connection for SearXNG cache.
 * Safe to call multiple times — only creates one connection.
 */
export function initSearxngCache(redisUrl: string): void {
  if (redis) return;
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
    log.warn({ err: err.message }, "SearXNG Redis cache error");
  });
  redis.connect().catch(() => {
    log.warn("SearXNG Redis cache unavailable — falling back to no-cache");
    redis = null;
  });
  log.info("SearXNG Redis cache initialized");
}

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
  if (redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        log.debug({ query, category }, "SearXNG cache HIT");
        return JSON.parse(cached) as SearxngResult[];
      }
    } catch {
      // Cache read failed, continue to API
    }
  }

  // Cache miss — hit SearXNG API
  try {
    const url = `${SEARXNG_BASE_URL}/search?q=${encodeURIComponent(query)}&format=json&language=id&categories=${category}`;
    const { controller, clear } = createAbortControllerWithTimeout(TIMEOUT_MS);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        },
      });

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
      if (redis) {
        redis.setex(cacheKey, CACHE_TTL, JSON.stringify(mapped)).catch(() => {
          // Cache write failed silently
        });
      }

      log.debug({ query, category, resultCount: mapped.length }, "SearXNG search OK");
      return mapped;
    } finally {
      clear();
    }
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err), query },
      "SearXNG search error",
    );
    return [];
  }
}

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
