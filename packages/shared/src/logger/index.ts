import pino from "pino";

export type Logger = ReturnType<typeof createLogger>;

export function createLogger(context: string) {
  return pino({
    name: context,
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
}

export function createChildLogger(context: string) {
  return createLogger(context);
}
