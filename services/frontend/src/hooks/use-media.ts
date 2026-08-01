import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { mediaApi } from "@/lib/api";
import type { MediaState } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

const MEDIA_KEY = ["media-state"] as const;

export function useMediaState() {
  return useSWR<MediaState>(MEDIA_KEY, () => mediaApi.getStatus(), {
    refreshInterval: 10_000,
    shouldRetryOnError: false,
  });
}

function useMediaAction<TArgs>(fn: (args: TArgs) => Promise<MediaState>) {
  const { mutate } = useSWRConfig();
  return useAction(fn, {
    onSuccess: (data) => {
      void mutate(MEDIA_KEY, data, { revalidate: false });
    },
  });
}

export function useMediaQueue() {
  return useMediaAction(
    (input: { url: string; mode?: "music" | "screen" }) =>
      mediaApi.queue(input.url, input.mode ?? "music"),
  );
}

export function useMediaSkip() {
  return useMediaAction(() => mediaApi.skip());
}

export function useMediaStop() {
  return useMediaAction(() => mediaApi.stop());
}

export function useMediaVolume() {
  return useMediaAction((volume: number) => mediaApi.volume(volume));
}

/** Subscribe to WS media_state events to keep cache fresh */
export function useMediaWsSync(ws: WsHook) {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const unsub = ws.on("media_state", (data) => {
      void mutate(MEDIA_KEY, data as MediaState, { revalidate: false });
    });
    return unsub;
  }, [ws, mutate]);
}
