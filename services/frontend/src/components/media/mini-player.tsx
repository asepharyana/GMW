"use client";

import { ListMusic, SkipForward, Square } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  useMediaLoop,
  useMediaSkip,
  useMediaState,
  useMediaStop,
  useMediaWsSync,
} from "@/hooks";
import { formatDuration } from "@/lib/format";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

/**
 * Persistent now-playing bar, fixed above the mobile dock / bottom of the
 * viewport. Hidden on the /media route (the full player lives there) and
 * entirely when nothing is queued. Shares the SWR media-state cache with
 * every other consumer, so state stays consistent across routes.
 */
export function MiniPlayer() {
  const ws = useWebSocket();
  const pathname = usePathname();
  const { data: media } = useMediaState();
  useMediaWsSync(ws);
  const skip = useMediaSkip();
  const stop = useMediaStop();
  const loop = useMediaLoop();
  const ambient = useAmbient();

  const hidden = pathname === "/media";
  const current = hidden ? null : (media?.current ?? null);
  const playing = media?.playing ?? false;
  const queueLen = (media?.queue ?? []).length;

  // Keep the ambient tint in sync while the bar is visible on non-media routes.
  useEffect(() => {
    if (hidden || !current) return;
    ambient.set(
      playing ? "signal" : "amber",
      playing ? 0.4 : 0.2,
      "mini-player",
    );
  }, [hidden, current, playing, ambient]);

  if (!current) return null;

  return (
    <div
      className={cn(
        "pointer-events-auto fixed inset-x-3 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-40",
        "md:inset-x-auto md:right-5 md:bottom-5 md:w-[22rem]",
        "animate-fade-up",
      )}
    >
      <div className="glass flex items-center gap-3 rounded-[14px] px-3 py-2.5 shadow-[0_12px_40px_-16px_oklch(0_0_0/0.7)]">
        <Link
          href="/media"
          className="flex min-w-0 flex-1 items-center gap-3"
          aria-label="Open full media player"
        >
          <span className="relative flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-hairline bg-surface-2">
            {current.thumbnailUrl ? (
              // biome-ignore lint/performance/noImgElement: external CDN thumbnails, next/image needs remote allowlist
              <img
                src={current.thumbnailUrl}
                alt=""
                className={cn(
                  "size-full object-cover",
                  playing && "animate-spin-disc",
                )}
                loading="lazy"
              />
            ) : (
              <ListMusic
                className={cn(
                  "size-4",
                  playing ? "text-signal" : "text-ink-faint",
                )}
              />
            )}
            {playing && (
              <span
                aria-hidden
                className="absolute -inset-1 rounded-full border border-signal/30 animate-pulse-ring"
              />
            )}
          </span>
          <span className="min-w-0 flex-1">
            <span className="eyebrow block !text-[0.55rem] leading-tight">
              {playing ? (
                <span className="inline-flex items-center gap-1.5">
                  <span aria-hidden className="flex h-2 items-end gap-[2px]">
                    {[0, 1].map((i) => (
                      <span
                        key={`eq-${i}`}
                        className="w-[3px] animate-eq rounded-full bg-signal"
                        style={{
                          animationDelay: `${i * 180}ms`,
                          height: "100%",
                        }}
                      />
                    ))}
                  </span>
                  now playing
                </span>
              ) : (
                "paused"
              )}
            </span>
            <span className="block truncate text-sm text-ink">
              {current.title}
            </span>
            {current.durationMs != null && (
              <span className="mono block text-[0.6rem] text-ink-faint">
                {formatDuration(current.durationMs)}
                {queueLen > 0 && ` · ${queueLen} in queue`}
              </span>
            )}
          </span>
        </Link>

        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={() => skip.mutate()}
            disabled={skip.isPending}
            aria-label="Skip to next track"
            className="flex size-8 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-signal active:scale-95"
          >
            <SkipForward className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => stop.mutate()}
            disabled={stop.isPending}
            aria-label="Stop playback"
            className="flex size-8 items-center justify-center rounded-full text-ink-faint transition-colors hover:bg-vermilion/15 hover:text-vermilion active:scale-95"
          >
            <Square className="size-3.5" />
          </button>
          <button
            type="button"
            onClick={() => loop.mutate(!media?.loop)}
            aria-pressed={!!media?.loop}
            aria-label="Toggle loop"
            className={`hidden size-8 items-center justify-center rounded-full text-xs transition-colors sm:flex ${
              media?.loop
                ? "bg-signal/15 text-signal"
                : "text-ink-faint hover:bg-surface hover:text-ink"
            }`}
          >
            ↻
          </button>
        </div>
      </div>
    </div>
  );
}
