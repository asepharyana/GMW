"use client";

import { Disc3, Music, Repeat, SkipForward, Square } from "lucide-react";
import { useMediaPlayer } from "@/lib/hooks/use-media-player";

export function MiniPlayer() {
  const { playing, current, queue, loop, pending, skip, stop, toggleLoop } =
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
        <button
          type="button"
          onClick={() => toggleLoop()}
          disabled={pending}
          className={`size-8 flex items-center justify-center rounded-md transition-colors disabled:opacity-40 ${
            loop
              ? "text-primary bg-glass-bg"
              : "text-text-secondary hover:text-text-primary hover:bg-glass-bg"
          }`}
          aria-label={loop ? "Loop on" : "Loop off"}
          aria-pressed={loop}
        >
          <Repeat className="size-3.5" />
        </button>
      </div>
    </div>
  );
}
