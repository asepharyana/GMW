import { createChildLogger } from "@bete/shared/logger";
import { getCachedText, upsertCachedText } from "./textCacheStore.js";
import { llmDetectBadwords } from "./llmClient.js";

const log = createChildLogger("indonesianTextNormalizer");

const CUSTOM_EMOJI_PATTERN = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;

/**
 * In-memory cache TTL (10 min) — fastest path for repeated identical texts.
 */
const BADWORD_CACHE_TTL_MS = 10 * 60 * 1000;

/**
 * DB cache TTL (24 hours) — survives restarts, stores full-text results
 * so context is preserved (e.g. "kaus" is clean, "kau" alone is clean,
 * but "awas kau" is harassment).
 */
const DB_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

interface BadwordCacheEntry {
  value: string[];
  expiresAt: number;
}

const badwordCache = new Map<string, BadwordCacheEntry>();
const inFlightBadwordLookups = new Map<string, Promise<string[]>>();

export interface ModerationTextEvidence {
  raw: string;
  normalized: string;
  notes: string[];
  badwords: string[];
  hasBadwords: boolean;
}

// ---------------------------------------------------------------------------
// Sync helpers
// ---------------------------------------------------------------------------

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
// Two-tier cache + Primary AI pipeline
// ---------------------------------------------------------------------------

/**
 * Detect badwords in text using a **two-tier cache + Primary AI**:
 *
 * 1. **In-memory cache** (BADWORD_CACHE_TTL_MS, 10 min) — fastest path,
 *    keyed by the full normalized text string.
 * 2. **DB cache** (DB_CACHE_TTL_MS, 24 h) — same full-text key, persisted
 *    across restarts. Uses the FULL normalized text (not per-word) because
 *    context matters: "kau" alone is clean, but "awas kau" can be a threat.
 * 3. **Primary AI** (AI_LLM endpoint via llmClient) — only runs when both
 *    cache layers miss.
 *
 * No local hardcoded badword list — all detection goes through AI APIs
 * to eliminate false positives from substring matching.
 */
export async function detectIndonesianBadwords(
  text: string,
): Promise<string[]> {
  const cacheKey = normalizeBadwordCacheKey(text);

  // ── Tier 1: In-memory cache (fastest) ──
  const cached = getCachedBadwords(cacheKey);
  if (cached) {
    return cached;
  }

  // De-duplicate concurrent lookups
  const inFlight = inFlightBadwordLookups.get(cacheKey);
  if (inFlight) {
    return inFlight;
  }

  const lookupPromise = (async () => {
    // ── Tier 2: DB cache (survives restarts, preserves context) ──
    const dbEntry = await getCachedText(cacheKey);
    if (dbEntry) {
      const flags = [...dbEntry.flags];
      setCachedBadwords(cacheKey, flags); // populate in-memory too
      return flags;
    }

    // ── Tier 3: Primary AI only (via centralized llmClient) ──
    let finalHits: string[] = [];
    try {
      finalHits = await llmDetectBadwords(text);
    } catch (error) {
      log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Primary AI badword detection failed",
      );
    }

    // Populate all cache tiers so the same text never triggers another API call
    // within the TTL window.
    setCachedBadwords(cacheKey, finalHits);
    await upsertCachedText(
      cacheKey,
      finalHits,
      "primary_ai",
      Date.now() + DB_CACHE_TTL_MS,
    );

    return finalHits;
  })();

  inFlightBadwordLookups.set(cacheKey, lookupPromise);

  try {
    return await lookupPromise;
  } finally {
    inFlightBadwordLookups.delete(cacheKey);
  }
}

// ---------------------------------------------------------------------------
// Async evidence builders
// ---------------------------------------------------------------------------

export async function buildModerationTextEvidence(
  text: string,
): Promise<ModerationTextEvidence> {
  const emojiNormalized = normalizeDiscordCustomEmoji(text);
  const badwordHits = await detectIndonesianBadwords(emojiNormalized.text);
  const notes: string[] = [];

  for (const emojiName of emojiNormalized.emojiNames) {
    notes.push(
      `emoji:${emojiName}=Discord custom emoji/expression; not text offense by default`,
    );
  }

  if (badwordHits.length > 0) {
    notes.push(`Indonesian badword detected: ${badwordHits.join(", ")}`);
  } else {
    notes.push("no Indonesian badword detected");
  }

  return {
    raw: text,
    normalized: emojiNormalized.text,
    notes: Array.from(new Set(notes)),
    badwords: badwordHits,
    hasBadwords: badwordHits.length > 0,
  };
}

export async function formatModerationTextEvidenceForPrompt(
  text: string,
): Promise<string> {
  const evidence = await buildModerationTextEvidence(text);
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
