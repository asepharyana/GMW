import { useCallback, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { voiceApi } from "@/lib/api";
import { MicTransmitter } from "@/lib/audio/mic-transmit";
import type { ActiveSpeaker, Channel, VoiceStatus } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

const STATUS_KEY = ["voice-status"] as const;

export function useVoiceStatus() {
  return useSWR<VoiceStatus>(STATUS_KEY, () => voiceApi.getStatus(), {
    shouldRetryOnError: false,
  });
}

export function useVoiceChannels(guildId: string) {
  return useSWR<Channel[]>(guildId ? ["voice-channels", guildId] : null, () =>
    voiceApi.getVoiceChannels(guildId),
  );
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

function useStatusInvalidator() {
  const { mutate } = useSWRConfig();
  return () => {
    void mutate(STATUS_KEY);
  };
}

export function useVoiceConnect() {
  const invalidate = useStatusInvalidator();
  return useAction(
    ({ guildId, channelId }: { guildId: string; channelId: string }) =>
      voiceApi.connect(guildId, channelId),
    { onSuccess: invalidate },
  );
}

export function useVoiceDisconnect() {
  const invalidate = useStatusInvalidator();
  return useAction(() => voiceApi.disconnect(), { onSuccess: invalidate });
}

export function useMicTransmit(ws: {
  sendBinary: (data: ArrayBufferLike) => void;
}) {
  const transmitterRef = useRef<MicTransmitter | null>(null);

  const action = useAction(async (active: boolean) => {
    if (active) {
      const transmitter = new MicTransmitter((frame) => ws.sendBinary(frame));
      transmitterRef.current = transmitter;
      await transmitter.start();
      await voiceApi.sendCommand("voice:transmit:start");
    } else {
      transmitterRef.current?.stop();
      transmitterRef.current = null;
      await voiceApi.sendCommand("voice:transmit:stop");
    }
  });

  const setVolume = useCallback((volume: number) => {
    transmitterRef.current?.setVolume(volume / 100);
  }, []);

  return { ...action, setVolume };
}
