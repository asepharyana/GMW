/**
 * termGlossary.ts
 *
 * Per-word "kamus" enrichment for LLM moderation.
 *
 * Problem: the moderation LLM often meets words it does not know — regional
 * slang (Jawa/Sunda), foreign terms, niche anime/game jargon, or obscure
 * technical vocabulary. When it guesses, it either invents a wrong meaning
 * (false positive on a safe word) or misses a violation hidden in unfamiliar
 * wording (false negative on an unknown vulgar/slang term).
 *
 * Solution: extract candidate "unknown-looking" words from message content,
 * look each one up on Wikipedia via the Wikipedia REST/Action APIs, and inject
 * the definitions into the LLM prompt as a `<term_glossary>` block so verdicts
 * are based on facts instead of guesses.
 *
 * Cost control & persistence:
 *  - successfully resolved definitions are PERSISTED PERMANENTLY in Postgres
 *    (`term_glossary_cache`) — definitions rarely change, so a resolved term
 *    is never searched again; only misses stay ephemeral (Redis/LRU, 1h);
 *  - in-memory LRU + Redis (shared cache store) sit in front of
 *    the DB as fast read caches, so repeat lookups are effectively free;
 *  - lookups per batch are bounded (AI_GLOSSARY_MAX_TERMS);
 *  - live Wikipedia calls are rate-limit aware: concurrency 2 + stagger, retry
 *    once on empty results, and misses cached for only 1h so a limiter or
 *    network blip is not treated as a permanent miss;
 *  - only results that read like actual definitions are accepted (Wikipedia
 *    preferred; disambiguation/ads/translate-homepages rejected);
 *  - everything degrades gracefully: no Redis, no Wikipedia API, no match
 *    → the block is simply omitted and moderation proceeds as before.
 */

import { LRUCache } from "lru-cache";
import pLimit from "p-limit";
import { createChildLogger } from "@/shared/logger/index";
import { delay } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import { cacheGet, cacheSet, makeCacheKey } from "./cacheStore.js";
import { escapeXml } from "./moderationBuilders.js";
import {
  getTermDefinitionFromDb,
  setTermDefinitionInDb,
} from "./termGlossaryStore.js";
import {
  cleanContent,
  isKnownTerm,
  isMostlyStopwords,
  isNoiseWord,
  scoreWord,
  WORD_RE,
} from "./textSignals.js";
import { wikipediaSummary } from "./wikipediaClient.js";

const log = createChildLogger("term-glossary");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Redis TTL for a successfully resolved definition (definitions are stable). */
const DEF_TTL_SECONDS = 7 * 24 * 60 * 60;
/**
 * Redis TTL for a lookup that found nothing. Kept SHORT (1h): SearXNG
 * instances silently return empty result sets when rate-limited, so an empty
 * response is often a transient failure, not a real miss. A short TTL lets
 * the term be retried on a later batch instead of poisoning it for a day.
 */
const MISS_TTL_SECONDS = 60 * 60;
const MISS_TTL_MS = MISS_TTL_SECONDS * 1000;
/** Sentinel stored in caches for "term has no resolvable definition". */
const EMPTY_SENTINEL = "__not_found__";
/** Delay before retrying a search that returned zero results. */
const RETRY_DELAY_MS = 350;
/** Max definition snippet length kept in the prompt. */
const MAX_DEFINITION_CHARS = 300;
/**
 * Wikipedia can be flaky under aggressive parallel bursts. Never fire all
 * terms at once — cap live lookups at 2 concurrent and stagger the start times.
 */
const LIVE_SEARCH_CONCURRENCY = 2;
const LIVE_SEARCH_STAGGER_MS = 250;

/** In-memory cache: term (lowercase) → definition | NOT_FOUND sentinel. */
const NOT_FOUND: TermDefinition = {
  term: "__not_found__",
  definition: "",
  sourceUrl: "",
};
const termLru = new LRUCache<string, TermDefinition>({
  max: 2000,
  ttl: 24 * 60 * 60 * 1000,
});

/** Serializes live Wikipedia lookups (rate-limit aware) with a small stagger. */
const liveSearchLimit = pLimit(LIVE_SEARCH_CONCURRENCY);
let lastLiveSearchAt = 0;
async function acquireLiveSlot(): Promise<void> {
  const now = Date.now();
  const wait = lastLiveSearchAt + LIVE_SEARCH_STAGGER_MS - now;
  if (wait > 0) await delay(wait);
  lastLiveSearchAt = Date.now();
}

// ---------------------------------------------------------------------------
// Term extraction
// ---------------------------------------------------------------------------
// Tokenizer, stopword/known-term filters, and word scoring now live in
// textSignals.ts (2026-08-31) — shared with wikipediaClient.ts's search-query
// extractor so both use the exact same "is this word worth looking up"
// signals instead of two divergent copies.

export interface ExtractGlossaryOptions {
  maxTerms?: number;
  minWordLength?: number;
}

/**
 * Extracts candidate terms that the LLM might not know from message content.
 * Returns at most `maxTerms` terms (default from config), scored by how
 * "unknown-looking" they are (proper nouns, foreign spelling, quoted phrases).
 */
export function extractGlossaryTerms(
  contents: string[],
  options: ExtractGlossaryOptions = {},
): string[] {
  const maxTerms = options.maxTerms ?? config.AI_GLOSSARY_MAX_TERMS;
  const minWordLength =
    options.minWordLength ?? config.AI_GLOSSARY_MIN_WORD_LENGTH;

  const candidates = new Map<string, { word: string; score: number }>();

  const push = (rawWord: string, score: number): void => {
    const clean = rawWord
      .trim()
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
    if (clean.length < minWordLength) return;
    const key = clean.toLowerCase();
    if (isKnownTerm(key) || isNoiseWord(clean)) return;
    const existing = candidates.get(key);
    if (existing) {
      existing.score += score + 1;
    } else {
      candidates.set(key, { word: clean, score });
    }
  };

  for (const content of contents) {
    if (!content) continue;
    const cleaned = cleanContent(content);
    if (!cleaned) continue;

    // Quoted phrases — explicit terms the user called out
    for (const m of cleaned.matchAll(/"([^"]{2,80})"/g)) {
      const phrase = m[1].trim();
      const wordCount = phrase.split(/\s+/).length;
      if (wordCount >= 2 && wordCount <= 6 && !isMostlyStopwords(phrase)) {
        push(phrase, 10);
      }
    }

    // Individual words
    for (const m of cleaned.matchAll(WORD_RE)) {
      const w = m[0];
      if (w.length < minWordLength) continue;
      if (isNoiseWord(w)) continue;
      const key = w.toLowerCase();
      if (isKnownTerm(key)) continue;
      push(w, scoreWord(w));
    }
  }

  return Array.from(candidates.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, maxTerms)
    .map((c) => c.word);
}

// ---------------------------------------------------------------------------
// ─── Definition lookup (cached: LRU → Redis → Wikipedia) ───────────────────
// ---------------------------------------------------------------------------

export interface TermDefinition {
  term: string;
  definition: string;
  sourceUrl: string;
}

/** Per-search timeout — keep glossary lookups snappy even on a slow Wikipedia. */
const GLOSSARY_SEARCH_TIMEOUT_MS = 5000;

function buildDefinition(
  best: { title: string; url: string; snippet: string },
  term: string,
): TermDefinition {
  const snippet = (best.snippet || best.title || "").trim();
  const definition =
    snippet.length > MAX_DEFINITION_CHARS
      ? `${snippet.slice(0, MAX_DEFINITION_CHARS - 1).trimEnd()}…`
      : snippet;
  return { term, definition, sourceUrl: best.url };
}

/** Live (network) lookup — runs under the shared Wikipedia rate-limit gate. */
async function fetchDefinitionLive(
  term: string,
  key: string,
  cacheKey: string,
): Promise<TermDefinition | null> {
  return liveSearchLimit(async () => {
    await acquireLiveSlot();
    try {
      let result = await wikipediaSummary(key, GLOSSARY_SEARCH_TIMEOUT_MS);
      let def = result ? buildDefinition(result, term) : null;
      // Zero result is usually the limiter/network blip, not a real miss —
      // retry once. Result-but-unusable = genuine miss, no retry.
      if (!def) {
        await delay(RETRY_DELAY_MS);
        result = await wikipediaSummary(key, GLOSSARY_SEARCH_TIMEOUT_MS);
        def = result ? buildDefinition(result, term) : null;
      }

      if (def) {
        // Persist permanently (definitions rarely change) — best-effort,
        // then warm the fast caches.
        void setTermDefinitionInDb(key, def.definition, def.sourceUrl);
        cacheSet(
          cacheKey,
          JSON.stringify({
            definition: def.definition,
            sourceUrl: def.sourceUrl,
          }),
          DEF_TTL_SECONDS,
        );
        termLru.set(key, def);
        log.debug({ term: key }, "Term glossary resolved definition");
        return def;
      }
    } catch (err) {
      log.debug(
        { term: key, error: err instanceof Error ? err.message : String(err) },
        "Term glossary lookup failed — skipping term",
      );
    }

    // No definition — cache the miss with a SHORT TTL so a transient
    // limiter/network failure is retried on a later batch.
    cacheSet(cacheKey, EMPTY_SENTINEL, MISS_TTL_SECONDS);
    termLru.set(key, NOT_FOUND, { ttl: MISS_TTL_MS });
    return null;
  });
}

/** Resolve one term: LRU → Redis → Postgres (permanent) → live Wikipedia
 *  (rate-limited). The fast caches sit in front of the DB; the DB is the
 *  source of truth for successfully resolved definitions. */
async function resolveTerm(term: string): Promise<TermDefinition | null> {
  const key = term.toLowerCase().trim();

  // 1. In-memory LRU — same process, instant
  const lruHit = termLru.get(key);
  if (lruHit) return lruHit === NOT_FOUND ? null : lruHit;

  // 2. Redis — shared across processes/workers. A miss sentinel here is NOT
  //    a definitive answer: it may predate a permanent DB entry written by
  //    another process, so we keep going and let the DB decide.
  const cacheKey = makeCacheKey("def", key);
  const cached = await cacheGet(cacheKey);
  let redisMiss = false;
  if (cached !== null) {
    if (cached === EMPTY_SENTINEL) {
      redisMiss = true;
    } else {
      try {
        const parsed = JSON.parse(cached) as {
          definition?: string;
          sourceUrl?: string;
        };
        if (parsed.definition) {
          const def: TermDefinition = {
            term,
            definition: parsed.definition,
            sourceUrl: parsed.sourceUrl ?? "",
          };
          termLru.set(key, def);
          return def;
        }
      } catch {
        // malformed cache entry — fall through to DB/live
      }
    }
  }

  // 3. Postgres — permanent store for resolved definitions. A hit re-warms
  //    the fast caches so the DB is not hit on every batch.
  const dbDef = await getTermDefinitionFromDb(key);
  if (dbDef) {
    const def: TermDefinition = {
      term,
      definition: dbDef.definition,
      sourceUrl: dbDef.sourceUrl,
    };
    termLru.set(key, def);
    cacheSet(
      cacheKey,
      JSON.stringify({ definition: def.definition, sourceUrl: def.sourceUrl }),
      DEF_TTL_SECONDS,
    );
    log.debug({ term: key }, "Term glossary DB hit");
    return def;
  }

  // 4. Redis already said "miss" recently and the DB has nothing — respect
  //    that instead of hammering SearXNG again within the miss window.
  if (redisMiss) {
    termLru.set(key, NOT_FOUND, { ttl: MISS_TTL_MS });
    return null;
  }

  // 5. Live search (rate-limited + staggered)
  return fetchDefinitionLive(term, key, cacheKey);
}

/**
 * Looks up definitions for a batch of terms, in parallel. Returns a map of
 * term → definition for the terms that resolved. Errors/misses are skipped.
 * Live SearXNG calls are throttled internally (concurrency 2 + stagger).
 */
export async function lookupTermDefinitions(
  terms: string[],
): Promise<Map<string, TermDefinition>> {
  const map = new Map<string, TermDefinition>();
  if (terms.length === 0) return map;

  const results = await Promise.allSettled(terms.map(resolveTerm));
  for (let i = 0; i < terms.length; i++) {
    const r = results[i];
    if (r.status === "fulfilled" && r.value) {
      map.set(r.value.term, r.value);
    }
  }
  return map;
}

// ---------------------------------------------------------------------------
// Prompt formatting
// ---------------------------------------------------------------------------

/**
 * Formats definitions as a `<term_glossary>` XML block for the LLM prompt:
 *
 *   <term_glossary>
 *     <term word="ngab" source="https://…">definisi…</term>
 *   </term_glossary>
 *
 * Returns "" when there are no definitions (the block is then omitted).
 */
export function formatTermGlossary(
  defs: ReadonlyMap<string, TermDefinition>,
): string {
  if (!defs || defs.size === 0) return "";
  const lines = Array.from(defs.values()).map(
    (d) =>
      `  <term word="${escapeXml(d.term)}" source="${escapeXml(d.sourceUrl)}">${escapeXml(d.definition)}</term>`,
  );
  return `<term_glossary>\n${lines.join("\n")}\n</term_glossary>`;
}

// ---------------------------------------------------------------------------
// Convenience: full pipeline
// ---------------------------------------------------------------------------

export interface GlossaryBlockOptions extends ExtractGlossaryOptions {
  enabled?: boolean;
}

/**
 * One-shot helper: extract terms from message contents, look up definitions,
 * and return the formatted `<term_glossary>` block ("" when disabled or no
 * definitions found). Safe to call on every batch — cached lookups make it
 * cheap.
 */
export async function buildTermGlossaryBlock(
  contents: string[],
  options: GlossaryBlockOptions = {},
): Promise<string> {
  const enabled = options.enabled ?? config.AI_GLOSSARY_ENABLED;
  if (!enabled) return "";
  if (contents.length === 0) return "";

  const terms = extractGlossaryTerms(contents, options);
  if (terms.length === 0) return "";

  const defs = await lookupTermDefinitions(terms);
  if (defs.size === 0) return "";

  const block = formatTermGlossary(defs);
  log.debug(
    { terms: terms.length, definitions: defs.size },
    "Term glossary block built",
  );
  return block;
}
