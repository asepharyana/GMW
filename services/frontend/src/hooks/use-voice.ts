import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";

import { voiceApi } from "@/lib/api";
import type { ActiveSpeaker, VoiceStatus } from "@/lib/types";
import type { WsEventType } from "@/lib/ws/types";

type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};

export function useVoiceStatus() {
  return useQuery<VoiceStatus>({
    queryKey: ["voice-status"],
    queryFn: () => voiceApi.getStatus(),
    retry: false,
  });
}

export function useVoiceChannels() {
  const [channels, setChannels] = useState<Array<{ id: string; name: string }>>(
    [],
  );
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (guildId: string) => {
    setLoading(true);
    try {
      const ch = await voiceApi.getVoiceChannels(guildId);
      setChannels(ch);
    } catch (err) {
      console.error("useVoiceChannels:", err);
      setChannels([]);
    } finally {
      setLoading(false);
    }
  }, []);

  return { channels, loading, fetch };
}

export function useSpeakers() {
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

export function useVoiceConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      guildId,
      channelId,
    }: {
      guildId: string;
      channelId: string;
    }) => voiceApi.connect(guildId, channelId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-status"] }),
  });
}

export function useVoiceDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => voiceApi.disconnect(),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["voice-status"] }),
  });
}

export function useMicTransmit() {
  return useMutation({
    mutationFn: (active: boolean) =>
      voiceApi.sendCommand(
        active ? "voice:transmit:start" : "voice:transmit:stop",
      ),
  });
}
