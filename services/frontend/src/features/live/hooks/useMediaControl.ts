import { useCallback, useEffect, useState } from "react";
import type { MediaState } from "../../../entities/media/types.js";
import {
  getMediaStatus,
  queueMedia,
  setMediaVolume,
  skipMedia,
  stopMedia,
} from "../../../shared/api/client";
import { useAsyncAction } from "../../../shared/hooks/useAsyncAction.js";
import { createLogger } from "../../../shared/lib/logger.js";

const logger = createLogger("use-media-control");

const emptyMediaState: MediaState = {
  playing: false,
  musicVolume: 1,
  current: null,
  queue: [],
};

export function useMediaControl() {
  const [mediaState, setMediaState] = useState<MediaState>(emptyMediaState);
  const { loading, error, execute, clearError } = useAsyncAction();

  const refreshMedia = useCallback(async () => {
    const state = await getMediaStatus();
    setMediaState(state);
    return state;
  }, []);

  const enqueue = useCallback(
    async (source: string, mode: "music" | "screen") => {
      const result = await execute(() => queueMedia(source, mode));
      if (result) {
        setMediaState(result);
        logger.info("Media queued", { source, mode });
      } else {
        logger.error("Failed to queue media", { source, mode });
      }
      return result;
    },
    [execute],
  );

  const skip = useCallback(async () => {
    const result = await execute(() => skipMedia());
    if (result) {
      setMediaState(result);
      logger.info("Media skipped");
    } else {
      logger.error("Failed to skip media");
    }
    return result;
  }, [execute]);

  const stop = useCallback(async () => {
    const result = await execute(() => stopMedia());
    if (result) {
      setMediaState(result);
      logger.info("Media stopped");
    } else {
      logger.error("Failed to stop media");
    }
    return result;
  }, [execute]);

  const setVolume = useCallback(
    async (volume: number) => {
      clearError();
      try {
        const state = await setMediaVolume(volume);
        setMediaState(state);
        logger.info("Volume set", { volume });
        return state;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error("Failed to set volume", { volume, error: message });
        throw err;
      }
    },
    [clearError],
  );

  useEffect(() => {
    refreshMedia().catch((err) =>
      logger.error("Failed to refresh media state on mount", {
        error: String(err),
      }),
    );
  }, [refreshMedia]);

  return {
    mediaState,
    setMediaState,
    loading,
    error,
    refreshMedia,
    enqueue,
    skip,
    stop,
    setVolume,
  };
}
