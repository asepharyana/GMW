import { useCallback, useEffect, useRef, useState } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { voiceApi } from "@/lib/api";
import { MicTransmitter } from "@/lib/audio/mic-transmit";
import { PcmPlayer } from "@/lib/audio/pcm-player";
import { hashUserId } from "@/lib/hash";
import type { ActiveSpeaker, Channel, VoiceStatus } from "@/lib/types";
import type { PcmChunk } from "@/lib/ws/types";
import type { WsHook } from "@/lib/ws-hook";

// Re-export for components that still import hashUserId from this module.
export { hashUserId };

const STATUS_KEY = ["voice-status"] as const;

export function useVoiceStatus(initialData?: VoiceStatus) {
  return useSWR<VoiceStatus>(STATUS_KEY, () => voiceApi.getStatus(), {
    shouldRetryOnError: false,
    fallbackData: initialData,
    refreshInterval: 4000,
  });
}

export function useVoiceChannels(guildId: string) {
  return useSWR<Channel[]>(guildId ? ["voice-channels", guildId] : null, () =>
    voiceApi.getVoiceChannels(guildId),
  );
}

const SPEAKERS_KEY = ["voice-speakers"] as const;

/**
 * Live shared speaker state.
 *
 * Seeded from the server-authored snapshot (`initial` — the voice status the
 * server rendered, which includes the authoritative active speakers). From
 * there the WS keeps it converged across ALL users:
 *  - `voice_state` → authoritative FULL replacement (e.g. a late join seeds
 *    every client with the same list);
 *  - `voice_active_user` → incremental upsert of a single speaker delta.
 *
 * Now backed by SWR (consistent with all other hooks) so cache, revalidation,
 * and deduping apply. WS events mutate the SWR cache directly
 * ({ revalidate: false }) to avoid refetching the full status.
 *
 * This replaces the old per-browser model where each tab accumulated speakers
 * only from events it happened to receive while mounted.
 */
export function useSpeakers(initialStatusActive?: ActiveSpeaker[]) {
  const {
    data: speakers,
    error,
    mutate,
    isValidating,
  } = useSWR<ActiveSpeaker[]>(SPEAKERS_KEY, () => Promise.resolve([]), {
    fallbackData: initialStatusActive ?? [],
    revalidateOnMount: false,
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
  });

  const subscribe = useCallback(
    (ws: WsHook) => {
      const unsubSnapshot = ws.on("voice_state", (data) => {
        const state = data as { activeSpeakers?: ActiveSpeaker[] };
        if (Array.isArray(state?.activeSpeakers)) {
          void mutate(state.activeSpeakers, { revalidate: false });
        }
      });
      const unsub = ws.on("voice_active_user", (data) => {
        const speaker = data as ActiveSpeaker;
        void mutate(
          (prev: ActiveSpeaker[] | undefined) => {
            const arr = prev ?? [];
            const idx = arr.findIndex((s) => s.userId === speaker.userId);
            if (idx >= 0) {
              const next = [...arr];
              next[idx] = speaker;
              return next;
            }
            return [...arr, speaker];
          },
          { revalidate: false },
        );
      });
      return () => {
        unsubSnapshot();
        unsub();
      };
    },
    [mutate],
  );

  return { speakers: speakers ?? [], subscribe, error, isValidating };
}

function useStatusInvalidator() {
  const { mutate } = useSWRConfig();
  return useCallback(() => {
    void mutate(STATUS_KEY);
  }, [mutate]);
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
  const [micLevel, setMicLevel] = useState(0);

  const action = useAction(async (active: boolean) => {
    if (active) {
      const transmitter = new MicTransmitter((frame) => ws.sendBinary(frame));
      transmitterRef.current = transmitter;
      await transmitter.start();
      await voiceApi.sendCommand("voice:transmit:start");
    } else {
      transmitterRef.current?.stop();
      transmitterRef.current = null;
      setMicLevel(0);
      await voiceApi.sendCommand("voice:transmit:stop");
    }
  });

  const setVolume = useCallback((volume: number) => {
    transmitterRef.current?.setVolume(volume / 100);
  }, []);

  // Poll the analyser RMS so the UI can render a live input meter.
  useEffect(() => {
    const timer = setInterval(() => {
      setMicLevel(transmitterRef.current?.getLevel() ?? 0);
    }, 120);
    return () => clearInterval(timer);
  }, []);

  return { ...action, setVolume, micLevel };
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
