"use client";

import { Play, SkipForward, Volume2, X } from "lucide-react";
import { useMediaPlayer } from "@/lib/hooks/use-media-player";

export function MiniPlayer() {
  const { currentTrack, playing, volume, skip, stop, setVolume } = useMediaPlayer();

  if (!currentTrack) return null;

  return (
    <div className="fixed bottom-16 md:bottom-4 left-4 z-30 glass-elevated rounded-[var(--radius-card)] p-3 w-64 shadow-2xl">
      <div className="flex items-center gap-2 mb-2">
        <div className="size-6 flex items-center justify-center rounded bg-primary/20">
          <Play className="size-3 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">{currentTrack.title}</p>
          {currentTrack.artist && (
            <p className="text-[10px] text-text-secondary/50 truncate">{currentTrack.artist}</p>
          )}
        </div>
        <button type="button" onClick={stop} className="size-5 flex items-center justify-center hover:bg-glass-bg rounded">
          <X className="size-3 text-text-secondary/60" />
        </button>
      </div>
      <div className="flex items-center gap-2">
        <button type="button" onClick={skip} className="size-6 flex items-center justify-center hover:bg-glass-bg rounded">
          <SkipForward className="size-3 text-text-secondary/60" />
        </button>
        <Volume2 className="size-3 text-text-secondary/40" />
        <input
          type="range"
          min={0}
          max={100}
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="flex-1 h-1 appearance-none bg-glass-border rounded-full accent-primary [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-2.5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
        />
      </div>
    </div>
  );
}
