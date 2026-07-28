"use client";

import { createContext, useContext, useState, type ReactNode } from "react";

interface Track {
  id: string;
  title: string;
  artist?: string;
  duration?: number;
}

interface MediaPlayerState {
  currentTrack: Track | null;
  queue: Track[];
  playing: boolean;
  volume: number;
}

interface MediaPlayerContextType extends MediaPlayerState {
  play: (track: Track) => void;
  skip: () => void;
  stop: () => void;
  setVolume: (v: number) => void;
  addToQueue: (track: Track) => void;
  removeFromQueue: (id: string) => void;
}

const MediaPlayerContext = createContext<MediaPlayerContextType | null>(null);

export function MediaPlayerProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<MediaPlayerState>({
    currentTrack: null,
    queue: [],
    playing: false,
    volume: 75,
  });

  const play = (track: Track) => {
    setState((prev) => ({ ...prev, currentTrack: track, playing: true }));
  };

  const skip = () => {
    setState((prev) => {
      if (prev.queue.length === 0) return { ...prev, currentTrack: null, playing: false };
      const [next, ...rest] = prev.queue;
      return { ...prev, currentTrack: next, queue: rest };
    });
  };

  const stop = () => {
    setState((prev) => ({ ...prev, currentTrack: null, playing: false }));
  };

  const setVolume = (volume: number) => {
    setState((prev) => ({ ...prev, volume }));
  };

  const addToQueue = (track: Track) => {
    setState((prev) => ({ ...prev, queue: [...prev.queue, track] }));
  };

  const removeFromQueue = (id: string) => {
    setState((prev) => ({ ...prev, queue: prev.queue.filter((t) => t.id !== id) }));
  };

  return (
    <MediaPlayerContext.Provider value={{ ...state, play, skip, stop, setVolume, addToQueue, removeFromQueue }}>
      {children}
    </MediaPlayerContext.Provider>
  );
}

export function useMediaPlayer() {
  const ctx = useContext(MediaPlayerContext);
  if (!ctx) throw new Error("useMediaPlayer must be used within MediaPlayerProvider");
  return ctx;
}
