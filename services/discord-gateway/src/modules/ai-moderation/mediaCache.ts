/**
 * mediaCache.ts
 *
 * LRU cache and DB-backed caching layer for vision analysis results,
 * including phash-based deduplication and distributed locking.
 */
import { LRUCache } from "lru-cache";
import {
  acquireMediaAnalysisLock,
  deleteCachedMediaAnalysis,
  getCachedMediaAnalysis,
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  upsertCachedMediaAnalysis,
} from "./textCacheStore.js";

export {
  acquireMediaAnalysisLock,
  deleteCachedMediaAnalysis,
  getCachedMediaAnalysis,
  makeCustomEmojiCacheKey,
  makeImageCacheKey,
  makeStickerCacheKey,
  upsertCachedMediaAnalysis,
};

/** Convenience alias for upsertCachedMediaAnalysis. */
export const setCachedMediaAnalysis = upsertCachedMediaAnalysis;

/** In-memory LRU cache for vision analysis text results. */
export const visionLruCache = new LRUCache<string, string>({
  max: 500,
  ttl: 24 * 60 * 60 * 1000,
});

/** Deduplicate in-flight vision analysis calls per cache key. */
export const inFlightVisionCalls = new Map<string, Promise<string>>();

/**
 * Sentinel value returned when image download or vision analysis fails
 * after exhausting all retries.
 */
export const FAILED_ANALYSIS_PREFIX =
  "GAGAL DIANALISIS — gambar tidak dapat diunduh atau vision API gagal setelah 3x percobaan. JANGAN mengasumsikan gambar aman hanya karena gagal dianalisis. Gunakan metadata URL/nama file saja sebagai petunjuk.";
