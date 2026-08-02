import type Redis from "ioredis";
import { createChildLogger } from "@/shared/logger/index";
import { MEDIA_STATUS_KEY } from "../../shared/redis-channels.js";

/**
 * Shared sink for writing the media status Redis key.
 *
 * CommandHandler owns the publisher + status writes for command-triggered
 * changes (`publishMediaStatus`). MediaHandler needs to also persist status
 * when the queue advances *outside* a command (natural track end / screen-share
 * done), so we expose the real publisher here and let CommandHandler wire it
 * once at startup.
 */
const logger = createChildLogger("media-status-sink");

let _setMediaStatusKey: ((payload: unknown) => void) | null = null;

export function setMediaStatusWriter(writer: (payload: unknown) => void): void {
  _setMediaStatusKey = writer;
}

export function setMediaStatusKey(payload: unknown): void {
  if (!_setMediaStatusKey) {
    logger.warn("Media status writer not wired — skipping status publish");
    return;
  }
  _setMediaStatusKey(payload);
}

export { MEDIA_STATUS_KEY };

export function wireMediaStatusWriter(redisPub: Redis): void {
  setMediaStatusWriter((payload) => {
    redisPub
      .set(MEDIA_STATUS_KEY, JSON.stringify(payload))
      .catch((err: unknown) => {
        const msg = err instanceof Error ? err.message : String(err);
        logger.warn({ error: msg }, "Failed to update media status key");
      });
  });
}
