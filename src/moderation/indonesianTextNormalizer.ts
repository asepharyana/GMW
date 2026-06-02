import axios from "axios";
import OpenAI from "openai";
import { config } from "../config.js";
import { createChildLogger } from "../logger.js";
import { retryWithBackoff } from "../retry.js";
import { getCachedText, upsertCachedText } from "./textCacheStore.js";

const log = createChildLogger("indonesianTextNormalizer");

const CUSTOM_EMOJI_PATTERN = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;

/** NVIDIA content safety categories that map to offensive/badword content. */
const NVIDIA_BAD_CATEGORIES = new Set([
  "hate",
  "harassment",
  "sexual",
  "violence",
  "self-harm",
  "illicit",
  "profanity",
  "vulgar",
  "insult",
]);

/**
 * Map NVIDIA Nemotron category labels to Indonesian badword-style labels.
 */
const CATEGORY_TO_BADWORD_LABEL: Record<string, string> = {
  hate: "hate_speech",
  harassment: "harassment",
  sexual: "sexual_content",
  violence: "violence",
  "self-harm": "self_harm",
  illicit: "illegal_content",
  profanity: "vulgar_language",
  vulgar: "vulgar_language",
  insult: "harassment",
};

const VALID_PRIMARY_AI_FLAGS = new Set([
  "spam",
  "hate_speech",
  "sara",
  "hoaks",
  "harassment",
  "vulgar_language",
  "sexual_content",
  "sexual_deviation",
  "violence",
  "self_harm",
  "doxxing",
  "scam",
  "misinformation",
  "nsfw_image",
  "gore_image",
  "illegal_content",
  "gambling",
  "drugs",
  "child_safety",
  "financial_scam",
  "religious_insult",
  "self_promo",
]);

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

const NEMOTRON_RATE_LIMIT_COOLDOWN_MS = 0;
const PRIMARY_AI_RATE_LIMIT_COOLDOWN_MS = 0;
const GROQ_RATE_LIMIT_COOLDOWN_MS = 0;

interface BadwordCacheEntry {
  value: string[];
  expiresAt: number;
}

const badwordCache = new Map<string, BadwordCacheEntry>();
const inFlightBadwordLookups = new Map<string, Promise<string[]>>();
let nemotronUnavailableUntil = 0;
let primaryAiUnavailableUntil = 0;
let groqUnavailableUntil = 0;
let primaryModerationClient: OpenAI | null = null;

export interface ModerationTextEvidence {
  raw: string;
  normalized: string;
  notes: string[];
  badwords: string[];
  hasBadwords: boolean;
}

// ---------------------------------------------------------------------------
// Sync helpers (unchanged)
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

// Local badword detection removed (lines 121-198).
// All detection now goes through the API pipeline (NVIDIA → Primary AI → Groq)
// to eliminate false positives from substring matching and hardcoded whitelists.

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

function getPrimaryModerationClient(): OpenAI | null {
  if (!config.AI_LLM_API_KEY) {
    return null;
  }

  if (!primaryModerationClient) {
    primaryModerationClient = new OpenAI({
      apiKey: config.AI_LLM_API_KEY,
      baseURL: config.AI_LLM_BASE_URL,
      maxRetries: 0,
      timeout: 15000,
    });
  }

  return primaryModerationClient;
}

function normalizePrimaryAiFlag(value: string): string | null {
  const lower = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_");
  if (!lower) return null;

  if (VALID_PRIMARY_AI_FLAGS.has(lower)) {
    return lower;
  }

  return CATEGORY_TO_BADWORD_LABEL[lower] ?? null;
}

function extractFlagsFromPrimaryAiContent(content: string): string[] {
  const flags = new Set<string>();
  let parsed: unknown;

  try {
    parsed = JSON.parse(content);
  } catch {
    parsed = null;
  }

  const addValue = (value: unknown) => {
    if (typeof value !== "string") return;
    const normalized = normalizePrimaryAiFlag(value);
    if (normalized) flags.add(normalized);
  };

  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      addValue(item);
    }
  } else if (parsed && typeof parsed === "object") {
    const candidate = parsed as Record<string, unknown>;
    for (const key of ["flags", "categories", "badwords"]) {
      const value = candidate[key];
      if (Array.isArray(value)) {
        for (const item of value) addValue(item);
      } else {
        addValue(value);
      }
    }
  }

  if (flags.size > 0) {
    return Array.from(flags);
  }

  const lowerContent = content.toLowerCase();
  for (const flag of VALID_PRIMARY_AI_FLAGS) {
    if (lowerContent.includes(flag)) {
      flags.add(flag);
    }
  }

  for (const category of Object.keys(CATEGORY_TO_BADWORD_LABEL)) {
    if (lowerContent.includes(category)) {
      const mapped = CATEGORY_TO_BADWORD_LABEL[category];
      if (mapped) flags.add(mapped);
    }
  }

  return Array.from(flags);
}

async function callPrimaryAiModeration(text: string): Promise<string[]> {
  const client = getPrimaryModerationClient();
  if (!client) {
    return [];
  }

  const completion = await retryWithBackoff(
    async () => {
      return client.chat.completions.create({
        model: config.AI_LLM_MODEL,
        messages: [
          {
            role: "user",
            content:
              "Deteksi kata kasar / pelanggaran ringan dari teks Indonesia berikut. " +
              'Balas hanya JSON object dengan format {"flags":[...]} dan gunakan hanya flag valid ini: ' +
              Array.from(VALID_PRIMARY_AI_FLAGS).join(", ") +
              ". Jika tidak ada pelanggaran, flags harus array kosong. Teks: " +
              text,
          },
        ],
        temperature: 0.1,
        top_p: 0.9,
        max_tokens: 200,
        stream: false,
        response_format: { type: "json_object" },
      } as OpenAI.Chat.Completions.ChatCompletionCreateParamsNonStreaming);
    },
    {
      retries: 0,
      minTimeout: 0,
      maxTimeout: 0,
      factor: 2,
      logger: log,
    },
  );

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) {
    return [];
  }

  return extractFlagsFromPrimaryAiContent(content);
}

// ---------------------------------------------------------------------------
// Groq Llama Prompt Guard Moderation API (Fallback)
// ---------------------------------------------------------------------------

/**
 * Call Groq Llama Prompt Guard 2-86M model for moderation scoring.
 * Returns a probability score as a string (e.g. "0.9988824725151062").
 * Scores above ~0.5 indicate moderation violations.
 */
async function callGrokModeration(text: string): Promise<string[]> {
  const apiKey = config.GROQ_API_KEY;
  if (!apiKey) {
    return [];
  }

  const response = await axios.post(
    config.GROQ_MODERATION_BASE_URL,
    {
      model: config.GROQ_MODERATION_MODEL,
      messages: [{ role: "user", content: text }],
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      timeout: 10_000,
    },
  );

  const scoreStr = response.data?.choices?.[0]?.message?.content?.trim();
  if (!scoreStr) {
    return [];
  }

  // Parse the score (Llama Prompt Guard returns a single probability score)
  const score = parseFloat(scoreStr);
  if (isNaN(score) || score < 0.5) {
    return [];
  }

  // Map score to moderation flags based on severity
  const flags: string[] = [];
  if (score >= 0.9) {
    flags.push("vulgar_language", "harassment");
  } else if (score >= 0.7) {
    flags.push("vulgar_language");
  } else {
    flags.push("spam");
  }

  return flags;
}

// ---------------------------------------------------------------------------
// NVIDIA Nemotron-3 Content Safety API
// ---------------------------------------------------------------------------

/**
 * Call NVIDIA Nemotron-3 Content Safety API to detect harmful content.
 * Returns categories/flags from the API response.
 */
async function callNemotronContentSafety(text: string): Promise<string[]> {
  const apiKey = config.NVIDIA_NEMOTRON_API_KEY;
  if (!apiKey) {
    return [];
  }

  const response = await axios.post(
    config.NVIDIA_NEMOTRON_BASE_URL,
    {
      model: config.NVIDIA_NEMOTRON_MODEL,
      messages: [{ role: "user", content: text }],
      max_tokens: 897,
      temperature: 0.2,
      top_p: 0.7,
      stream: false,
    },
    {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
      timeout: 15_000,
    },
  );

  const data = response.data;
  const categories: string[] = [];

  // Parse the LLM response for category flags
  const content = data?.choices?.[0]?.message?.content ?? "";
  if (content) {
    const lowerContent = content.toLowerCase();
    for (const category of NVIDIA_BAD_CATEGORIES) {
      if (lowerContent.includes(category)) {
        categories.push(CATEGORY_TO_BADWORD_LABEL[category] ?? category);
      }
    }
  }

  // Also check for structured response fields
  const choice = data?.choices?.[0];
  if (choice?.message?.content) {
    try {
      const parsed = JSON.parse(choice.message.content);
      if (parsed.categories && Array.isArray(parsed.categories)) {
        for (const cat of parsed.categories) {
          if (NVIDIA_BAD_CATEGORIES.has(cat.name ?? cat)) {
            categories.push(CATEGORY_TO_BADWORD_LABEL[cat.name ?? cat] ?? cat);
          }
        }
      }
    } catch {
      // Not JSON — already handled via text search above
    }
  }

  return Array.from(new Set(categories));
}

// ---------------------------------------------------------------------------
// Three-tier cache pipeline
// ---------------------------------------------------------------------------

/**
 * Detect badwords in text using a **two-tier cache + API pipeline**:
 *
 * 1. **In-memory cache** (BADWORD_CACHE_TTL_MS, 10 min) — fastest path,
 *    keyed by the full normalized text string.
 * 2. **DB cache** (DB_CACHE_TTL_MS, 24 h) — same full-text key, persisted
 *    across restarts. Uses the FULL normalized text (not per-word) because
 *    context matters: "kau" alone is clean, but "awas kau" can be a threat.
 * 3. **API pipeline** (NVIDIA → Primary AI → Groq)
 *    only runs when both cache layers miss.
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

    // ── Tier 3: API pipeline ──

    const hits = new Set<string>();
    let sourceUsed: "nvidia" | "primary_ai" | "groq" = "primary_ai";

    // 3a. Try NVIDIA API if key is configured and not rate limited.
    const apiKey = config.NVIDIA_NEMOTRON_API_KEY;
    if (apiKey && Date.now() >= nemotronUnavailableUntil) {
      try {
        const apiCategories = await callNemotronContentSafety(text);
        for (const hit of apiCategories) {
          hits.add(hit);
        }
        if (apiCategories.length > 0) sourceUsed = "nvidia";
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : null;
        if (status === 429) {
          nemotronUnavailableUntil =
            Date.now() + NEMOTRON_RATE_LIMIT_COOLDOWN_MS;
        }
        log.warn(
          { error },
          "NVIDIA Nemotron API call failed, falling back to primary AI",
        );
      }
    }

    // 3b. Try the main AI model next.
    if (hits.size === 0 && Date.now() >= primaryAiUnavailableUntil) {
      try {
        const primaryHits = await callPrimaryAiModeration(text);
        for (const hit of primaryHits) {
          hits.add(hit);
        }
        if (primaryHits.length > 0) sourceUsed = "primary_ai";
      } catch (error) {
        const status = axios.isAxiosError(error)
          ? error.response?.status
          : null;
        if (status === 429) {
          primaryAiUnavailableUntil =
            Date.now() + PRIMARY_AI_RATE_LIMIT_COOLDOWN_MS;
        }
        log.warn(
          { error },
          "Primary AI badword detection failed, falling back to Groq",
        );
      }
    }

    // 3c. Try Groq Llama Prompt Guard as final API fallback.
    if (hits.size === 0 && Date.now() >= groqUnavailableUntil) {
      const groqKey = config.GROQ_API_KEY;
      if (groqKey) {
        try {
          const groqHits = await callGrokModeration(text);
          for (const hit of groqHits) {
            hits.add(hit);
          }
          if (groqHits.length > 0) sourceUsed = "groq";
        } catch (error) {
          const status = axios.isAxiosError(error)
            ? error.response?.status
            : null;
          if (status === 429) {
            groqUnavailableUntil = Date.now() + GROQ_RATE_LIMIT_COOLDOWN_MS;
          }
          log.warn({ error }, "Groq Llama Prompt Guard moderation failed");
        }
      }
    }

    const finalHits = Array.from(hits);

    // Populate all cache tiers so the same text never triggers another API call
    // within the TTL window.
    setCachedBadwords(cacheKey, finalHits);
    await upsertCachedText(
      cacheKey,
      finalHits,
      sourceUsed,
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
