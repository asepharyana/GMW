import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { mediaApi } from "@/lib/api";
import type { MediaState } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

export function useMediaState() {
  return useQuery<MediaState>({
    queryKey: ["media-state"],
    queryFn: () => mediaApi.getStatus(),
    retry: false,
    refetchInterval: 10_000,
  });
}

export function useMediaQueue() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (url: string) => mediaApi.queue(url, "music"),
    onSuccess: (data) => qc.setQueryData(["media-state"], data),
  });
}

export function useMediaSkip() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mediaApi.skip(),
    onSuccess: (data) => qc.setQueryData(["media-state"], data),
  });
}

export function useMediaStop() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => mediaApi.stop(),
    onSuccess: (data) => qc.setQueryData(["media-state"], data),
  });
}

export function useMediaVolume() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (volume: number) => mediaApi.volume(volume),
    onSuccess: (data) => qc.setQueryData(["media-state"], data),
  });
}

/** Subscribe to WS media_state events to keep cache fresh */
export function useMediaWsSync(ws: WsHook) {
  const qc = useQueryClient();
  useEffect(() => {
    const unsub = ws.on("media_state", (data) => {
      qc.setQueryData(["media-state"], data as MediaState);
    });
    return unsub;
  }, [ws, qc]);
}
