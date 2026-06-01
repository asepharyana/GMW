import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { createChildLogger } from "../../shared/logger/logger.js";

const logger = createChildLogger("sticker-cache");

export interface StickerCacheEntry {
  base64: string;
  mimeType: string;
  fetchedAt: number;
  size: number;
}

interface CacheIndexEntry {
  file: string;
  mimeType: string;
  size: number;
  fetchedAt: number;
}

interface CacheIndex {
  entries: Record<string, CacheIndexEntry>;
  totalSizeBytes: number;
}

export interface StickerCacheOptions {
  cacheDir: string;
  maxSizeBytes: number;
  ttlMs?: number;
}

let cacheDir = "";
let maxSizeBytes = 0;
let ttlMs = 7 * 24 * 60 * 60 * 1000; // 7 days default
let index: CacheIndex = { entries: {}, totalSizeBytes: 0 };
let ready = false;

function sanitizeKey(name: string): string {
  return encodeURIComponent(name).replace(/%/g, "_");
}

async function loadIndex(): Promise<CacheIndex> {
  try {
    const raw = await readFile(join(cacheDir, "index.json"), "utf-8");
    return JSON.parse(raw) as CacheIndex;
  } catch {
    return { entries: {}, totalSizeBytes: 0 };
  }
}

async function saveIndex(idx: CacheIndex): Promise<void> {
  await writeFile(
    join(cacheDir, "index.json"),
    JSON.stringify(idx, null, 2),
    "utf-8",
  );
}

/**
 * Initialise the sticker cache: create directory, load index.
 * Idempotent — safe to call multiple times.
 */
export async function initStickerCache(
  opts: StickerCacheOptions,
): Promise<void> {
  if (ready) return;
  cacheDir = opts.cacheDir;
  maxSizeBytes = opts.maxSizeBytes;
  ttlMs = opts.ttlMs ?? 7 * 24 * 60 * 60 * 1000;

  await mkdir(cacheDir, { recursive: true });
  index = await loadIndex();

  // Prune expired entries on startup
  const now = Date.now();
  let changed = false;
  for (const [key, meta] of Object.entries(index.entries)) {
    if (now - meta.fetchedAt > ttlMs) {
      await unlink(join(cacheDir, meta.file)).catch(() => {});
      index.totalSizeBytes -= meta.size;
      delete index.entries[key];
      changed = true;
    }
  }
  if (changed) await saveIndex(index);

  ready = true;
  logger.info(
    {
      entryCount: Object.keys(index.entries).length,
      totalSizeBytes: index.totalSizeBytes,
    },
    "Sticker cache initialized",
  );
}

/**
 * Look up a sticker image by name. Returns null on miss or TTL expiry.
 */
export async function getStickerFromCache(
  stickerName: string,
): Promise<StickerCacheEntry | null> {
  if (!ready) return null;

  const key = sanitizeKey(stickerName);
  const meta = index.entries[key];
  if (!meta) return null;

  // TTL check
  if (Date.now() - meta.fetchedAt > ttlMs) {
    await unlink(join(cacheDir, meta.file)).catch(() => {});
    index.totalSizeBytes -= meta.size;
    delete index.entries[key];
    await saveIndex(index);
    return null;
  }

  try {
    const raw = await readFile(join(cacheDir, meta.file), "utf-8");
    return {
      base64: raw,
      mimeType: meta.mimeType,
      fetchedAt: meta.fetchedAt,
      size: meta.size,
    };
  } catch {
    // File missing — clean up index entry
    delete index.entries[key];
    await saveIndex(index);
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
  const fileName = `${key}.dat`;
  const size = Buffer.byteLength(base64, "utf-8");

  // Evict if needed
  await evictIfNeeded(size);

  try {
    await writeFile(join(cacheDir, fileName), base64, "utf-8");
    index.entries[key] = {
      file: fileName,
      mimeType,
      size,
      fetchedAt: Date.now(),
    };
    index.totalSizeBytes += size;
    await saveIndex(index);
    logger.debug({ stickerName, size }, "Sticker cached");
  } catch (err) {
    logger.warn(
      { stickerName, error: err instanceof Error ? err.message : String(err) },
      "Failed to write sticker to cache",
    );
  }
}

async function evictIfNeeded(newSize: number): Promise<void> {
  while (index.totalSizeBytes + newSize > maxSizeBytes) {
    // Find oldest entry
    let oldestKey: string | null = null;
    let oldestTime = Infinity;
    for (const [key, meta] of Object.entries(index.entries)) {
      if (meta.fetchedAt < oldestTime) {
        oldestTime = meta.fetchedAt;
        oldestKey = key;
      }
    }
    if (!oldestKey) break;

    const meta = index.entries[oldestKey];
    await unlink(join(cacheDir, meta.file)).catch(() => {});
    index.totalSizeBytes -= meta.size;
    delete index.entries[oldestKey];
  }
  await saveIndex(index);
}

/**
 * Return current cache stats for observability.
 */
export function getStickerCacheStats(): {
  entryCount: number;
  totalSizeBytes: number;
} {
  return {
    entryCount: Object.keys(index.entries).length,
    totalSizeBytes: index.totalSizeBytes,
  };
}

/**
 * Check if cache has been initialized.
 */
export function isStickerCacheReady(): boolean {
  return ready;
}
