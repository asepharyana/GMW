import { errorMessage, isTransientStreamError } from "@/shared/errors/index.js";
import type { Logger } from "@/shared/logger/index.js";
import type { GracefulShutdown } from "./shutdown.js";

/**
 * Process-level signal + error guards.
 *
 * Extracted from bootstrap so the "what keeps the gateway alive vs what
 * shuts it down" policy lives in exactly one place.
 *
 * Policy: transient stream-teardown failures (EPIPE / ERR_STREAM_DESTROYED /
 * ERR_STREAM_WRITE_AFTER_END / ECONNRESET) are logged and IGNORED — crashing
 * the gateway on them (voice stop/disconnect races, a child process stdin
 * closed while we still write) takes the whole bot offline mid-operation.
 * Anything else is a real bug: log with stack and shut down cleanly.
 */
export function registerProcessGuards(
  logger: Logger,
  gracefulShutdown: GracefulShutdown,
): void {
  process.on("SIGINT", () => {
    gracefulShutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    gracefulShutdown("SIGTERM");
  });

  process.on("uncaughtException", (err) => {
    if (isTransientStreamError(err)) {
      logger.warn(
        { error: err },
        "Uncaught transient stream error — continuing",
      );
      return;
    }
    logger.error(
      {
        err,
        errorMsg: errorMessage(err),
        stack: err?.stack,
      },
      "Uncaught exception",
    );
    gracefulShutdown("uncaughtException");
  });

  process.on("unhandledRejection", (reason) => {
    const err =
      reason instanceof Error ? reason : new Error(String(reason ?? "unknown"));
    if (isTransientStreamError(err)) {
      logger.warn(
        { error: err },
        "Unhandled rejection transient stream error — continuing",
      );
      return;
    }
    logger.error({ error: err, reason: String(reason) }, "Unhandled rejection");
    gracefulShutdown("unhandledRejection");
  });
}
