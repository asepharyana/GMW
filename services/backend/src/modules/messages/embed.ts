import { config } from "@/shared/config/index";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("messages-embed");

/** Max chars for a search query fed to the embedding model. */
const MAX_QUERY_CHARS = 300;

/**
 * Normalize a user search query before embedding so it lands in the same
 * vector space as the archived content (which is normalized the same way on
 * write). Mirrors the gateway's normalizer: strip control/zero-width chars,
 * lowercase, collapse whitespace, cap length. Readable punctuation is kept —
 * a search query is already compact.
 */
export function normalizeEmbeddingQuery(raw: string): string {
  if (!raw) return "";
  return raw
    .replace(/[\p{Cc}\p{Cf}]/gu, " ")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_CHARS);
}

/**
 * Embed a search query with the configured OpenAI-compatible embedding model.
 * Uses raw fetch (the backend has no openai SDK dependency) and returns null
 * when embeddings are not configured (search unavailable).
 *
 * encoding_format: "float" is REQUIRED — Nvidia-backed models reject base64.
 */
export async function embedQuery(rawQuery: string): Promise<number[] | null> {
  if (!config.AI_LLM_API_KEY || !config.AI_LLM_EMBEDDING_MODEL) return null;
  const text = normalizeEmbeddingQuery(rawQuery);
  if (!text) return null;
  try {
    const res = await fetch(`${config.AI_LLM_BASE_URL}/embeddings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.AI_LLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: config.AI_LLM_EMBEDDING_MODEL,
        input: text,
        encoding_format: "float",
      }),
    });
    if (!res.ok) {
      logger.warn({ status: res.status }, "query embed HTTP error");
      return null;
    }
    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
    };
    return json.data?.[0]?.embedding ?? null;
  } catch (error) {
    logger.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "query embed failed",
    );
    return null;
  }
}
