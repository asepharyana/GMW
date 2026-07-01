import { createChildLogger } from "@bete/shared/logger";
import pLimit from "p-limit";
import { config } from "../../shared/config/config.js";

const logger = createChildLogger("concurrencyLimiter");

/**
 * Concurrency limiter for LLM API calls.
 *
 * Prevents rate-limit (429) errors by capping simultaneous requests
 * to the configured maximum (default: 5).
 */
const llmSemaphore = pLimit(config.AI_LLM_MAX_CONCURRENT ?? 5);

let activeCount = 0;
let pendingCount = 0;

// Track queue state changes for logging
function updateCounts(): void {
  // p-limit exposes queueSize and activeCount via constructor internals,
  // but we track via our wrapper to avoid depending on internals.
}

export async function withLlmConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  pendingCount++;
  logger.debug(
    { activeCount, pendingCount, maxConcurrent: config.AI_LLM_MAX_CONCURRENT },
    "Queuing LLM request",
  );

  return llmSemaphore(async () => {
    try {
      pendingCount--;
      activeCount++;

      if (activeCount >= (config.AI_LLM_MAX_CONCURRENT ?? 5)) {
        logger.warn(
          { activeCount, maxConcurrent: config.AI_LLM_MAX_CONCURRENT },
          "LLM concurrency limit reached",
        );
      }

      return await fn();
    } finally {
      activeCount--;
      logger.debug(
        { activeCount, pendingCount },
        "LLM request completed, concurrency slot released",
      );
    }
  });
}
