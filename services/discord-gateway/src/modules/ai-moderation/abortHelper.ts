/**
 * abortHelper.ts — Centralized AbortController with automatic timeout cleanup.
 *
 * All `new AbortController()` + `setTimeout(abort, ms)` patterns across the
 * moderation subsystem are replaced by this module so that:
 *   1. Every timer calls `.unref()` so it cannot keep Node alive during shutdown.
 *   2. Cleanup is guaranteed via `cleanup()` or `withAbortTimeout()`.
 *   3. The AbortError is distinguishable via `isAbortError()`.
 */

/**
 * Create an AbortController that auto-aborts after `ms` milliseconds.
 * Returns the signal and a `cleanup()` function that MUST be called
 * (typically in a `finally` block) to cancel the timer.
 *
 * @example
 * ```
 * const { signal, cleanup } = createAbortTimeout(8000);
 * try {
 *   await fetch(url, { signal });
 * } finally {
 *   cleanup();
 * }
 * ```
 */
export function createAbortTimeout(ms: number): {
  signal: AbortSignal;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  // Prevent the timer from keeping the Node.js event loop alive during shutdown
  timer.unref();
  return {
    signal: controller.signal,
    cleanup: () => clearTimeout(timer),
  };
}

/**
 * Higher-order wrapper that runs an async function with an abort timeout.
 * The cleanup is handled automatically — callers never forget `clearTimeout`.
 *
 * If the operation is aborted by the timeout, the resulting error is re-thrown
 * with a descriptive message.
 *
 * @example
 * ```
 * const result = await withAbortTimeout(8000, async (signal) => {
 *   return fetch(url, { signal }).then(r => r.json());
 * }, "SearXNG search");
 * ```
 */
export async function withAbortTimeout<T>(
  ms: number,
  fn: (signal: AbortSignal) => Promise<T>,
  label = "operation",
): Promise<T> {
  const { signal, cleanup } = createAbortTimeout(ms);
  try {
    return await fn(signal);
  } catch (err) {
    if (signal.aborted) {
      throw new Error(`${label} timed out after ${ms}ms`);
    }
    throw err;
  } finally {
    cleanup();
  }
}

/**
 * Check whether an error was caused by an AbortController signal firing
 * (either our explicit abort or the timeout).
 */
export function isAbortError(err: unknown): boolean {
  if (err instanceof DOMException) return err.name === "AbortError";
  if (err instanceof Error) {
    return (
      err.name === "AbortError" ||
      err.message.includes("timed out after") ||
      err.message.includes("aborted")
    );
  }
  return false;
}
