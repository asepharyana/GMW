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
 * look each one up on Wikipedia via SearXNG, and inject the definitions into
 * the LLM prompt as a `<term_glossary>` block so verdicts are based on facts
 * instead of guesses.
 *
 * Cost control & persistence:
 *  - successfully resolved definitions are PERSISTED PERMANENTLY in Postgres
 *    (`term_glossary_cache`) — definitions rarely change, so a resolved term
 *    is never searched again; only misses stay ephemeral (Redis/LRU, 1h);
 *  - in-memory LRU + Redis (shared with the SearXNG cache) sit in front of
 *    the DB as fast read caches, so repeat lookups are effectively free;
 *  - lookups per batch are bounded (AI_GLOSSARY_MAX_TERMS);
 *  - live SearXNG calls are rate-limit aware: concurrency 2 + stagger, retry
 *    once on empty results, and misses cached for only 1h so a limiter/
 *    network blip is not treated as a permanent miss;
 *  - only results that read like actual definitions are accepted (Wikipedia
 *    preferred; disambiguation/ads/translate-homepages rejected);
 *  - everything degrades gracefully: no Redis, no SearXNG, no match
 *    → the block is simply omitted and moderation proceeds as before.
 */

import { LRUCache } from "lru-cache";
import pLimit from "p-limit";
import { createChildLogger } from "@/shared/logger/index";
import { delay } from "@/shared/utils/index";
import { config } from "../../shared/config/config.js";
import { escapeXml } from "./moderationBuilders.js";
import {
  makeSearxngCacheKey,
  searchSearxng,
  searxngCacheGet,
  searxngCacheSet,
} from "./searxngSearch.js";
import {
  getTermDefinitionFromDb,
  setTermDefinitionInDb,
} from "./termGlossaryStore.js";

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
/** Per-search timeout — keep glossary lookups snappy even on a slow SearXNG. */
const GLOSSARY_SEARCH_TIMEOUT_MS = 5000;
/** Delay before retrying a search that returned zero results. */
const RETRY_DELAY_MS = 350;
/** Max definition snippet length kept in the prompt. */
const MAX_DEFINITION_CHARS = 300;
/**
 * SearXNG rate-limits aggressive parallel bursts (returns 200 with empty
 * results). Never fire all terms at once — cap live searches at 2 concurrent
 * and stagger the start times slightly.
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

/** Serializes live SearXNG lookups (rate-limit aware) with a small stagger. */
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

/** Word tokenizer — letters/digits plus internal -_'· (handles "well-known",
 *  "node_modules", diacritics). */
const WORD_RE = /[\p{L}\p{N}]+(?:[-_'’·][\p{L}\p{N}]+)*/gu;

/** Removes URLs, Discord mentions/custom emoji, code fences, markdown noise. */
function cleanContent(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/<#\d+>/g, " ")
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/[`*_~|>[\]]/g, " ")
    .replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Filters out tokens that are useless as glossary candidates (numbers,
 *  repeated-char noise, mega-tokens). */
function isNoiseWord(word: string): boolean {
  if (word.length > 28) return true;
  if (/^\d+$/.test(word)) return true;
  const lower = word.toLowerCase();
  // "aaaa…", "wwwwww" — single repeated character
  if (/^(.)\1{2,}$/.test(lower)) return true;
  // "wkwk", "hehe", "69" alternations — repeated 2–3 char base. "meme" is
  // the one legit 4-letter word this matches; it is whitelisted below.
  if (/^([a-z]{2,3})\1{1,}$/.test(lower)) return true;
  return false;
}

/** Deterministic bonus for words that look like proper nouns or foreign. */
function scoreWord(word: string): number {
  let score = 1;
  // Capitalized first letter (proper noun / title) but not ALL-CAPS acronyms
  if (/^[A-Z]/.test(word) && !/^[A-Z]{2,}$/.test(word)) score += 3;
  // Contains a letter outside basic latin → regional/foreign spelling
  if (/[\p{L}]/u.test(word.replace(/[A-Za-z]/g, ""))) score += 2;
  // Contains an internal apostrophe or hyphen → likely a named entity
  if (/[-_'’·]/.test(word)) score += 2;
  return score;
}

const STOPWORDS = new Set(
  // ── Bahasa Indonesia ────────────────────────────────────────────────
  (
    " yang dan di ke dari ini itu dengan untuk pada dalam adalah akan telah sudah bisa dapat harus tidak juga saya kamu kita kami mereka dia aku kau gua lu lo gw gue elu anda kalian nya kah lah pun ya yah kan sih dong deh kok loh toh aja saja gitu gini begitu begini tapi tetapi namun atau karena sebab jika kalau bila maka supaya agar meski meskipun walau walaupun ketika saat setelah sebelum selama antara terhadap tentang mengenai bagi oleh secara sebagai seperti daripada tanpa hingga sampai sejak menuju bahwa padahal sebenarnya sepertinya mungkin memang jadi lalu terus akhirnya misalnya contohnya banyak sedikit semua seluruh setiap tiap beberapa ada bukan jangan boleh mau ingin pengen nggak ngak gak ga kagak ngga ndak nanti kemarin besok hari ini sekarang waktu itu masih sedang belum pernah sering selalu kadang jarang cepat lambat awal akhir baru lama besar kecil tinggi rendah panjang pendek baik buruk benar salah sama beda penting biasanya selamat terima kasih makasih sangat sekali paling cuma cuman hanya lebih kurang sekitar hampir ternyata rupanya begitu gimana bagaimana kenapa mengapa siapa apa mana kapan darimana kemana bilang ngomong omong kata tadi dulu terus lagi tetap pasti seharusnya sebaiknya seakan seolah kayaknya keliatan kelihatan ketahuan disini disitu disana kesini kesana bener pake pakai kayak emang lagian mulu istilah istilahnya banget" +
    // ── English ───────────────────────────────────────────────────────
    " the a an and or but if then else for to in on at by with without from of is are was were be been being have has had do does did will would can could should may might must shall this that these those it its i you he she we they them their there here when where why how what which who whom whose only very just about above after before below under over into onto within upon against between among during through across along around behind beyond near off out up down now then so as not no yes ok okay" +
    // ── Common net slang / acronyms the LLM already knows ──────────────
    " lol omg wtf idk btw tbh imo aka fyi nsfw smh nvm asap afk brb gg wp ty np mb sry thx kk oke okk ygy frfr"
  ).split(/\s+/),
);

/**
 * Words that are either already defined by the moderation rules, or are so
 * common (brands, tech vocabulary, project names) that a Wikipedia lookup is
 * a guaranteed miss/waste. Keeps the glossary focused on genuinely unknown
 * terms.
 */
const KNOWN_SAFE_TERMS = new Set(
  (
    "discord youtube google facebook instagram twitter tiktok whatsapp telegram netflix spotify steam github gitlab bitbucket chatgpt openai anthropic claude deepseek gemini llama copilot cursor vscode vscodium jetbrains intellij pycharm webstorm sublime codeblocks" +
    " docker kubernetes k8s linux ubuntu debian arch fedora manjaro kali windows macos android ios chrome firefox safari edge opera brave" +
    " react nextjs next vue svelte angular node nodejs deno bun pnpm yarn npm javascript typescript python golang go rust java kotlin swift cplusplus cpp css html json xml yaml toml regex backend frontend database mysql postgres postgresql mongodb redis qdrant sqlite nosql graphql rest websocket webhook" +
    " bug crash error debug fix issue pr merge commit push pull branch main master dev staging production server client app website web browser" +
    " stream streaming video audio voice call camera screen share screenshare gameplay gaming game play steam epic xbox playstation nintendo switch console" +
    " bot discordbot moderation moderator admin member user profile avatar channel server guild message chat dm reply forward embed sticker emoji role permission" +
    " meme code coding ngoding programmer program developer engineer software hardware cpu gpu ram rom storage disk network internet wifi lan ip dns vpn proxy cloud aws azure gcp vercel netlify heroku railway render vps hosting domain ssl login logout register account password email username" +
    " anime manga waifu husbando tsundere moe otaku wibu weeb otome isekai shonen seinen josei manga manhwa manhua doujin" +
    " anjay wkwk wkwkwk gws gaskeun santuy njir baka woy woi hadeh astaga asu anjing bangsat ngehe asal alay lebay caper mabar" +
    " asus bete imphnen impnhen ngab" +
    " syahadat sholat shalat solat puasa zakat haji umrah doa tuhan nabi allah yesus muhammad hashem" +
    " loli shota incest exhibition furry fursuit cosplay costume" +
    " gaza palestine israel yahudi yahud israel palestina israeli" +
    " hokkian mandarin arabic jawa sunda betawi minang bugis batak melayu inggris indonesia"
  ).split(/\s+/),
);

function isKnownTerm(word: string): boolean {
  return STOPWORDS.has(word) || KNOWN_SAFE_TERMS.has(word);
}

/** True when a quoted phrase is mostly filler words (skip it). */
function isMostlyStopwords(phrase: string): boolean {
  const words = phrase
    .toLowerCase()
    .split(/[^a-zà-öø-ÿ]+/i)
    .filter(Boolean);
  if (words.length === 0) return true;
  const stopCount = words.filter((w) => STOPWORDS.has(w)).length;
  return stopCount / words.length >= 0.6;
}

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
// Definition lookup (cached: LRU → Redis → SearXNG/Wikipedia)
// ---------------------------------------------------------------------------

export interface TermDefinition {
  term: string;
  definition: string;
  sourceUrl: string;
}

/** Definition-like markers for accepting a non-Wikipedia search result. */
const DEF_MARKERS =
  /adalah|merupakan|istilah (?:untuk|yang|yg)|artinya|sebutan|berarti|refers? to|known as|also called|short for|a term (?:for|used)|istilah dalam|kata (?:asing|serapan)? ?untuk/i;

/** True when the term appears in the result text (or a 4+ char word in the
 *  result is part of the term). Lenient — "kafircel" matches a "Kafir"
 *  article via substring, while a Google-Translate homepage snippet does not. */
function hasTermOverlap(term: string, title: string, snippet: string): boolean {
  const termLower = term.toLowerCase();
  const text = `${title} ${snippet}`.toLowerCase();
  if (text.includes(termLower)) return true;
  const words = text.match(/[a-z0-9]{4,}/gi) ?? [];
  return words.some((w) => termLower.includes(w));
}

/** Quality gate: is this result good enough to quote as a definition? */
function isUsableDefinition(
  r: { title: string; url: string; snippet: string },
  term: string,
  isWiki: boolean,
): boolean {
  const text = `${r.title} ${r.snippet}`;
  // Wikipedia disambiguation pages are not definitions
  if (/disambiguasi|disambiguation/i.test(text)) return false;
  if ((r.snippet ?? "").trim().length < 25) return false;
  if (!hasTermOverlap(term, r.title, r.snippet)) return false;
  // Wikipedia articles are accepted with just the overlap+length gate;
  // everything else must read like an actual definition, not an ad,
  // a translate homepage, or a navigation blurb.
  if (isWiki) return true;
  return DEF_MARKERS.test(r.snippet);
}

/** Picks the best definition from search results, preferring a genuine
 *  Wikipedia article; otherwise the first result that reads like a
 *  definition. Returns null when nothing qualifies. */
function pickDefinition(
  results: Array<{ title: string; url: string; snippet: string }>,
  term: string,
): TermDefinition | null {
  const wiki = results.find((r) => /wikipedia\.org/i.test(r.url));
  const best = wiki && isUsableDefinition(wiki, term, true) ? wiki : null;
  if (!best) {
    for (const r of results) {
      if (isUsableDefinition(r, term, false)) {
        return buildDefinition(r, term);
      }
    }
    return null;
  }
  return buildDefinition(best, term);
}

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

/** Live (network) lookup — runs under the shared SearXNG rate-limit gate. */
async function fetchDefinitionLive(
  term: string,
  key: string,
  cacheKey: string,
): Promise<TermDefinition | null> {
  return liveSearchLimit(async () => {
    await acquireLiveSlot();
    try {
      let results = await searchSearxng(
        key,
        "general",
        undefined,
        GLOSSARY_SEARCH_TIMEOUT_MS,
      );
      let def = pickDefinition(results, term);
      // Zero results is usually the limiter kicking in, not a real miss —
      // retry once. Results-but-unusable = genuine miss, no retry.
      if (!def && results.length === 0) {
        await delay(RETRY_DELAY_MS);
        results = await searchSearxng(
          key,
          "general",
          undefined,
          GLOSSARY_SEARCH_TIMEOUT_MS,
        );
        def = pickDefinition(results, term);
      }

      if (def) {
        // Persist permanently (definitions rarely change) — best-effort,
        // then warm the fast caches.
        void setTermDefinitionInDb(key, def.definition, def.sourceUrl);
        searxngCacheSet(
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
    searxngCacheSet(cacheKey, EMPTY_SENTINEL, MISS_TTL_SECONDS);
    termLru.set(key, NOT_FOUND, { ttl: MISS_TTL_MS });
    return null;
  });
}

/** Resolve one term: LRU → Redis → Postgres (permanent) → live SearXNG
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
  const cacheKey = makeSearxngCacheKey("def", key);
  const cached = await searxngCacheGet(cacheKey);
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
    searxngCacheSet(
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
