import { useCallback, useState } from "react";

import { voiceApi } from "@/lib/api";
import type { MediaState } from "@/lib/types";
import type { WsEventType } from "@/lib/ws/types";

type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};

interface UseMediaStateReturn {
  mediaState: MediaState | null;
  refresh: () => void;
  queue: (url: string) => void;
  skip: () => void;
  stop: () => void;
  setVolume: (value: number | readonly number[]) => void;
}

export function useMediaState(): UseMediaStateReturn {
  const [mediaState, setMediaState] = useState<MediaState | null>(null);

  const refresh = useCallback(async () => {
    try {
      const state = await voiceApi.getMediaStatus();
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  const queue = useCallback(async (url: string) => {
    try {
      const state = await voiceApi.mediaQueue(url, "music");
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  const skip = useCallback(async () => {
    try {
      const state = await voiceApi.mediaSkip();
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  const stop = useCallback(async () => {
    try {
      const state = await voiceApi.mediaStop();
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  const setVolume = useCallback(async (value: number | readonly number[]) => {
    const vol = Array.isArray(value) ? value[0] : value;
    try {
      const state = await voiceApi.mediaVolume(vol);
      setMediaState(state);
    } catch {
      // ignore
    }
  }, []);

  return { mediaState, refresh, queue, skip, stop, setVolume };
}

export function useMediaWsSubscription(
  ws: WsHook,
  onState: (state: MediaState) => void,
) {
  return ws.on("media_state", (data) => onState(data as MediaState));
}
