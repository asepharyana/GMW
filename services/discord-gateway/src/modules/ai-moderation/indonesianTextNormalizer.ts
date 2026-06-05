// No imports needed — pure rule-based, no external dependencies.

const CUSTOM_EMOJI_PATTERN = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;

/**
 * In-memory cache TTL (10 min) — avoids re-scanning identical text.
 */
const BADWORD_CACHE_TTL_MS = 10 * 60 * 1000;

interface BadwordCacheEntry {
  value: string[];
  expiresAt: number;
}

const badwordCache = new Map<string, BadwordCacheEntry>();

// ---------------------------------------------------------------------------
// Safe pattern pre-filter — short-circuits definitively safe messages.
// Conservative: only returns true for patterns that CANNOT be violations.
// ---------------------------------------------------------------------------

const SAFE_PATTERNS: Array<{
  test: (text: string) => boolean;
  reason: string;
}> = [
  {
    test: (t) =>
      /^(wkwk+|w+kw+k+|wkwkw+|haha+|hehe+|hihi+|huhu+|xixi+|wakak+|awkwa+)$/i.test(
        t,
      ),
    reason: "laughter pattern",
  },
  {
    test: (t) =>
      /^(ok|oke|okay|sip|siap|aman|mantap|gas|gass|gaskeun|santuy|gaskan|lah|wih|wah|eh|nah|loh|hmm|hm|heh)$/i.test(
        t,
      ),
    reason: "single-word affirmative",
  },
  {
    test: (t) =>
      /^(hai|halo|hello|hi|oi|woy|woi|pagi|siang|sore|malam|mlm|p|w|L|F|gws|thx|thks|makasih|ty|thanks|yw|sama-sama|ok sip|ok bang|siap bang)$/i.test(
        t,
      ),
    reason: "greeting/common expression",
  },
  {
    test: (t) => t.length <= 2,
    reason: "very short message (1-2 chars)",
  },
  {
    test: (t) => /^[\d\s.,!?;:'"()\-_]+$/.test(t),
    reason: "numeric/punctuation only",
  },
];

// ---------------------------------------------------------------------------
// Rule-based Indonesian badword detection (NO LLM calls)
//
// Uses word-boundary regex matching to detect known Indonesian badwords.
// Context-aware: matches only whole words to avoid false positives like
// "asu" in "kasus", "kontol" in "rekontolasi".
//
// Each category maps to a flag the moderation LLM can use as context.
// ---------------------------------------------------------------------------

interface BadwordEntry {
  words: string[];
  flag: string;
  description: string;
}

const BADWORD_CATEGORIES: BadwordEntry[] = [
  {
    description: "vulgar genitalia / sexual terms",
    flag: "vulgar_language",
    words: [
      "kontol",
      "memek",
      "pepek",
      "tempik",
      "peler",
      "pelir",
      "pukimak",
      "pukima",
      "jancok",
      "jancuk",
      "cok",
      "cuk",
      "pantek",
      "palek",
      "ngentot",
      "ngewe",
      "entot",
      "ewe",
      "coli",
      "sange",
      "sangean",
      "ngocok",
      "bangkot",
      "nenen",
      "tete",
      "tetek",
      "dodot",
      "kentu",
      "perek",
      "bispak",
      "bangsat",
      "babi",
      "asu",
      "anjing",
      "anjir",
      "anjirt",
      "njing",
      "njir",
      "anjay",
      "kampret",
      "kampang",
      "brengsek",
      "brengus",
      "bejad",
      "bajingan",
      "goblok",
      "tolol",
      "bego",
      "dungu",
      "idiot",
      "beban",
      "keparat",
      "setan",
      "iblis",
      "sialan",
      "sial",
      "kacang",
      "edan",
      "gila",
      "titten",
      "bitch",
      "whore",
      "slut"
    ],
  },
  {
    description: "harassment / targeted insults",
    flag: "harassment",
    words: [
      "mampus",
      "mati",
      "bunuh",
      "bacot",
      "cupu",
      "geblek",
      "kere",
      "ngawur",
      "sembarangan",
      "nyampah",
      "nyampah",
      "sarap",
      "ke laut aja",
      "gila lu",
      "sinting",
      "editan",
      "mending mati",
      "monyet",
      "kuda",
      "unta",
      "bangke",
      "bangsat",
      "kys",
      "kill yourself"
    ],
  },
  {
    description: "SARA / racial slurs (non-exhaustive)",
    flag: "sara",
    words: [
      "cina",
      "tionghoa",
      "pribumi",
      "non-pribumi",
      "kaffir",
      "kafir",
      "murtad",
      "sesat",
      "liberal",
      "komunis",
      "komunisme",
      "pki",
    ],
  },
  {
    description: "gambling / judi",
    flag: "gambling",
    words: [
      "judi",
      "slot",
      "togel",
      "toto gelap",
      "casino",
      "roulette",
      "poker",
      "domino",
      "gaple",
      "sabung ayam",
      "bola jalan",
      "maxwin",
      "gacor",
      "scatter",
      "bonanza",
      "olympus",
    ],
  },
  {
    description: "hate speech / extreme discrimination",
    flag: "hate_speech",
    words: [
      "bencina",
      "bencin",
      "bangsat",
      "dajjal",
      "laknat",
      "keparat",
      "dasar cina",
      "dasar tionghoa",
      "dasar pribumi",
      "nigger",
      "nigga"
    ],
  },
];

/**
 * Build a single combined regex per category that matches whole words only.
 * Uses word boundaries (\b) so "asu" matches "asu" but not "kasus".
 * For multi-word entries, builds an alternation of the full phrases.
 */
const BADWORD_REGEX_CACHE = new Map<string, RegExp>();

function buildBadwordRegex(words: string[]): RegExp {
  // Sort by length descending so longer phrases match before their substrings
  const sorted = [...words].sort((a, b) => b.length - a.length);
  // Escape regex special chars in each word
  const escaped = sorted.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  const pattern = escaped
    .map((w) => {
      // Multi-word phrases (containing space) — match as-is
      if (w.includes("\\ ")) return w;
      // Single word — word boundaries
      return `\\b${w}\\b`;
    })
    .join("|");
  return new RegExp(pattern, "i");
}

function matchBadwords(text: string): string[] {
  const hits: Set<string> = new Set();
  const lowerText = text.toLowerCase();

  for (const category of BADWORD_CATEGORIES) {
    let regex = BADWORD_REGEX_CACHE.get(category.flag);
    if (!regex) {
      regex = buildBadwordRegex(category.words);
      BADWORD_REGEX_CACHE.set(category.flag, regex);
    }
    if (regex.test(lowerText)) {
      hits.add(category.flag);
    }
  }

  return Array.from(hits);
}

// ---------------------------------------------------------------------------
// Exported utilities
// ---------------------------------------------------------------------------

/**
 * Checks whether a text message is definitively safe and does not need
 * badword detection at all.
 */
export function isDefinitivelySafe(text: string): boolean {
  const { text: normalized } = normalizeDiscordCustomEmoji(text);
  const trimmed = normalized.trim();
  if (trimmed.length === 0) return true;
  return SAFE_PATTERNS.some((p) => p.test(trimmed));
}

export function normalizeDiscordCustomEmoji(text: string): {
  text: string;
  emojiNames: string[];
} {
  const emojiNames: string[] = [];
  const normalized = text.replace(
    CUSTOM_EMOJI_PATTERN,
    (_match, name: string) => {
      emojiNames.push(name);
      return `[emoji:${name}]`;
    },
  );
  return { text: normalized, emojiNames };
}

function normalizeBadwordCacheKey(text: string): string {
  return text.trim().replace(/\s+/g, " ").toLowerCase();
}

function getCachedBadwords(key: string): string[] | null {
  const entry = badwordCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= Date.now()) {
    badwordCache.delete(key);
    return null;
  }
  return [...entry.value];
}

function setCachedBadwords(key: string, value: string[]): void {
  badwordCache.set(key, {
    value: [...new Set(value)],
    expiresAt: Date.now() + BADWORD_CACHE_TTL_MS,
  });

  if (badwordCache.size > 500) {
    const now = Date.now();
    for (const [cacheKey, entry] of badwordCache) {
      if (entry.expiresAt <= now) {
        badwordCache.delete(cacheKey);
      }
    }
    if (badwordCache.size > 500) {
      const oldestKeys = Array.from(badwordCache.entries())
        .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
        .slice(0, badwordCache.size - 500)
        .map(([cacheKey]) => cacheKey);
      for (const cacheKey of oldestKeys) {
        badwordCache.delete(cacheKey);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// PURE RULE-BASED badword detection (synchronous, no LLM calls)
// ---------------------------------------------------------------------------

/**
 * Detect badwords in text using pure rule-based matching.
 *
 * Previously used a 3-tier pipeline (in-memory → DB → LLM API call) that
 * caused N+1 LLM calls per batch, multiplying costs by ~10x.
 *
 * Now uses word-boundary regex matching against known Indonesian badword
 * categories. Fully synchronous — no DB, no API, no async overhead.
 *
 * Cache retained as a simple in-memory LRU for repeated identical texts.
 */
export function detectIndonesianBadwords(text: string): string[] {
  const cacheKey = normalizeBadwordCacheKey(text);

  // ── In-memory cache (fastest) ──
  const cached = getCachedBadwords(cacheKey);
  if (cached) return cached;

  // ── Safe pre-filter ──
  if (isDefinitivelySafe(text)) {
    setCachedBadwords(cacheKey, []);
    return [];
  }

  // ── Rule-based matching ──
  const hits = matchBadwords(text);
  setCachedBadwords(cacheKey, hits);
  return hits;
}

// ---------------------------------------------------------------------------
// Synchronous evidence builders (no async needed anymore)
// ---------------------------------------------------------------------------

export interface ModerationTextEvidence {
  raw: string;
  normalized: string;
  notes: string[];
  badwords: string[];
  hasBadwords: boolean;
}

export function buildModerationTextEvidence(
  text: string,
): ModerationTextEvidence {
  const emojiNormalized = normalizeDiscordCustomEmoji(text);
  const badwordHits = detectIndonesianBadwords(emojiNormalized.text);
  const notes: string[] = [];

  for (const emojiName of emojiNormalized.emojiNames) {
    notes.push(
      `emoji:${emojiName}=Discord custom emoji/expression; not text offense by default`,
    );
  }

  if (badwordHits.length > 0) {
    notes.push(`Known badword detected: ${badwordHits.join(", ")}`);
  } else {
    notes.push("no known badword detected");
  }

  return {
    raw: text,
    normalized: emojiNormalized.text,
    notes: Array.from(new Set(notes)),
    badwords: badwordHits,
    hasBadwords: badwordHits.length > 0,
  };
}

export function formatModerationTextEvidenceForPrompt(text: string): string {
  const evidence = buildModerationTextEvidence(text);
  if (evidence.normalized === evidence.raw && evidence.notes.length === 0) {
    return "";
  }

  return [
    `[normalized_text: ${evidence.normalized}]`,
    evidence.notes.length > 0
      ? `[normalization_notes: ${evidence.notes.join("; ")}]`
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}
