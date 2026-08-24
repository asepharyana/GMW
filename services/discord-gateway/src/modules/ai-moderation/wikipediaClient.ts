/**
 * wikipediaClient.ts
 *
 * Wikipedia adapter for AI analysis context enrichment.
 *
 * Replaces the old SearXNG web-search dependency (removed). Instead of a
 * meta-search instance, we talk to the public Wikipedia REST + Action APIs
 * directly with native `fetch` — no extra npm dependency, full control, and
 * a stable, well-documented endpoint.
 *
 * Layer exposed to the moderation pipeline:
 *   WikipediaClient
 *   ├── search()        → list(query)             (Action API: opensearch-like)
 *   ├── getSummary()    → summary(title)          (REST summary endpoint)
 *   └── (page content)  → page(title)  [reserved]
 *
 * The functions below are thin wrappers matching the old consumer surface so
 * call sites change as little as possible.
 */

import { createChildLogger } from "@/shared/logger/index";
import { createAbortControllerWithTimeout } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import { cacheGet, cacheSet, makeCacheKey } from "./cacheStore.js";

const log = createChildLogger("wikipedia-client");

const WIKIPEDIA_LANG = config.WIKIPEDIA_LANG.toLowerCase();
const MAX_RESULTS = 3;
const DEFAULT_TIMEOUT_MS = config.WIKIPEDIA_TIMEOUT_MS;

/** Canonical article URL for a title in the active wiki language. */
export function wikipediaPageUrl(title: string): string {
  return `https://${WIKIPEDIA_LANG}.wikipedia.org/wiki/${encodeURIComponent(
    title.trim().replace(/ /g, "_"),
  )}`;
}

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

function buildUserAgent(): string {
  return "GMWBeta/1.0 (https://github.com/asepharyana; Discord moderation bot)";
}

function stripHtml(snippet: string): string {
  return snippet
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

/** Redis TTL for cached search results (6h — articles change slowly). */
const SEARCH_CACHE_TTL_SECONDS = 6 * 60 * 60;

/**
 * Search Wikipedia for a query and return up to MAX_RESULTS structured hits.
 * Uses the Action API `list=search` (srsearch) which is stable and returns
 * title + HTML snippet. Graceful: returns [] on any failure.
 *
 * Cached in the shared Redis store: the same query recurs across batches
 * (repeat slang, recurring topics), and an uncached re-search per batch was
 * pure latency + Wikipedia rate-limit pressure. Only NON-EMPTY results are
 * cached — an empty result may be a transient limiter/network blip, so it is
 * retried on a later batch instead of being pinned for 6 hours.
 */
export async function wikipediaSearch(
  query: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SearchResult[]> {
  const q = query.trim();
  if (!q) return [];

  const cacheKey = makeCacheKey("wikisearch", q);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as SearchResult[];
      if (Array.isArray(parsed) && parsed.length > 0) {
        log.debug({ query: q }, "Wikipedia search cache HIT");
        return parsed;
      }
    } catch {
      // Malformed entry — fall through to live fetch.
    }
  }

  const mapped = await wikipediaSearchLive(q, timeoutMs);
  if (mapped.length > 0) {
    cacheSet(cacheKey, JSON.stringify(mapped), SEARCH_CACHE_TTL_SECONDS);
  }
  return mapped;
}

/** Live (uncached) Action API search. Returns [] on any failure. */
async function wikipediaSearchLive(
  q: string,
  timeoutMs: number,
): Promise<SearchResult[]> {
  const params = new URLSearchParams({
    action: "query",
    list: "search",
    srsearch: q,
    srlimit: String(MAX_RESULTS),
    format: "json",
    origin: "*",
  });
  const { controller, clear } = createAbortControllerWithTimeout(timeoutMs);

  try {
    const res = await fetch(
      `https://${WIKIPEDIA_LANG}.wikipedia.org/w/api.php?${params.toString()}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": buildUserAgent(),
        },
      },
    );

    if (!res.ok) {
      log.warn({ status: res.status, query: q }, "Wikipedia search failed");
      return [];
    }

    const data = (await res.json()) as {
      query?: { search?: Array<{ title: string; snippet?: string }> };
    };
    const hits = data.query?.search ?? [];
    const mapped = hits.slice(0, MAX_RESULTS).map((h) => ({
      title: h.title,
      url: wikipediaPageUrl(h.title),
      snippet: stripHtml(h.snippet ?? "").slice(0, 500),
    }));

    log.debug({ query: q, resultCount: mapped.length }, "Wikipedia search OK");
    return mapped;
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err), query: q },
      "Wikipedia search error",
    );
    return [];
  } finally {
    clear();
  }
}

/**
 * Fetch the lead summary of a specific Wikipedia article via the REST
 * summary endpoint. Returns null when the article is missing or the request
 * fails. Useful for the term glossary's direct lookups.
 */
export async function wikipediaSummary(
  title: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<SearchResult | null> {
  const t = title.trim();
  if (!t) return null;

  const { controller, clear } = createAbortControllerWithTimeout(timeoutMs);
  try {
    const res = await fetch(
      `https://${WIKIPEDIA_LANG}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(
        t.replace(/ /g, "_"),
      )}`,
      {
        signal: controller.signal,
        headers: {
          Accept: "application/json",
          "User-Agent": buildUserAgent(),
        },
      },
    );

    if (!res.ok) return null;
    const data = (await res.json()) as {
      title?: string;
      extract?: string;
      content_urls?: { desktop?: { page?: string } };
    };
    if (!data.extract) return null;

    return {
      title: data.title ?? t,
      url: data.content_urls?.desktop?.page ?? wikipediaPageUrl(t),
      snippet: data.extract.slice(0, 500),
    };
  } catch (err) {
    log.warn(
      { error: err instanceof Error ? err.message : String(err), title: t },
      "Wikipedia summary error",
    );
    return null;
  } finally {
    clear();
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
    if (
      title.length >= 3 &&
      !/^(yang|yang|sama|dari|untuk|ini|itu|ada)$/i.test(title)
    ) {
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
      const skip =
        /^(Discord|YouTube|Google|Facebook|Instagram|Twitter|Github|ChatGPT|OpenAI|Claude|Telegram|WhatsApp|TikTok|Netflix|Spotify|Steam|Instagram)$/i;
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
 * Format Wikipedia results as XML for LLM context.
 */
export function formatSearchResults(results: SearchResult[]): string {
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
