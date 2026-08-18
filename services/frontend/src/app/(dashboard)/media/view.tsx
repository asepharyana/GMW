"use client";

import {
  ListMusic,
  Play,
  Radio,
  Repeat,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Button, GlassPanel, Input, toast } from "@/components/primitives";
import {
  ErrorState,
  SectionHeader,
  SkeletonHero,
  SkeletonPanel,
} from "@/components/shared";
import {
  useMediaLoop,
  useMediaQueue,
  useMediaSkip,
  useMediaState,
  useMediaStop,
  useMediaWsSync,
} from "@/hooks";
import { formatDuration } from "@/lib/format";
import type { MediaState } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function MediaView({ initialStatus }: { initialStatus?: MediaState }) {
  const ws = useWebSocket();
  const { data: media, isLoading, error } = useMediaState(initialStatus);
  const queue = useMediaQueue();
  const skip = useMediaSkip();
  const stop = useMediaStop();
  const loop = useMediaLoop();
  useMediaWsSync(ws);
  const ambient = useAmbient();

  const [url, setUrl] = useState("");

  const playing = media?.playing ?? false;
  const current = media?.current ?? null;
  const queueList = media?.queue ?? [];
  const queueTotal = queueList.reduce(
    (acc, it) => acc + (it.durationMs ?? 0),
    0,
  );

  const tone = playing ? "signal" : queueList.length ? "amber" : "signal";
  useEffect(() => {
    ambient.set(
      tone,
      playing ? 0.5 : 0.25,
      playing ? "now playing" : "media idle",
    );
  }, [tone, playing, ambient]);

  const onPlay = async () => {
    const u = url.trim();
    if (!u) {
      toast({ title: "Enter a media URL", tone: "vermilion" });
      return;
    }
    try {
      await queue.mutateAsync({ url: u, mode: "music" });
      setUrl("");
      toast({ title: "Queued", tone: "signal" });
    } catch (e) {
      toast({
        title: "Queue failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  if (error && !media) return <ErrorState error={error} />;
  if (!media && isLoading)
    return (
      <div className="space-y-5">
        <SkeletonHero />
        <SkeletonPanel rows={4} />
      </div>
    );

  return (
    <div className="space-y-5">
      <GlassPanel glow className="relative overflow-hidden">
        <div className="scan-line absolute inset-x-0 top-0" />
        <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
          <div
            className={`flex size-32 shrink-0 items-center justify-center rounded-full border border-hairline bg-gradient-to-br from-white/10 to-white/[0.02] ${playing ? "animate-spin-disc" : "animate-spin-disc paused"}`}
          >
            <div className="flex size-28 items-center justify-center rounded-full bg-canvas/60">
              <ListMusic className="size-10 text-signal" />
            </div>
          </div>

          <div className="min-w-0 flex-1">
            <div className="eyebrow mb-1">Now playing</div>
            <h2 className="display text-balance text-2xl text-ink">
              {current?.title ?? "Nothing queued"}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-ink-faint">
              {current?.source && (
                <span className="mono truncate">{current.source}</span>
              )}
              {current?.mode && (
                <span className="pill capitalize">{current.mode}</span>
              )}
              {formatDuration(current?.durationMs) && (
                <span className="mono">
                  {formatDuration(current?.durationMs)}
                </span>
              )}
            </div>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Button
                variant="primary"
                size="sm"
                onClick={onPlay}
                disabled={queue.isPending}
              >
                <Play className="size-4" /> Queue & play
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => skip.mutate()}
                disabled={skip.isPending}
              >
                <SkipForward className="size-4" /> Skip
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => stop.mutate()}
                disabled={stop.isPending}
              >
                <Square className="size-4" /> Stop
              </Button>
              <Button
                variant={media?.loop ? "primary" : "outline"}
                size="sm"
                onClick={() => loop.mutate(!media?.loop)}
                aria-pressed={!!media?.loop}
              >
                <Repeat className="size-4" /> Loop
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <div className="relative min-w-0 flex-1">
            <Input
              placeholder="Paste a YouTube / music URL…"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onPlay()}
            />
          </div>
          <div className="flex shrink-0 items-center gap-2 rounded-[10px] border border-hairline bg-white/5 px-3 py-2.5">
            <Volume2 className="size-4 text-ink-faint" />
            <div className="h-1.5 w-24 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-signal/70"
                style={{
                  width: `${Math.round((media?.musicVolume ?? 0) * 100)}%`,
                }}
              />
            </div>
            <span className="mono w-9 text-right text-[0.65rem] text-ink-faint">
              {Math.round((media?.musicVolume ?? 0) * 100)}%
            </span>
          </div>
        </div>
      </GlassPanel>

      <GlassPanel>
        <SectionHeader
          eyebrow="up next"
          title="Queue"
          action={
            <span className="mono text-xs text-ink-faint">
              {queueList.length} track{queueList.length === 1 ? "" : "s"}
              {queueTotal && ` · ${formatDuration(queueTotal)}`}
            </span>
          }
        />
        {queueList.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-10 text-center">
            <Radio className="size-6 text-ink-faint" />
            <div className="text-sm text-ink-soft">Queue is empty</div>
            <div className="text-xs text-ink-faint">
              Paste a URL above to start playback.
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {queueList.map((item, i) => (
              <div
                key={`${item.source}-${i}`}
                className="flex items-center gap-3 rounded-[10px] border border-hairline bg-white/5 px-3 py-2.5"
              >
                <span className="mono w-5 text-ink-faint">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm text-ink">{item.title}</div>
                  <div className="mono truncate text-[0.65rem] text-ink-faint">
                    {item.source}
                  </div>
                </div>
                <span className="pill capitalize">{item.mode ?? "music"}</span>
                {formatDuration(item.durationMs) && (
                  <span className="mono w-10 text-right text-[0.65rem] text-ink-faint">
                    {formatDuration(item.durationMs)}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </GlassPanel>
    </div>
  );
}
