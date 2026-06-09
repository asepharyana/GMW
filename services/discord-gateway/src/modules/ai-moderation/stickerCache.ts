import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/config.js";
import { executeAll, executeGet } from "../../shared/database/drizzle.js";
import { uploadToTele } from "../voice-recording/teleUpload.js";

const logger = createChildLogger("sticker-cache");

const TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const MAX_ENTRIES = 5000;

let ready = false;
let statsCache = { entryCount: 0 };

export interface StickerCacheEntry {
  imageUrl: string;
  mimeType: string;
  fetchedAt: number;
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
    // Ensure the table exists — belt-and-suspenders in case the migration
    // hasn't run yet (e.g. pre-existing DB that Drizzle skips).
    await executeAll(`
      CREATE TABLE IF NOT EXISTS "sticker_cache" (
        "name" text PRIMARY KEY NOT NULL,
        "image_url" text NOT NULL DEFAULT '',
        "mime_type" text NOT NULL,
        "fetched_at" bigint NOT NULL
      )
    `);
    await executeAll(
      `CREATE INDEX IF NOT EXISTS "idx_sticker_cache_fetched_at" ON "sticker_cache" USING btree ("fetched_at")`,
    );

    // Prune expired entries
    await executeAll("DELETE FROM sticker_cache WHERE fetched_at < $1", [
      Date.now() - TTL_MS,
    ]);
    const row = await executeGet(
      "SELECT count(*) as cnt FROM sticker_cache",
      [],
    );
    if (row) {
      statsCache = {
        entryCount: Number(row.cnt),
      };
    }
  } catch (err) {
    logger.warn(
      { error: String(err) },
      "Failed to prune expired stickers on init",
    );
  }
  ready = true;
  logger.info(statsCache, "Sticker cache initialized (PostgreSQL — URL-based)");
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
      "SELECT image_url, mime_type, fetched_at FROM sticker_cache WHERE name = $1 AND fetched_at > $2",
      [key, Date.now() - TTL_MS],
    );
    if (!row) return null;
    return {
      imageUrl: row.image_url,
      mimeType: row.mime_type,
      fetchedAt: Number(row.fetched_at),
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
 * Store a sticker image URL in the cache.
 *
 * @param stickerName - The sticker's display name (used as cache key).
 * @param imageUrl    - The uploaded image URL (tele/picser) to store.
 * @param mimeType    - MIME type of the image.
 */
export async function setStickerInCache(
  stickerName: string,
  imageUrl: string,
  mimeType: string,
): Promise<void> {
  if (!ready) return;
  const key = sanitizeKey(stickerName);
  const now = Date.now();
  try {
    await evictIfNeeded();
    await executeAll(
      `INSERT INTO sticker_cache (name, image_url, mime_type, fetched_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (name) DO UPDATE SET
         image_url = EXCLUDED.image_url,
         mime_type = EXCLUDED.mime_type,
         fetched_at = EXCLUDED.fetched_at`,
      [key, imageUrl, mimeType, now],
    );
    statsCache.entryCount++;
    logger.debug({ stickerName, imageUrl }, "Sticker URL cached");
  } catch (err) {
    logger.warn(
      { stickerName, error: String(err) },
      "Failed to write sticker URL to cache",
    );
  }
}

/**
 * Upload a raw sticker image buffer to the external upload service, then
 * cache the resulting URL.
 *
 * Convenience wrapper for the common pattern:
 * download → setStickerImage → use URL.
 */
export async function uploadAndCacheSticker(
  stickerName: string,
  buffer: Buffer,
  mimeType: string,
): Promise<string | null> {
  let uploadedUrl: string;
  try {
    uploadedUrl = await uploadToTele({
      buffer,
      filename: `sticker-${sanitizeKey(stickerName)}`,
      contentType: mimeType,
      uploadUrl: config.TELE_UPLOAD_URL,
      timeoutMs: 30000,
      retries: 2,
    }).then((r) => r.url);
  } catch (err) {
    logger.warn(
      { stickerName, error: String(err) },
      "Failed to upload sticker — not caching",
    );
    return null;
  }

  // Fire-and-forget cache write (non-blocking)
  setStickerInCache(stickerName, uploadedUrl, mimeType).catch(() => {});

  return uploadedUrl;
}

async function evictIfNeeded(): Promise<void> {
  if (statsCache.entryCount < MAX_ENTRIES) return;

  const targetToFree = statsCache.entryCount - MAX_ENTRIES + 1; // evict oldest N

  const rowsToEvict = await executeAll(
    "SELECT name FROM sticker_cache ORDER BY fetched_at ASC LIMIT $1",
    [targetToFree],
  );
  if (!rowsToEvict || rowsToEvict.length === 0) return;

  const namesToDelete = (rowsToEvict as Array<{ name: string }>).map(
    (r) => r.name,
  );

  await executeAll(`DELETE FROM sticker_cache WHERE name = ANY($1)`, [
    namesToDelete,
  ]);
  statsCache.entryCount -= namesToDelete.length;

  logger.debug(
    { entriesRemoved: namesToDelete.length },
    "Batch-evicted oldest sticker cache entries",
  );
}

/**
 * Return current cache stats for observability.
 */
export function getStickerCacheStats(): {
  entryCount: number;
} {
  return { ...statsCache };
}

/**
 * Check if cache has been initialised.
 */
export function isStickerCacheReady(): boolean {
  return ready;
}
