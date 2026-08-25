/**
 * Global SWR configuration for the GMW frontend.
 *
 * Centralizes revalidation policy, error retry with exponential backoff, and
 * deduplication so every `useSWR` call across the app gets consistent behaviour
 * without each hook re-declaring the same options.
 *
 * Import this in the root layout (or any component mounted once) via
 * `SWRConfig` from "swr".
 */

import type { SWRConfiguration } from "swr";

/**
 * Exponential backoff retry — starts at ~1s, doubles up to 30s, then flatlines.
 * Matches the existing WsConnection reconnection philosophy.
 */
export const swrConfig: SWRConfiguration = {
  // Re-validate on focus (tab switch) but not on every interval by default.
  revalidateOnFocus: true,
  // Dedupe rapid identical requests within 2s.
  dedupingInterval: 2000,
  // Never throw unhandled rejections — every hook handles `error` gracefully.
  shouldRetryOnError: (error) => {
    // Don't retry on 404 (NotFound) — it's a client expectation, not transient.
    if (error?.statusCode === 404 || error?.code === "NOT_FOUND") return false;
    // Retry network errors, 5xx, and oRPC transport failures.
    return true;
  },
  onErrorRetry: (_error, _key, _config, revalidate, opts) => {
    const attemptCount = (opts as { attemptCount?: number }).attemptCount ?? 0;
    // Stop retrying after 3 attempts (≈ 1+2+4 = 7s max backoff).
    if (attemptCount >= 3) return;

    // Exponential backoff: 1000 * 2^attempt, capped at 30000ms.
    const baseDelay = 1000 * 2 ** attemptCount;
    const delay = Math.min(baseDelay, 30000);

    // Jitter ±25% to avoid thundering herd on shared endpoints.
    const jitter = delay * 0.25 * (Math.random() * 2 - 1);
    const timeout = Math.round(delay + jitter);

    setTimeout(revalidate, timeout);
  },
  // Sensible defaults for the "loading" state — most data loads in <500ms.
  loadingTimeout: 15000,
};
