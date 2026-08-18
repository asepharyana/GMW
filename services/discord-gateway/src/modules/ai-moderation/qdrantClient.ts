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

// ensureQdrantCollection performs a network round-trip (GET, possibly
// DELETE+PUT). Running it on every upsert adds 1-3 HTTP calls per
// moderation verdict, which under Qdrant load pushes the upsert past the
// request timeout and aborts it ("This operation was aborted"). Memoise the
// result so the collection is only verified once per process lifetime.
let ensureCollectionPromise: Promise<boolean> | null = null;

/** Reset the memoised ensure result (used by tests / config reload). */
export function resetQdrantCollectionCache(): void {
  ensureCollectionPromise = null;
}

export interface QdrantVerdictPayload {
  text: string;
  flags: string; // JSON string of the full moderation result
  analyzed_at: number;
  expires_at: number;
  /** Bare content hash (16 hex chars) — enables content-based invalidation
   *  regardless of the (context-scoped) point id. */
  content_hash?: string;
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

/** Persistent archive collection for semantic message search (no TTL). */
export const ARCHIVE_COLLECTION =
  config.QDRANT_ARCHIVE_COLLECTION ?? "gmw_message_archive";

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
  if (ensureCollectionPromise) return ensureCollectionPromise;
  ensureCollectionPromise = (async () => {
    try {
      // 404 = collection doesn't exist yet → create it.
      let existing: {
        result?: { config?: { params?: { vectors?: { size?: number } } } };
      } | null = null;
      try {
        existing = (await request(
          "GET",
          `/collections/${collectionName()}`,
        )) as {
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
  })();
  return ensureCollectionPromise;
}

/** Upsert one embedding + verdict payload point. Returns false on failure. */
export async function upsertQdrantPoint(
  cacheKey: string,
  vector: number[],
  payload: QdrantVerdictPayload,
): Promise<boolean> {
  try {
    if (!(await ensureQdrantCollection(vector.length))) return false;
    await request(
      "PUT",
      `/collections/${collectionName()}/points`,
      {
        points: [{ id: qdrantPointId(cacheKey), vector, payload }],
        wait: true,
      },
      30_000,
    );
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

/**
 * Batch search: one HTTP round-trip for N vectors (Qdrant
 * `/points/search/batch`). Result is index-aligned with `vectors` — each
 * entry is the top hits for that vector (or [] on per-vector failure).
 * Used by the orchestrator to avoid N sequential embed→search round-trips.
 */
export async function searchQdrantBatch(
  vectors: number[][],
  limit: number,
  scoreThreshold: number,
): Promise<QdrantSearchHit[][]> {
  if (vectors.length === 0) return [];
  try {
    const json = (await request(
      "POST",
      `/collections/${collectionName()}/points/search/batch`,
      {
        searches: vectors.map((vector) => ({
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
        })),
      },
    )) as {
      result?: Array<{
        result?: Array<{
          id?: number;
          score?: number;
          payload?: QdrantVerdictPayload;
        }>;
      }>;
    };

    return (json.result ?? []).map((entry) =>
      (entry.result ?? [])
        .filter((hit) => hit.payload?.flags)
        .map((hit) => ({
          cacheKey: `qdrant:${hit.id ?? "?"}`,
          score: hit.score ?? 0,
          payload: hit.payload as QdrantVerdictPayload,
        })),
    );
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Qdrant batch search failed — semantic cache skipped",
    );
    return vectors.map(() => []);
  }
}

/**
 * Delete expired verdict points from the collection. Best-effort: 404
 * (collection missing) and failures are swallowed — the periodic pruner
 * just retries next sweep.
 */
export async function deleteExpiredQdrantPoints(): Promise<number> {
  try {
    const json = (await request(
      "POST",
      `/collections/${collectionName()}/points/delete`,
      {
        filter: {
          must: [
            {
              key: "expires_at",
              range: { lt: Date.now() },
            },
          ],
        },
      },
    )) as { result?: { deleted?: number } | null };

    return json.result?.deleted ?? 0;
  } catch (error) {
    if (error instanceof Error && error.message.includes("-> 404")) {
      log.debug({}, "Qdrant collection absent — nothing to prune");
    } else {
      log.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Qdrant expired-point prune failed",
      );
    }
    return 0;
  }
}

/**
 * Delete the verdict point for an exact cache key (used by cache
 * invalidation when a moderator corrects a verdict).
 */
export async function deleteQdrantPoint(cacheKey: string): Promise<boolean> {
  try {
    await request("POST", `/collections/${collectionName()}/points/delete`, {
      points: [qdrantPointId(cacheKey)],
    });
    return true;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Qdrant point delete failed",
    );
    return false;
  }
}

/**
 * Delete all verdict points whose payload carries a given bare content hash.
 * Used by cache invalidation for corrected verdicts — matches context-scoped
 * points that share the same content regardless of their point ids.
 */
export async function deleteQdrantPointsByContentHash(
  bareHash: string,
): Promise<boolean> {
  try {
    await request("POST", `/collections/${collectionName()}/points/delete`, {
      filter: {
        must: [
          {
            key: "content_hash",
            match: { value: bareHash },
          },
        ],
      },
    });
    return true;
  } catch (error) {
    log.warn(
      { error: error instanceof Error ? error.message : String(error) },
      "Qdrant content-hash point delete failed",
    );
    return false;
  }
}

/** True when Qdrant is configured (non-empty URL). */
export function isQdrantConfigured(): boolean {
  return Boolean(config.QDRANT_URL);
}

// ─── Archive variants (collection-aware, for persistent message search) ───
// These mirror the cache functions but take an explicit collection name so the
// semantic-search archive (gmw_message_archive) can live alongside the
// TTL-bounded automod cache without disturbing it.

/** Ensure an arbitrary collection exists with the right vector size. */
export async function ensureQdrantCollectionV2(
  name: string,
  vectorSize: number,
): Promise<boolean> {
  try {
    let existing: {
      result?: { config?: { params?: { vectors?: { size?: number } } } };
    } | null = null;
    try {
      existing = (await request("GET", `/collections/${name}`)) as {
        result?: { config?: { params?: { vectors?: { size?: number } } } };
      } | null;
    } catch (error) {
      if (!(error instanceof Error) || !error.message.includes("-> 404")) {
        throw error;
      }
    }

    const size = existing?.result?.config?.params?.vectors?.size;
    if (size === vectorSize) return true;

    if (size !== undefined && size !== vectorSize) {
      log.warn(
        { collection: name, oldSize: size, newSize: vectorSize },
        "Qdrant archive collection vector size changed — recreating collection",
      );
      await request("DELETE", `/collections/${name}`);
    }

    await request("PUT", `/collections/${name}`, {
      vectors: { size: vectorSize, distance: "Cosine" },
    });
    return true;
  } catch (error) {
    log.error(
      {
        error: error instanceof Error ? error.message : String(error),
        collection: name,
      },
      "Failed to ensure Qdrant archive collection",
    );
    return false;
  }
}

/** Upsert one embedding + payload point into a named collection. */
export async function upsertQdrantPointV2(
  name: string,
  pointId: number,
  vector: number[],
  payload: QdrantVerdictPayload,
): Promise<boolean> {
  try {
    if (!(await ensureQdrantCollectionV2(name, vector.length))) return false;
    await request(
      "PUT",
      `/collections/${name}/points`,
      {
        points: [{ id: pointId, vector, payload }],
        wait: true,
      },
      30_000,
    );
    return true;
  } catch (error) {
    log.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        collection: name,
      } as Record<string, unknown>,
      "Qdrant archive upsert failed — entry skipped",
    );
    return false;
  }
}

export interface QdrantArchiveHit {
  pointId: number;
  score: number;
  payload: QdrantVerdictPayload;
}

/** Search a named collection for the nearest stored vector. */
export async function searchQdrantV2(
  name: string,
  vector: number[],
  limit: number,
  scoreThreshold: number,
): Promise<QdrantArchiveHit[]> {
  try {
    const json = (await request("POST", `/collections/${name}/points/search`, {
      vector,
      limit,
      score_threshold: scoreThreshold,
      with_payload: true,
    })) as {
      result?: Array<{
        id?: number;
        score?: number;
        payload?: QdrantVerdictPayload;
      }>;
    };

    return (json.result ?? [])
      .filter((hit) => hit.payload?.text)
      .map((hit) => ({
        pointId: hit.id ?? 0,
        score: hit.score ?? 0,
        payload: hit.payload as QdrantVerdictPayload,
      }));
  } catch (error) {
    log.warn(
      {
        error: error instanceof Error ? error.message : String(error),
        collection: name,
      } as Record<string, unknown>,
      "Qdrant archive search failed — semantic search skipped",
    );
    return [];
  }
}
