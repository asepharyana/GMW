import { useCallback, useState } from "react";

import { recordingsApi } from "@/lib/api";
import type { VoiceRecording } from "@/lib/types";
import type { WsEventType } from "@/lib/ws/types";

type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};

interface UseRecordingsReturn {
  recordings: VoiceRecording[];
  loading: boolean;
  refresh: () => void;
  remove: (id: string) => void;
  prepend: (rec: VoiceRecording) => void;
}

export function useRecordings(): UseRecordingsReturn {
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recordingsApi.list(50);
      setRecordings(result.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  const remove = useCallback(async (id: string) => {
    try {
      await recordingsApi.delete(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  }, []);

  const prepend = useCallback((rec: VoiceRecording) => {
    setRecordings((prev) => [rec, ...prev]);
  }, []);

  return { recordings, loading, refresh, remove, prepend };
}

export function useRecordingsWsSubscription(
  ws: WsHook,
  onUploaded: (rec: VoiceRecording) => void,
) {
  return ws.on("voice_recording_uploaded", (data) =>
    onUploaded(data as VoiceRecording),
  );
}
