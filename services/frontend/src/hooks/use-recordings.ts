import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { recordingsApi } from "@/lib/api";
import type { VoiceRecording } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

const RECORDINGS_KEY = ["recordings"] as const;

export function useRecordings(initialData?: VoiceRecording[]) {
  return useSWR<VoiceRecording[]>(
    RECORDINGS_KEY,
    async () => {
      const res = await recordingsApi.list(50);
      return res.items;
    },
    { fallbackData: initialData },
  );
}

export function useDeleteRecording() {
  const { mutate } = useSWRConfig();
  return useAction((id: string) => recordingsApi.delete(id), {
    onSuccess: () => {
      void mutate(RECORDINGS_KEY);
    },
  });
}

export function useRecordingsWsSync(ws: WsHook) {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const unsub = ws.on("voice_recording_uploaded", (data) => {
      const rec = data as VoiceRecording;
      void mutate(
        RECORDINGS_KEY,
        (old: VoiceRecording[] | undefined) => (old ? [rec, ...old] : [rec]),
        { revalidate: false },
      );
    });
    return unsub;
  }, [ws, mutate]);
}
