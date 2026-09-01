/**
 * embeddingClient.ts
 *
 * OpenAI-compatible embeddings helper used by the semantic moderation
 * cache. When AI_LLM_EMBEDDING_MODEL is configured, near-duplicate
 * messages can reuse a stored verdict (cosine similarity) instead of
 * paying for a full chat-completion call — the main cost-saver.
 *
 * Every function degrades gracefully: if the embedding model is not
 * configured or the API fails, callers fall back to the exact-hash cache
 * and then the LLM, so moderation quality is never reduced.
 */

import OpenAI from "openai";

import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import { cleanContent } from "./textSignals.js";

const log = createChildLogger("embedding-client");

// ---------------------------------------------------------------------------
// Text normalization (shared by moderation + archive embedding)
// ---------------------------------------------------------------------------

/**
 * Max characters fed to the embedding model for a single document. Embedding
 * models have a hard token ceiling; embedding past it throws / wastes tokens.
 * Content messages are truncated; search queries have their own (smaller) cap.
 */
export const EMBEDDING_MAX_CHARS = 1200;
export const EMBEDDING_MAX_QUERY_CHARS = 300;

/**
 * Normalize free-form Discord text before embedding.
 *
 * Raw messages are full of signal-hostile noise: @mentions, channels, custom
 * emoji, URLs, markdown and control chars. Embedding that noise directly
 * dilutes the vector (sentences that differ only in an @mention or a link
 * land far apart) and inflates token cost. The same cleanup is applied to the
 * user's search query so archived vectors and the query share one space.
 *
 * - `cleanContent` (from textSignals) strips URLs/@mentions/emoji/markdown and
 *   collapses whitespace — good for embeddings, not just term extraction.
 * - Control characters / zero-width joiners are removed (Discord pastes these).
 * - Lowercase is applied so "Discord" and "discord" embed identically (embed
 *   models are case-sensitive; this measurably improves near-duplicate recall).
 *
 * Falls back to the raw input if normalization empties a string (e.g. a
 * message that was only a URL) so index alignment is preserved by callers.
 */
export function normalizeEmbeddingText(raw: string, maxChars: number): string {
  if (!raw) return "";
  const cleaned = cleanContent(
    raw.replace(/[\p{Cc}\p{Cf}]/gu, " ").toLowerCase(),
  );
  if (!cleaned) return raw.slice(0, maxChars); // preserve original if stripped
  return cleaned.slice(0, maxChars);
}

/** Normalize a single embedded document/message. */
export function normalizeEmbeddingContent(raw: string): string {
  return normalizeEmbeddingText(raw, EMBEDDING_MAX_CHARS);
}

/** Normalize a user-provided search query before embedding it. */
export function normalizeEmbeddingQuery(raw: string): string {
  return normalizeEmbeddingText(raw, EMBEDDING_MAX_QUERY_CHARS);
}

// ---------------------------------------------------------------------------
// Client (lazy singleton — same base URL as the chat client)
// ---------------------------------------------------------------------------

let openaiClient: OpenAI | null = null;

function getClient(): OpenAI | null {
  if (!config.AI_LLM_API_KEY || !config.AI_LLM_EMBEDDING_MODEL) return null;
  if (!openaiClient) {
    openaiClient = new OpenAI({
      apiKey: config.AI_LLM_API_KEY,
      baseURL: config.AI_LLM_BASE_URL,
      // Embeddings are cheap and idempotent — a transient network blip should
      // NOT silently disable the whole semantic cache for a batch. Let the SDK
      // retry (2 retries, jittered) instead of failing open immediately.
      maxRetries: 2,
      timeout: 60_000,
    });
  }
  return openaiClient;
}

/** True when the semantic cache is usable (key + model configured). */
export function isEmbeddingEnabled(): boolean {
  return Boolean(config.AI_LLM_API_KEY && config.AI_LLM_EMBEDDING_MODEL);
}

// ---------------------------------------------------------------------------
// Embedding calls
// ---------------------------------------------------------------------------

/**
 * Embed a batch of texts with the configured model.
 * Returns null on any failure so callers can skip semantic lookup.
 *
 * Each input is normalized (noise stripped, lowercased, length-capped) before
 * embedding — see normalizeEmbeddingText. Index alignment with `texts` is
 * preserved: if a text normalizes to empty we embed the raw original so the
 * caller's `embeddings[i] ↔ texts[i]` mapping never shifts.
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!isEmbeddingEnabled()) return null;
  if (texts.length === 0) return [];

  const client = getClient();
  if (!client) return null;

  const normalized = texts.map((t) => normalizeEmbeddingContent(t));

  try {
    const response = await client.embeddings.create({
      model: config.AI_LLM_EMBEDDING_MODEL as string,
      input: normalized,
      // OpenAI SDK v6 defaults to base64; Nvidia-backed embedding models
      // (e.g. llama-nemotron-embed) reject it with 400. Always float.
      encoding_format: "float",
    });
    // All vectors in one response must share the model's dimension. If they
    // don't (shouldn't happen, but guards against a misconfigured/mismatched
    // model), fail the batch rather than feed garbage to cosine + Qdrant.
    const vectors = response.data.map((item) => item.embedding);
    const firstLen = vectors[0]?.length ?? 0;
    const consistent = vectors.every((v) => v.length === firstLen);
    if (!consistent || firstLen === 0) {
      log.error(
        {
          model: config.AI_LLM_EMBEDDING_MODEL,
          dims: vectors.map((v) => v.length),
        },
        "Embedding response had inconsistent/empty dimensions — treating as failure",
      );
      return null;
    }
    return vectors;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Embedding request failed — semantic cache disabled for this call",
    );
    return null;
  }
}

/** Embed a single text; returns null on failure. */
export async function embedText(text: string): Promise<number[] | null> {
  const vectors = await embedTexts([text]);
  return vectors?.[0] ?? null;
}

// ---------------------------------------------------------------------------
// Similarity
// ---------------------------------------------------------------------------

/** Cosine similarity between two equal-length vectors. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Pick the best match above `minSimilarity`, or null.
 * Returns { index, similarity } relative to the candidates array.
 */
export function findBestEmbeddingMatch(
  vector: number[],
  candidates: number[][],
  minSimilarity: number,
): { index: number; similarity: number } | null {
  let bestIndex = -1;
  let bestSimilarity = minSimilarity;
  for (let i = 0; i < candidates.length; i++) {
    const sim = cosineSimilarity(vector, candidates[i]);
    if (sim > bestSimilarity) {
      bestSimilarity = sim;
      bestIndex = i;
    }
  }
  return bestIndex >= 0
    ? { index: bestIndex, similarity: bestSimilarity }
    : null;
}
