"use client";

import { Pause, Play, SkipForward, Volume2 } from "lucide-react";
import { motion } from "motion/react";
import { Button } from "@/components/primitives/button";
import { useMediaSkip, useMediaState, useMediaWsSync } from "@/hooks";
import { useMediaPlayer } from "@/lib/hooks/use-media-player";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function MiniPlayer() {
  const ws = useWebSocket();
  const { data: state } = useMediaState();
  const { playing, current } = useMediaPlayer();
  useMediaWsSync(ws);
  const skip = useMediaSkip();

  if (!current) return null;

  return (
    <motion.div
      initial={{ y: 100, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      exit={{ y: 100, opacity: 0 }}
      transition={{ type: "spring", stiffness: 320, damping: 30 }}
      className={cn(
        "pointer-events-auto fixed inset-x-0 bottom-20 z-30 mx-auto w-[calc(100%-2rem)] max-w-[480px]",
        "surface flex items-center gap-3 px-3 py-2 text-sm",
      )}
    >
      <img
        src={current.thumbnailUrl ?? "/favicon.ico"}
        alt={current.title}
        className="size-9 rounded-[var(--radius-r-control)] object-cover"
      />
      <div className="min-w-0 flex-1">
        <div className="truncate font-medium">{current.title}</div>
        <div className="text-xs text-[var(--color-ink-soft)] mono">
          {current.source}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button size="sm" variant="ghost" onClick={() => skip.mutate()}>
          <SkipForward className="size-3.5" />
        </Button>
        <Button
          size="sm"
          variant={playing ? "primary" : "ghost"}
          onClick={() =>
            state?.playing ? void skip.mutate() : void skip.mutate()
          }
        >
          {playing ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <Volume2 className="size-4 text-[var(--color-ink-soft)]" />
      </div>
    </motion.div>
  );
}
