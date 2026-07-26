import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { recordingsApi } from "@/lib/api";
import type { VoiceRecording } from "@/lib/types";
import type { WsEventType } from "@/lib/ws/types";

type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};

export function useRecordings() {
  return useQuery<VoiceRecording[]>({
    queryKey: ["recordings"],
    queryFn: async () => {
      const res = await recordingsApi.list(50);
      return res.items;
    },
  });
}

export function useDeleteRecording() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => recordingsApi.delete(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["recordings"] }),
  });
}

export function useRecordingsWsSync(ws: WsHook) {
  const qc = useQueryClient();
  useEffect(() => {
    const unsub = ws.on("voice_recording_uploaded", (data) => {
      const rec = data as VoiceRecording;
      qc.setQueryData<VoiceRecording[]>(["recordings"], (old) =>
        old ? [rec, ...old] : [rec],
      );
    });
    return unsub;
  }, [ws, qc]);
}
