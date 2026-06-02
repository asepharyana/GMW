import pino from "pino";

const rootLogger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport:
    process.env.NODE_ENV === "development"
      ? {
          target: "pino-pretty",
          options: {
            colorize: true,
            translateTime: "SYS:standard",
            ignore: "pid,hostname",
          },
        }
      : undefined,
} as pino.LoggerOptions);

export type Logger = ReturnType<typeof createChildLogger>;

/**
 * Returns a child logger bound to the root singleton via pino's .child().
 * Preserves parent context and is efficient (no transport re-init per call).
 */
export function createChildLogger(context: string) {
  return rootLogger.child({ context });
}

/**
 * Alias for createChildLogger for backwards compatibility.
 * @deprecated Use createChildLogger instead.
 */
export function createLogger(context: string) {
  return createChildLogger(context);
}
