/**
 * cacheStore.ts
 *
 * Shared Redis cache used by the AI-moderation modules (term glossary, etc.).
 *
 * Extracted when SearXNG was removed (replaced by the Wikipedia adapter in
 * wikipediaClient.ts). The cache was never SearXNG-specific — it is a generic
 * namespaced key/value store with graceful degradation when Redis is
 * unavailable. Other modules import `makeCacheKey`, `cacheGet`, `cacheSet`,
 * and `initCacheStore` instead of reaching into a search module.
 */

import Redis from "ioredis";
import { createChildLogger } from "@/shared/logger/index";

const log = createChildLogger("cache-store");

const CACHE_PREFIX = "gmw:";
const CACHE_TTL = 86400; // 24 hours (used as a sane default)

let redis: Redis | null = null;

/**
 * Initialize the shared Redis connection for the moderation cache.
 * Safe to call multiple times — only creates one connection.
 * Degrades gracefully to `null` (no-cache) when Redis is unavailable.
 */
export function initCacheStore(redisUrl: string): void {
  if (redis) return;
  redis = new Redis(redisUrl, {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 200, 2000);
      return delay;
    },
    lazyConnect: true,
    enableReadyCheck: false,
  });
  redis.on("error", (err) => {
    log.warn({ err: err.message }, "Cache Redis error");
  });
  redis.connect().catch(() => {
    log.warn("Cache Redis unavailable — falling back to no-cache");
    redis = null;
  });
  log.info("Cache Redis initialized");
}

/** Exposes the shared Redis connection; null when Redis is unavailable. */
export function getCacheRedis(): Redis | null {
  return redis;
}

/** Builds a namespaced cache key (shared across modules). */
export function makeCacheKey(namespace: string, key: string): string {
  return `${CACHE_PREFIX}${namespace}:${key.toLowerCase().trim()}`;
}

/** Reads a value from the cache; null on miss/unavailable. */
export async function cacheGet(key: string): Promise<string | null> {
  if (!redis) return null;
  try {
    return await redis.get(key);
  } catch {
    return null;
  }
}

/** Writes a value to the cache, fire-and-forget. */
export function cacheSet(key: string, value: string, ttlSeconds: number): void {
  if (!redis) return;
  redis.setex(key, ttlSeconds, value).catch(() => {
    // Cache write failed silently
  });
}

/** Default TTL (exposed for callers that want the standard window). */
export const DEFAULT_CACHE_TTL = CACHE_TTL;
