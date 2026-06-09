// Utility functions shared across services

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + " " + sizes[i];
}

export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export function isValidUrl(url: string): boolean {
  try {
    new URL(url);
    return true;
  } catch {
    return false;
  }
}

export function sanitizeString(str: string): string {
  return str.replace(/[<>]/g, "").trim();
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  pages: number;
}

export function calculatePagination(
  total: number,
  page: number,
  limit: number,
): PaginatedResponse<never> {
  return {
    data: [],
    total,
    page,
    limit,
    pages: Math.ceil(total / limit),
  };
}

export function getOffset(page: number, limit: number): number {
  return (page - 1) * limit;
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff (port of discord-gateway retry utility)
// ---------------------------------------------------------------------------

export interface RetryOptions {
  /** Number of retry attempts (default: 3) */
  retries?: number;
  /** Initial delay in ms (default: 1000) */
  minTimeout?: number;
  /** Maximum delay in ms (default: 30000) */
  maxTimeout?: number;
  /** Multiplication factor for each retry (default: 2) */
  factor?: number;
  /** Optional AbortSignal to cancel retries */
  signal?: AbortSignal;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    minTimeout = 1_000,
    maxTimeout = 30_000,
    factor = 2,
    signal,
  } = options;

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      const err = new Error("Aborted");
      err.name = "AbortError";
      throw err;
    }

    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (lastError.name === "AbortError") {
        throw lastError;
      }
      if (attempt === retries) break;
      const backoff = Math.min(
        minTimeout * factor ** attempt + Math.random() * 100,
        maxTimeout,
      );

      await new Promise<void>((resolve, reject) => {
        let timeoutId: NodeJS.Timeout;
        const onAbort = () => {
          clearTimeout(timeoutId);
          const abortErr = new Error("Aborted");
          abortErr.name = "AbortError";
          reject(abortErr);
        };
        if (signal?.aborted) return onAbort();

        timeoutId = setTimeout(() => {
          if (signal) signal.removeEventListener("abort", onAbort);
          resolve();
        }, backoff);

        if (signal) signal.addEventListener("abort", onAbort, { once: true });
      });
    }
  }
  throw lastError!;
}

// ---------------------------------------------------------------------------
// Generic in-memory TTL cache with LRU-style pruning
// ---------------------------------------------------------------------------

interface CacheEntry<V> {
  value: V;
  expiresAt: number;
}

export interface TtlCacheOptions<K> {
  /** Default TTL in ms for entries (default: 60000) */
  defaultTtlMs?: number;
  /** Maximum entries before pruning (default: 500) */
  maxEntries?: number;
  /** Called when an entry is evicted */
  onEvict?: (key: K, value: unknown) => void;
}

export class TtlCache<K = string, V = unknown> {
  private store = new Map<K, CacheEntry<V>>();
  private readonly defaultTtlMs: number;
  private readonly maxEntries: number;
  private readonly onEvict?: (key: K, value: V) => void;

  constructor(options: TtlCacheOptions<K> = {}) {
    this.defaultTtlMs = options.defaultTtlMs ?? 60_000;
    this.maxEntries = options.maxEntries ?? 500;
    this.onEvict = options.onEvict;
  }

  /**
   * Get a value by key. Returns undefined if missing or expired.
   */
  get(key: K): V | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  /**
   * Set a value with optional custom TTL. Prunes oldest entries if at capacity.
   */
  set(key: K, value: V, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries) {
      this.prune();
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    });
  }

  /**
   * Check if a key exists and is not expired (without removing it).
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Remove a specific entry.
   */
  delete(key: K): boolean {
    return this.store.delete(key);
  }

  /**
   * Remove all expired entries.
   */
  prune(): void {
    const now = Date.now();
    const toDelete: K[] = [];
    for (const [key, entry] of this.store) {
      if (now > entry.expiresAt) {
        toDelete.push(key);
      }
    }
    for (const key of toDelete) {
      const entry = this.store.get(key);
      this.store.delete(key);
      if (entry && this.onEvict) this.onEvict(key, entry.value);
    }
    // If still over limit after TTL pruning, drop oldest entries
    if (this.store.size > this.maxEntries) {
      const keysToDelete = Array.from(this.store.keys()).slice(
        0,
        this.store.size - this.maxEntries,
      );
      for (const key of keysToDelete) {
        const entry = this.store.get(key);
        this.store.delete(key);
        if (entry && this.onEvict) this.onEvict(key, entry.value);
      }
    }
  }

  /** Current number of entries (including possibly expired ones). */
  get size(): number {
    return this.store.size;
  }

  /** Remove all entries. */
  clear(): void {
    this.store.clear();
  }
}
