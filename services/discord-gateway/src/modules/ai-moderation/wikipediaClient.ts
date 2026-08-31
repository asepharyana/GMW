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
import {
  cleanContent,
  isKnownTerm,
  isMostlyStopwords,
  scoreWord,
} from "./textSignals.js";

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

export interface ExtractSearchQueryOptions {
  maxQueries?: number;
}

/**
 * Verbs that signal "find/watch/download X" — used only to find a phrase
 * BOUNDARY. Unlike the old version, no trailing category word
 * ("anime|film|series") is required, so coverage isn't capped by an
 * enumerated category list. The capture stops at the first coordinating
 * conjunction (or end of message) so "nonton X sama Y terus Z" yields the
 * single entity X instead of swallowing the whole multi-entity tail into
 * one unsearchable blob.
 */
const SEARCH_INTENT_VERBS =
  /\b(?:nonton|tonton|rekomen(?:dasiin|dasikan)?|cari(?:in|kan)?|search|google|download|donlod|unduh|streaming|baca|dengerin|dengar(?:kan)?)\b\s+(.+?)(?=\s+(?:sama|dan|juga|terus|lalu|atau|and|or)\b|\s*[!?.]*$)/i;

/** "apa itu X" / "arti X" / "what is X" — factual/definition intent. */
const DEFINITION_INTENT =
  /\b(?:apa\s+(?:itu|sih)|what\s+is|siapa\s+itu|who\s+is|arti(?:nya)?|meaning(?:\s+of)?|definisi(?:nya)?|definition(?:\s+of)?)\s+(.{3,80})/i;

/** Multi-word capitalized runs — usually a title/named entity regardless of
 *  surrounding verbs (e.g. "Attack on Titan", "One Piece"). No trigger word
 *  needed at all. */
const PROPER_NOUN_PHRASE = /\b([A-Z][\p{L}]*(?:\s+[A-Z][\p{L}]*){1,4})\b/gu;

interface PhraseCandidate {
  phrase: string;
  score: number;
}

/**
 * Scores a phrase with the SAME per-word signals as the term glossary
 * (proper-noun casing, foreign spelling, hyphenation — see textSignals.ts),
 * plus a bonus for the extraction strategy that surfaced it. Returns null
 * for junk (mostly stopwords, or made entirely of known-safe terms like
 * "Discord"/"Google" — those never need a Wikipedia lookup).
 */
function scorePhrase(rawPhrase: string, bonus: number): PhraseCandidate | null {
  const clean = rawPhrase
    .trim()
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
  if (clean.length < 2 || clean.length > 80) return null;
  if (isMostlyStopwords(clean)) return null;

  const words = clean.split(/\s+/);
  let score = bonus;
  let hasNonStopword = false;
  for (const w of words) {
    if (isKnownTerm(w.toLowerCase())) continue;
    hasNonStopword = true;
    score += scoreWord(w);
  }
  if (!hasNonStopword) return null;

  return { phrase: clean, score };
}

/**
 * Extracts candidate phrases worth searching on Wikipedia — scored by the
 * same word-level signals as the term glossary, instead of requiring an
 * exact match against a fixed, manually-maintained category/brand list.
 * Pure CPU-side regex + scoring — no network or LLM call, so using this
 * more broadly never adds AI requests.
 *
 * Returns up to `maxQueries` phrases (default 3), highest-scored first.
 */
export function extractSearchQueries(
  content: string,
  options: ExtractSearchQueryOptions = {},
): string[] {
  const maxQueries = options.maxQueries ?? 3;
  const cleaned = cleanContent(content);
  if (!cleaned) return [];

  const candidates = new Map<string, PhraseCandidate>();
  const addCandidate = (raw: string, bonus: number): void => {
    const scored = scorePhrase(raw, bonus);
    if (!scored) return;
    const key = scored.phrase.toLowerCase();
    const existing = candidates.get(key);
    if (!existing || scored.score > existing.score) {
      candidates.set(key, scored);
    }
  };

  // 1. Quoted phrases — explicit user intent, strongest signal.
  const quotedPhrases = cleaned.match(/"([^"]{2,80})"|'([^']{2,80})'/g);
  if (quotedPhrases) {
    for (const phrase of quotedPhrases) {
      addCandidate(phrase.replace(/["']/g, ""), 10);
    }
  }

  // 2. Definition/factual intent ("apa itu X", "arti X", "what is X").
  const definitionMatch = cleaned.match(DEFINITION_INTENT);
  if (definitionMatch) {
    addCandidate(definitionMatch[1].replace(/[?!.]+$/, ""), 8);
  }

  // 3. "nonton/cari/rekomen/... X" — phrase after an intent verb.
  const intentMatch = cleaned.match(SEARCH_INTENT_VERBS);
  if (intentMatch) {
    addCandidate(intentMatch[1], 6);
  }

  // 4. Proper-noun phrases anywhere in the message — titles/named entities
  //    surface here even with no trigger verb.
  for (const m of cleaned.matchAll(PROPER_NOUN_PHRASE)) {
    addCandidate(m[1], 0);
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxQueries)
    .map((c) => c.phrase);
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
