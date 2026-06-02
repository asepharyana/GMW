import { executeAll, executeGet } from "../database/drizzle.js";
import { createChildLogger } from "../logger.js";

const logger = createChildLogger("sticker-cache");

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_SIZE_BYTES = 100 * 1024 * 1024; // 100MB hardcoded

let ready = false;
let statsCache = { entryCount: 0, totalSizeBytes: 0 };

export interface StickerCacheEntry {
  base64: string;
  mimeType: string;
  fetchedAt: number;
  size: number;
}

function sanitizeKey(name: string): string {
  return encodeURIComponent(name).replace(/%/g, "_");
}

/**
 * Initialise the sticker cache from PostgreSQL.
 * Idempotent — safe to call multiple times.
 */
export async function initStickerCache(): Promise<void> {
  if (ready) return;
  try {
    await executeAll(
      "DELETE FROM sticker_cache WHERE fetched_at < ?",
      [Date.now() - TTL_MS],
    );
    const row = await executeGet(
      "SELECT count(*) as cnt, COALESCE(SUM(size), 0) as total FROM sticker_cache",
      [],
    );
    if (row) {
      statsCache = {
        entryCount: Number(row.cnt),
        totalSizeBytes: Number(row.total),
      };
    }
  } catch (err) {
    logger.warn(
      { error: String(err) },
      "Failed to prune expired stickers on init",
    );
  }
  ready = true;
  logger.info(statsCache, "Sticker cache initialized (PostgreSQL)");
}

/**
 * Look up a sticker image by name. Returns null on miss or TTL expiry.
 */
export async function getStickerFromCache(
  stickerName: string,
): Promise<StickerCacheEntry | null> {
  if (!ready) return null;
  const key = sanitizeKey(stickerName);
  try {
    const row = await executeGet(
      "SELECT base64, mime_type, size, fetched_at FROM sticker_cache WHERE name = ? AND fetched_at > ?",
      [key, Date.now() - TTL_MS],
    );
    if (!row) return null;
    return {
      base64: row.base64,
      mimeType: row.mime_type,
      fetchedAt: Number(row.fetched_at),
      size: Number(row.size),
    };
  } catch (err) {
    logger.error(
      { error: String(err), stickerName },
      "Failed to get sticker from cache",
    );
    return null;
  }
}

/**
 * Store a sticker image in the cache. Fires and forgets — never blocks.
 */
export async function setStickerInCache(
  stickerName: string,
  base64: string,
  mimeType: string,
): Promise<void> {
  if (!ready) return;
  const key = sanitizeKey(stickerName);
  const size = Buffer.byteLength(base64, "utf-8");
  const now = Date.now();
  try {
    await evictIfNeeded(size);
    await executeAll(
      `INSERT INTO sticker_cache (name, base64, mime_type, size, fetched_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT (name) DO UPDATE SET
         base64 = EXCLUDED.base64,
         mime_type = EXCLUDED.mime_type,
         size = EXCLUDED.size,
         fetched_at = EXCLUDED.fetched_at`,
      [key, base64, mimeType, size, now],
    );
    statsCache.entryCount++;
    statsCache.totalSizeBytes += size;
    logger.debug({ stickerName, size }, "Sticker cached");
  } catch (err) {
    logger.warn(
      { stickerName, error: String(err) },
      "Failed to write sticker to cache",
    );
  }
}

async function evictIfNeeded(newSize: number): Promise<void> {
  while (statsCache.totalSizeBytes + newSize > MAX_SIZE_BYTES) {
    const oldest = await executeGet(
      "SELECT name, size FROM sticker_cache ORDER BY fetched_at ASC LIMIT 1",
    );
    if (!oldest) break;
    await executeAll("DELETE FROM sticker_cache WHERE name = ?", [
      oldest.name,
    ]);
    statsCache.totalSizeBytes -= Number(oldest.size);
    statsCache.entryCount--;
  }
}

/**
 * Return current cache stats for observability.
 */
export function getStickerCacheStats(): {
  entryCount: number;
  totalSizeBytes: number;
} {
  return { ...statsCache };
}

/**
 * Check if cache has been initialized.
 */
export function isStickerCacheReady(): boolean {
  return ready;
}
