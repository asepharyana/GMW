import { useCallback, useState } from "react";

import { voiceApi } from "@/lib/api";
import type { ActiveSpeaker, VoiceStatus } from "@/lib/types";
import type { WsEventType } from "@/lib/ws/types";

type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};

interface UseVoiceStatusReturn {
  voiceStatus: VoiceStatus | null;
  refresh: () => void;
}

export function useVoiceStatus(): UseVoiceStatusReturn {
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus | null>(null);

  const refresh = useCallback(async () => {
    try {
      const status = await voiceApi.getStatus();
      setVoiceStatus(status);
    } catch {
      // ignore
    }
  }, []);

  return { voiceStatus, refresh };
}

interface UseVoiceChannelsReturn {
  channels: Array<{ id: string; name: string }>;
  loading: boolean;
  fetch: (guildId: string) => void;
}

export function useVoiceChannels(): UseVoiceChannelsReturn {
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (guildId: string) => {
    setLoading(true);
    try {
      const ch = await voiceApi.getVoiceChannels(guildId);
      setChannels(ch);
    } catch {
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { channels, loading, fetch };
}

interface UseSpeakersReturn {
  speakers: ActiveSpeaker[];
  subscribe: (ws: WsHook) => () => void;
}

export function useSpeakers(): UseSpeakersReturn {
  const [speakers, setSpeakers] = useState<ActiveSpeaker[]>([]);

  const subscribe = useCallback((ws: WsHook) => {
    const unsub = ws.on("voice_active_user", (data) => {
      const speaker = data as ActiveSpeaker;
      setSpeakers((prev) => {
        const idx = prev.findIndex((s) => s.userId === speaker.userId);
        if (idx >= 0) {
          const next = [...prev];
          next[idx] = speaker;
          return next;
        }
        return [...prev, speaker];
      });
    });
    return () => {
      unsub();
      setSpeakers([]);
    };
  }, []);

  return { speakers, subscribe };
}
