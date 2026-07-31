/**
 * qdrantClient.ts
 *
 * Minimal Qdrant REST client (zero dependencies, fetch-based) used by the
 * semantic moderation cache. Embedding vectors + verdict payloads live in
 * Qdrant instead of the Postgres `embedding` column (legacy, kept for
 * backward-compatible fallback reads).
 *
 * All functions degrade gracefully: failures return null / empty results so
 * callers fall back to the LLM — moderation quality is never reduced.
 */

import { createHash } from "node:crypto";

import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";

const log = createChildLogger("qdrant");

export interface QdrantVerdictPayload {
  text: string;
  flags: string; // JSON string of the full moderation result
  analyzed_at: number;
  expires_at: number;
}

function baseUrl(): string {
  return (config.QDRANT_URL ?? "http://100.121.180.82:6333").replace(
    /\/+$/,
    "",
  );
}

function collectionName(): string {
  return config.QDRANT_COLLECTION ?? "gmw_text_moderation";
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (config.QDRANT_API_KEY) {
    h["api-key"] = config.QDRANT_API_KEY;
  }
  return h;
}

async function request(
  method: string,
  path: string,
  body?: unknown,
  timeoutMs = 10_000,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${baseUrl()}${path}`, {
      method,
      headers: headers(),
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      throw new Error(
        `Qdrant ${method} ${path} -> ${res.status}: ${text.slice(0, 200)}`,
      );
    }
    return json;
  } finally {
    clearTimeout(timer);
  }
}

/** Deterministic uint64 point id from the exact-hash cache key. */
export function qdrantPointId(cacheKey: string): number {
  const digest = createHash("sha256").update(cacheKey).digest();
  // First 8 bytes as BigInt, then clamp into Qdrant's uint64 space.
  const big = digest.readBigUInt64BE(0);
  return Number(big & 0x7fffffffffffffffn);
}

/**
 * Ensure the collection exists with the right vector size. If the size
 * changed (embedding model swapped), recreate — stale vectors are useless
 * anyway and cosine scores would be meaningless across dimensions.
 */
export async function ensureQdrantCollection(
  vectorSize: number,
): Promise<boolean> {
  try {
    // 404 = collection doesn't exist yet → create it.
    let existing: {
      result?: { config?: { params?: { vectors?: { size?: number } } } };
    } | null = null;
    try {
      existing = (await request("GET", `/collections/${collectionName()}`)) as {
        result?: { config?: { params?: { vectors?: { size?: number } } } };
      };
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("-> 404")) {
        throw error;
      }
    }

    const size = existing?.result?.config?.params?.vectors?.size;
    if (size === vectorSize) return true;

    if (size !== undefined && size !== vectorSize) {
      log.warn(
        { collection: collectionName(), oldSize: size, newSize: vectorSize },
        "Qdrant collection vector size changed — recreating collection",
      );
      await request("DELETE", `/collections/${collectionName()}`);
    }

    await request("PUT", `/collections/${collectionName()}`, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
    return true;
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        collection: collectionName(),
      },
      "Failed to ensure Qdrant collection",
    );
    return false;
  }
}

/** Upsert one embedding + verdict payload point. Returns false on failure. */
export async function upsertQdrantPoint(
  cacheKey: string,
  vector: number[],
  payload: QdrantVerdictPayload,
): Promise<boolean> {
  try {
    if (!(await ensureQdrantCollection(vector.length))) return false;
    await request("PUT", `/collections/${collectionName()}/points`, {
      points: [{ id: qdrantPointId(cacheKey), vector, payload }],
      wait: true,
    });
    return true;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Qdrant upsert failed — semantic entry skipped",
    );
    return false;
  }
}

export interface QdrantSearchHit {
  cacheKey: string;
  score: number;
  payload: QdrantVerdictPayload;
}

/**
 * Search the nearest stored vector. Returns hits sorted by score desc,
 * filtered to unexpired payloads. Empty array on failure.
 */
export async function searchQdrant(
  vector: number[],
  limit: number,
  scoreThreshold: number,
): Promise<QdrantSearchHit[]> {
  try {
    const json = (await request(
      "POST",
      `/collections/${collectionName()}/points/search`,
      {
        vector,
        limit,
        score_threshold: scoreThreshold,
        with_payload: true,
        filter: {
          must: [
            {
              key: "expires_at",
              range: { gte: Date.now() },
            },
          ],
        },
      },
    )) as {
      result?: Array<{
        id?: number;
        score?: number;
        payload?: QdrantVerdictPayload;
      }>;
    };

    return (json.result ?? [])
      .filter((hit) => hit.payload?.flags)
      .map((hit) => ({
        cacheKey: `qdrant:${hit.id ?? "?"}`,
        score: hit.score ?? 0,
        payload: hit.payload as QdrantVerdictPayload,
      }));
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Qdrant search failed — semantic cache skipped",
    );
    return [];
  }
}

/** True when Qdrant is configured (non-empty URL). */
export function isQdrantConfigured(): boolean {
  return Boolean(config.QDRANT_URL);
}
