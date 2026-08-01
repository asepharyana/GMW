"use client";

import { Disc3, Music, SkipForward, Square, Volume2 } from "lucide-react";
import { useMediaPlayer } from "@/lib/hooks/use-media-player";

export function MiniPlayer() {
  const { playing, current, queue, volume, pending, skip, stop, setVolume } =
    useMediaPlayer();

  // Nothing to show if no track is playing and nothing is queued
  if (!current && queue.length === 0) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 h-14 glass-intense border-t border-glass-border flex items-center gap-3 px-4 md:px-6">
      {/* Track info */}
      <div className="flex items-center gap-2.5 min-w-0 flex-1 max-w-[280px]">
        <div className="size-8 rounded-md bg-gradient-to-br from-primary/20 to-primary/5 border border-primary/10 flex items-center justify-center shrink-0">
          {playing ? (
            <Disc3
              className="size-4 text-primary animate-spin"
              style={{ animationDuration: "4s" }}
            />
          ) : (
            <Music className="size-4 text-text-secondary" />
          )}
        </div>
        <div className="min-w-0">
          <p className="text-xs font-medium text-text-primary truncate">
            {current?.title ?? "Unknown track"}
          </p>
          {queue.length > 0 && (
            <p className="text-[10px] text-text-secondary/60">
              {queue.length > 1 ? `${queue.length} in queue` : "1 in queue"}
            </p>
          )}
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 shrink-0">
        {playing && (
          <button
            type="button"
            onClick={stop}
            disabled={pending}
            className="size-8 flex items-center justify-center rounded-md text-text-secondary hover:text-destructive hover:bg-glass-bg transition-colors disabled:opacity-40"
            aria-label="Stop"
          >
            <Square className="size-3.5" />
          </button>
        )}
        {current && (
          <button
            type="button"
            onClick={skip}
            disabled={pending || queue.length === 0}
            className="size-8 flex items-center justify-center rounded-md text-text-secondary hover:text-text-primary hover:bg-glass-bg transition-colors disabled:opacity-40"
            aria-label="Skip"
          >
            <SkipForward className="size-3.5" />
          </button>
        )}
      </div>

      {/* Volume */}
      <div className="flex items-center gap-2 shrink-0 ml-2">
        <Volume2 className="size-3.5 text-text-secondary/60" />
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={volume}
          onChange={(e) => setVolume(Number(e.target.value))}
          className="w-20 h-1 appearance-none rounded-full bg-glass-bg accent-primary cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-primary"
          aria-label="Volume"
        />
      </div>
    </div>
  );
}
