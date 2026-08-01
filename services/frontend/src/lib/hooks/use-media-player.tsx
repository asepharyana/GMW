"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { mediaApi } from "@/lib/api";
import type { MediaItem, MediaState } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

interface MediaPlayerContextValue {
  /** Current play state */
  playing: boolean;
  /** Current track, or null */
  current: MediaItem | null;
  /** Upcoming queue */
  queue: MediaItem[];
  /** Current volume [0-1] */
  volume: number;
  /** True while a mutation is in flight */
  pending: boolean;

  /** Skip to next track */
  skip: () => void;
  /** Stop playback */
  stop: () => void;
  /** Set volume [0-1] */
  setVolume: (vol: number) => void;
  /** Queue a URL for playback */
  queueUrl: (url: string) => void;
}

const MediaPlayerContext = createContext<MediaPlayerContextValue | null>(null);

export function MediaPlayerProvider({ children }: { children: ReactNode }) {
  const ws = useWebSocket();
  const [state, setState] = useState<MediaState>({
    playing: false,
    musicVolume: 0.5,
    current: null,
    queue: [],
  });
  const [pending, setPending] = useState(false);
  const fetched = useRef(false);

  // Fetch initial state
  useEffect(() => {
    if (fetched.current) return;
    fetched.current = true;
    mediaApi
      .getStatus()
      .then((data) => {
        if (data) setState(data as MediaState);
      })
      .catch(() => {
        // API not yet available
      });
  }, []);

  // Subscribe to live media_state events via WS
  useEffect(() => {
    const unsub = ws.on("media_state", (data) => {
      setState(data as unknown as MediaState);
    });
    return unsub;
  }, [ws]);

  const skip = useCallback(() => {
    setPending(true);
    mediaApi
      .skip()
      .then((data) => {
        if (data) setState(data as MediaState);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setPending(false));
  }, []);

  const stop = useCallback(() => {
    setPending(true);
    mediaApi
      .stop()
      .then((data) => {
        if (data) setState(data as MediaState);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setPending(false));
  }, []);

  const setVolume = useCallback((vol: number) => {
    mediaApi
      .volume(vol)
      .then((data) => {
        if (data) setState(data as MediaState);
      })
      .catch(() => {
        // ignore
      });
  }, []);

  const queueUrl = useCallback((url: string) => {
    setPending(true);
    mediaApi
      .queue(url, "music")
      .then((data) => {
        if (data) setState(data as MediaState);
      })
      .catch(() => {
        // ignore
      })
      .finally(() => setPending(false));
  }, []);

  return (
    <MediaPlayerContext.Provider
      value={{
        playing: state.playing,
        current: state.current,
        queue: state.queue,
        volume: state.musicVolume,
        pending,
        skip,
        stop,
        setVolume,
        queueUrl,
      }}
    >
      {children}
    </MediaPlayerContext.Provider>
  );
}

export function useMediaPlayer(): MediaPlayerContextValue {
  const ctx = useContext(MediaPlayerContext);
  if (!ctx) {
    throw new Error("useMediaPlayer must be used within a MediaPlayerProvider");
  }
  return ctx;
}
