import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { voiceApi } from "@/lib/api";
import { MicTransmitter } from "@/lib/audio/mic-transmit";
import { PcmPlayer } from "@/lib/audio/pcm-player";
import type { ActiveSpeaker, Channel, VoiceStatus } from "@/lib/types";
import type { PcmChunk } from "@/lib/ws/types";
import type { WsHook } from "@/lib/ws-hook";

/** FNV-1a 32-bit — same hash the gateway uses to tag PCM frames. */
export function hashUserId(userId: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < userId.length; i++) {
    hash ^= userId.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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

/**
 * Receive + play Discord voice in the browser.
 *
 * Toggling on (from a user gesture) starts a PcmPlayer, subscribes to the WS
 * binary PCM stream, and exposes per-user activity levels for the waveform UI.
 * `toggle(false)` tears everything down.
 */
export function useVoiceListen(ws: {
  onPcm: (handler: (chunk: PcmChunk) => void) => () => void;
}) {
  const playerRef = useRef<PcmPlayer | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [active, setActive] = useState(false);
  const [levels, setLevels] = useState<Map<number, number>>(new Map());

  const stop = useCallback(() => {
    unsubRef.current?.();
    unsubRef.current = null;
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
    playerRef.current?.stop();
    playerRef.current = null;
    setActive(false);
    setLevels(new Map());
  }, []);

  const toggle = useCallback(
    (on: boolean) => {
      if (on) {
        const player = new PcmPlayer();
        playerRef.current = player;
        player.setVolume(0.75);
        player.start(); // called from the click gesture
        unsubRef.current = ws.onPcm((chunk) => {
          player.push(chunk.userIdHash, chunk.samples);
        });
        timerRef.current = setInterval(() => {
          setLevels(player.getLevels());
        }, 100);
        setActive(true);
      } else {
        stop();
      }
    },
    [ws, stop],
  );

  const setVolume = useCallback((v: number) => {
    playerRef.current?.setVolume(v / 100);
  }, []);

  useEffect(() => stop, [stop]);

  return { active, levels, toggle, setVolume };
}
