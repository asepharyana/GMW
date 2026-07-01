// Utility functions shared across services

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export * from "./pagination.js";

// ---------------------------------------------------------------------------
// Centralized AbortController with guaranteed cleanup
// ---------------------------------------------------------------------------

/**
 * Creates an AbortController with a timeout that is ALWAYS cleaned up,
 * even if the caller throws or returns early without calling clear().
 *
 * Returns both the controller and a cleanup handle.
 *
 * Usage:
 *   const { controller, clear } = createAbortControllerWithTimeout(8000);
 *   try {
 *     const res = await fetch(url, { signal: controller.signal });
 *     // ... work ...
 *   } finally {
 *     clear(); // guaranteed to clear the timeout
 *   }
 */
export function createAbortControllerWithTimeout(
  timeoutMs: number,
): { controller: AbortController; clear: () => void } {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  // Unref so the timeout doesn't keep the process alive
  timeoutId?.unref?.();
  return {
    controller,
    clear: () => {
      clearTimeout(timeoutId);
    },
  };
}

// ---------------------------------------------------------------------------
// Retry with exponential backoff
// ---------------------------------------------------------------------------

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: {
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
  } = {},
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
