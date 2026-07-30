import type { CommandReply } from "./index.js";
import { createChildLogger } from "./logger/index.js";

export { createChildLogger };

/**
 * Attempt a Redis command first; if it fails or times out, fall back.
 *
 * @param commandFn  - Function that issues the publishCommand and returns the reply.
 * @param fallbackFn - Async fallback, typically reads from Redis status key.
 * @param commandLabel - Label used for logging (e.g. "voice:connect").
 */
export async function tryCommandThenFallback<T>(
  commandFn: () => Promise<CommandReply<T> | null>,
  fallbackFn: () => Promise<T>,
  commandLabel: string,
): Promise<T> {
  const logger = createChildLogger(`command-helper:${commandLabel}`);
  const reply = await commandFn();
  if (reply?.success && reply.data !== undefined && reply.data !== null) {
    return reply.data;
  }
  logger.warn("discord-gateway unreachable, falling back");
  return fallbackFn();
}
