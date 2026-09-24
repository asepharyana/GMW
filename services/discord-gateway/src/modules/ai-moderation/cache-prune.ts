import { createChildLogger } from "@/shared/logger/index";
import { pruneExpiredTexts } from "./textCacheStore.js";

const logger = createChildLogger("cache-prune");

/** Expired-verdict sweep cadence. */
const CACHE_PRUNE_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

let lastCachePruneAt = 0;

/**
 * Cache hygiene: purge expired moderation verdicts from Postgres.
 *
 * Expired entries are never reused (read filters check `expires_at`) but they
 * accumulate forever without a sweep. Called from the recovery interval; the
 * 6-hour throttle keeps it to one sweep per window.
 */
export function runCachePruneIfDue(now: number = Date.now()): void {
  if (now - lastCachePruneAt < CACHE_PRUNE_INTERVAL_MS) return;
  lastCachePruneAt = now;

  Promise.resolve(pruneExpiredTexts())
    .then((pgDeleted) => {
      if (pgDeleted > 0) {
        logger.info({ pgDeleted }, "Expired moderation cache pruned");
      }
    })
    .catch((err: unknown) => {
      logger.warn({ error: String(err) }, "Moderation cache prune failed");
    });
}

/** Reset the throttle window (tests). */
export function resetCachePruneState(): void {
  lastCachePruneAt = 0;
}
