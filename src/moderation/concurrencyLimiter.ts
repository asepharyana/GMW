import pLimit from "p-limit";
import { config } from "../config.js";

/**
 * Concurrency limiter for LLM API calls.
 *
 * Prevents rate-limit (429) errors by capping simultaneous requests
 * to the configured maximum (default: 5).
 */
const llmSemaphore = pLimit(config.AI_LLM_MAX_CONCURRENT ?? 5);

export async function withLlmConcurrency<T>(fn: () => Promise<T>): Promise<T> {
  return llmSemaphore(fn);
}
