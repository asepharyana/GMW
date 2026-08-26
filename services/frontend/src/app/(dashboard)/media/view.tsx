"use client";

import { Disc, Play, Repeat, SkipForward, Square } from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Equalizer } from "@/components/charts";
import { Button, GlassPanel, Input, toast } from "@/components/primitives";
import {
  ErrorState,
  PageTransition,
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
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatDuration } from "@/lib/format";
import type { MediaState } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function MediaView({ initialStatus }: { initialStatus?: MediaState }) {
  const ws = useWebSocket();
  const {
    data: media,
    isLoading,
    error,
    mutate,
  } = useMediaState(initialStatus);
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

  const mediaRef = useStaggerReveal<HTMLDivElement>(".media-tile", {
    stagger: 0.04,
    y: 8,
    dependencies: [playing, queueList.length],
  });

  const tone = playing ? "signal" : queueList.length ? "amber" : "signal";
  useEffect(() => {
    ambient.set(
      tone,
      playing ? 0.45 : 0.2,
      playing ? "playing stream" : "media ready",
    );
  }, [tone, playing, ambient]);

  const onPlay = async () => {
    const u = url.trim();
    if (!u) {
      toast({ title: "Enter media URL", tone: "vermilion" });
      return;
    }
    try {
      await queue.mutateAsync({ url: u, mode: "music" });
      setUrl("");
      toast({ title: "Track queued", tone: "signal" });
    } catch (e) {
      toast({
        title: "Queue failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  if (error && !media)
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  if (!media && isLoading)
    return (
      <div className="space-y-4">
        <SkeletonHero />
        <SkeletonPanel rows={3} />
      </div>
    );

  const mockLevels = playing
    ? [0.4, 0.7, 0.9, 0.6, 0.8, 0.5, 0.9, 0.7, 0.4, 0.8, 0.6, 0.9]
    : [0.08, 0.08, 0.08, 0.08, 0.08, 0.08];

  return (
    <PageTransition>
      <div ref={mediaRef} className="space-y-4">
        {/* Precision Sub-Header Bar */}
        <div className="media-tile flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
          <div className="flex items-center gap-2.5">
            <span
              className={`h-2 w-2 rounded-full ${
                playing
                  ? "bg-signal shadow-[0_0_8px_var(--color-signal-glow)]"
                  : "bg-ink-muted"
              }`}
            />
            <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
              Audio Engine · Media Gateway
            </h1>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <span className="text-ink-muted">ENGINE:</span>
            <span
              className={`rounded px-1.5 py-0.5 font-medium border ${
                playing
                  ? "border-signal/30 bg-signal/10 text-signal"
                  : "border-hairline bg-surface-2 text-ink-muted"
              }`}
            >
              {playing ? "STREAMING" : "IDLE"}
            </span>
          </div>
        </div>

        {/* Media Playback Deck */}
        <div className="media-tile">
          <GlassPanel className="p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="flex items-center gap-3.5">
                <div className="flex size-11 items-center justify-center rounded-[8px] border border-hairline bg-surface-2 text-signal">
                  <Disc
                    className={`size-6 ${playing ? "animate-spin-disc text-signal" : "text-ink-muted"}`}
                  />
                </div>
                <div>
                  <div className="text-sm font-semibold tracking-tight text-ink">
                    {current?.title ?? "No Active Media Stream"}
                  </div>
                  <div className="font-mono text-[11px] text-ink-muted">
                    {current
                      ? `${formatDuration(current.durationMs ?? 0)} · High Fidelity Stream`
                      : "Queue a track via URL below"}
                  </div>
                </div>
              </div>

              {/* Controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => loop.mutateAsync()}
                  className={media?.loop ? "border-signal text-signal" : ""}
                >
                  <Repeat className="size-3.5" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => skip.mutateAsync()}
                >
                  <SkipForward className="size-3.5" />
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => stop.mutateAsync()}
                >
                  <Square className="size-3.5" />
                </Button>
              </div>
            </div>

            {/* Quick URL Input */}
            <div className="mt-4 flex gap-2 border-t border-hairline pt-4">
              <Input
                placeholder="Paste YouTube, SoundCloud, or Direct Stream URL..."
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                className="flex-1 text-xs"
              />
              <Button variant="primary" size="md" onClick={onPlay}>
                <Play className="size-3.5" />
                Queue Track
              </Button>
            </div>
          </GlassPanel>
        </div>

        {/* Spectrum & Queue Grid */}
        <div className="grid gap-3 lg:grid-cols-3">
          <GlassPanel className="media-tile lg:col-span-2">
            <SectionHeader
              eyebrow="Visualizer"
              title="Realtime Frequency Array"
            />
            <div className="my-6 flex items-center justify-center">
              <Equalizer bars={mockLevels} />
            </div>
          </GlassPanel>

          <GlassPanel className="media-tile">
            <SectionHeader
              eyebrow="Playlist"
              title={`Queue (${queueList.length})`}
            />
            <div className="mt-3 space-y-2">
              {queueList.length === 0 ? (
                <div className="py-8 text-center font-mono text-xs text-ink-muted">
                  QUEUE EMPTY
                </div>
              ) : (
                queueList.map((item, idx) => (
                  <div
                    key={item.id ?? idx}
                    className="flex items-center justify-between rounded-[6px] border border-hairline bg-surface-2 p-2.5 text-xs text-ink-soft"
                  >
                    <span className="truncate pr-2 font-medium">
                      {item.title}
                    </span>
                    <span className="font-mono text-[10px] text-ink-muted shrink-0">
                      {formatDuration(item.durationMs ?? 0)}
                    </span>
                  </div>
                ))
              )}
            </div>
          </GlassPanel>
        </div>
      </div>
    </PageTransition>
  );
}
