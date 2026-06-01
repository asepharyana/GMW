import pRetry from "p-retry";
import type { CustomLogger } from "../../shared/logger/logger.js";

export interface RetryOptions {
  retries?: number;
  minTimeout?: number;
  maxTimeout?: number;
  factor?: number;
  logger?: CustomLogger;
}

export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    retries = 3,
    minTimeout = 1000,
    maxTimeout = 30000,
    factor = 2,
    logger,
  } = options;

  return pRetry(fn, {
    retries,
    minTimeout,
    maxTimeout,
    factor,
    onFailedAttempt: (error) => {
      if (logger) {
        logger.warn(
          {
            attempt: error.attemptNumber,
            retriesLeft: error.retriesLeft,
            error: error.error,
          },
          "Retry attempt",
        );
      }
    },
  });
}
