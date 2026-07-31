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

const log = createChildLogger("embedding-client");

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
      maxRetries: 0,
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
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (!isEmbeddingEnabled()) return null;
  if (texts.length === 0) return [];

  const client = getClient();
  if (!client) return null;

  try {
    const response = await client.embeddings.create({
      model: config.AI_LLM_EMBEDDING_MODEL as string,
      input: texts,
      // OpenAI SDK v6 defaults to base64; Nvidia-backed embedding models
      // (e.g. llama-nemotron-embed) reject it with 400. Always float.
      encoding_format: "float",
    });
    return response.data.map((item) => item.embedding);
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
