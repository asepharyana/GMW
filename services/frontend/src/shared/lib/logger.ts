// ─── Client-side structured logger ────────────────────────────────────────

const LOG_PREFIX = "[Bete]";

export function createLogger(context: string) {
  const prefix = `${LOG_PREFIX} [${context}]`;

  return {
    debug: (msg: string, data?: Record<string, unknown>) => {
      if (import.meta.env.DEV) console.debug(prefix, msg, data ?? "");
    },
    info: (msg: string, data?: Record<string, unknown>) => {
      console.info(prefix, msg, data ?? "");
    },
    warn: (msg: string, data?: Record<string, unknown>) => {
      console.warn(prefix, msg, data ?? "");
    },
    error: (msg: string, data?: Record<string, unknown>) => {
      console.error(prefix, msg, data ?? "");
    },
  };
}
