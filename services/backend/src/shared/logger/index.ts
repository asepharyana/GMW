import pino from "pino";
import { config } from "../config/index.js";

const isDev = config.NODE_ENV === "development";

export const logger = pino({
  level: config.LOG_LEVEL,
  transport: isDev
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:standard",
          ignore: "pid,hostname",
        },
      }
    : undefined,
});

export function createChildLogger(context: string) {
  return logger.child({ context });
}

export type Logger = ReturnType<typeof createChildLogger>;
