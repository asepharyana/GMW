"use client";

import {
  Disc,
  ListMusic,
  Play,
  Repeat,
  SkipForward,
  Sliders,
  Square,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Equalizer } from "@/components/charts";
import { Button, GlassPanel, Input, toast } from "@/components/primitives";
import {
  ErrorState,
  PageTransition,
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
  const queueTotal = queueList.reduce(
    (acc, it) => acc + (it.durationMs ?? 0),
    0,
  );

  const mediaRef = useStaggerReveal<HTMLDivElement>(".media-tile", {
    stagger: 0.06,
    y: 16,
    dependencies: [playing, queueList.length],
  });

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
      toast({ title: "Queued track", tone: "signal" });
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
      <div className="space-y-5">
        <SkeletonHero />
        <SkeletonPanel rows={4} />
      </div>
    );

  const mockLevels = playing
    ? [0.4, 0.7, 0.9, 0.6, 0.8, 0.5, 0.9, 0.7, 0.4, 0.8, 0.6, 0.9]
    : [0.1, 0.1, 0.1, 0.1, 0.1, 0.1];

  return (
    <PageTransition>
      <div ref={mediaRef} className="space-y-5">
        {/* Top Media Matrix Stage */}
        <div className="media-tile relative overflow-hidden rounded-xl border border-hairline/80 bg-surface/40 p-6 shadow-2xl backdrop-blur-xl">
          {/* Spatial Grid Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-hairline/60 pb-4">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-canvas-2 border border-hairline text-signal shadow-inner">
                <Disc
                  className={`size-5 ${playing ? "animate-spin-disc text-signal" : "text-ink-faint"}`}
                />
              </div>
              <div>
                <h1 className="font-mono text-sm font-bold tracking-widest text-ink uppercase">
                  MEDIA FREQUENCY DECK
                </h1>
                <div className="font-mono text-[11px] text-ink-faint">
                  {playing
                    ? "STREAM_ACTIVE · 48KHZ STEREO"
                    : "DECK_IDLE · STANDBY"}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 font-mono text-xs font-semibold ${playing ? "bg-signal/10 text-signal border border-signal/30" : "bg-surface text-ink-faint border border-hairline"}`}
              >
                <span
                  className={`size-1.5 rounded-full ${playing ? "bg-signal animate-breathe" : "bg-ink-faint"}`}
                />
                {playing ? "TRANSMITTING" : "STANDBY"}
              </span>
            </div>
          </div>

          {/* Player Core View */}
          <div className="mt-6 grid gap-6 lg:grid-cols-12 items-center">
            {/* Vinyl & Visualizer Stage */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <div className="relative flex size-44 items-center justify-center rounded-full border-2 border-dashed border-hairline/60 bg-canvas-2 shadow-2xl">
                <div
                  className={`absolute inset-2 rounded-full border border-hairline/30 ${playing ? "animate-spin-disc" : ""}`}
                />
                {current?.thumbnailUrl ? (
                  <div
                    className="size-32 rounded-full bg-cover bg-center border-2 border-hairline/80 shadow-lg"
                    style={{ backgroundImage: `url(${current.thumbnailUrl})` }}
                  />
                ) : (
                  <div className="flex size-32 items-center justify-center rounded-full bg-surface border border-hairline">
                    <ListMusic className="size-12 text-ink-faint" />
                  </div>
                )}
                {playing && (
                  <div className="absolute -inset-2 rounded-full ring-2 ring-signal/40 animate-pulse-ring pointer-events-none" />
                )}
              </div>
            </div>

            {/* Current Track Telemetry & Controls */}
            <div className="lg:col-span-7 space-y-4">
              <div>
                <div className="font-mono text-[10px] font-bold tracking-widest text-signal uppercase">
                  {current ? "CURRENT TRANSMISSION" : "DECK UNLOADED"}
                </div>
                <h2 className="text-xl font-bold text-ink mt-1 truncate">
                  {current?.title ?? "No active stream"}
                </h2>
                <div className="font-mono text-xs text-ink-soft mt-1">
                  {current?.source
                    ? `Source: ${current.source}`
                    : "Queue a URL below to broadcast"}
                </div>
              </div>

              {/* Realtime Equalizer preview */}
              <div className="h-12 w-full rounded-md border border-hairline bg-canvas-2/50 p-2">
                <Equalizer
                  bars={mockLevels}
                  color={
                    playing ? "var(--color-signal)" : "var(--color-ink-faint)"
                  }
                />
              </div>

              {/* Interactive Playback Toolbar */}
              <div className="flex flex-wrap items-center gap-2.5 pt-2">
                <Button
                  variant="primary"
                  onClick={() => stop.mutateAsync()}
                  disabled={!playing || stop.isPending}
                  className="font-mono text-xs font-bold"
                >
                  <Square className="mr-1.5 size-3.5" /> STOP
                </Button>

                <Button
                  variant="outline"
                  onClick={() => skip.mutateAsync()}
                  disabled={!playing || skip.isPending}
                  className="font-mono text-xs font-bold"
                >
                  <SkipForward className="mr-1.5 size-3.5" /> SKIP
                </Button>

                <Button
                  variant={media?.loop ? "primary" : "outline"}
                  onClick={() => loop.mutateAsync(!media?.loop)}
                  disabled={loop.isPending}
                  className="font-mono text-xs font-bold"
                >
                  <Repeat className="mr-1.5 size-3.5" /> LOOP{" "}
                  {media?.loop ? "ON" : "OFF"}
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* Ingest & Queue Spatial Deck */}
        <div className="grid gap-5 lg:grid-cols-12">
          {/* URL Ingest Box */}
          <div className="media-tile lg:col-span-5 space-y-4">
            <GlassPanel className="rounded-xl border border-hairline/80 bg-surface/40 p-5 shadow-xl backdrop-blur-xl">
              <div className="font-mono text-xs font-bold tracking-wider text-ink uppercase mb-3 flex items-center justify-between">
                <span>INJECT AUDIO STREAM</span>
                <Sliders className="size-4 text-signal" />
              </div>
              <div className="space-y-3">
                <Input
                  value={url}
                  onChange={(e) => setUrl(e.target.value)}
                  placeholder="Paste YouTube or Audio URL..."
                  className="font-mono text-xs"
                />
                <Button
                  variant="primary"
                  onClick={onPlay}
                  disabled={queue.isPending || !url.trim()}
                  className="w-full font-mono text-xs font-bold py-2.5"
                >
                  <Play className="mr-1.5 size-4" /> BROADCAST STREAM
                </Button>
              </div>
            </GlassPanel>
          </div>

          {/* Queue List Stage */}
          <div className="media-tile lg:col-span-7">
            <GlassPanel className="rounded-xl border border-hairline/80 bg-surface/40 p-5 shadow-xl backdrop-blur-xl">
              <div className="flex items-center justify-between border-b border-hairline/60 pb-3 mb-3">
                <div className="font-mono text-xs font-bold tracking-wider text-ink uppercase">
                  QUEUE STACK ({queueList.length})
                </div>
                <div className="font-mono text-[11px] text-ink-faint">
                  Total: {formatDuration(queueTotal)}
                </div>
              </div>

              <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                {queueList.length > 0 ? (
                  queueList.map((item, idx) => (
                    <div
                      key={item.id ?? idx}
                      className="flex items-center justify-between rounded-lg border border-hairline bg-surface/30 p-2.5 font-mono text-xs transition hover:border-signal/40"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span className="text-ink-faint font-bold">
                          {idx + 1}.
                        </span>
                        <span className="truncate text-ink font-medium">
                          {item.title ?? "Unknown Track"}
                        </span>
                      </div>
                      <span className="text-ink-faint text-[11px] shrink-0 ml-2">
                        {formatDuration(item.durationMs ?? 0)}
                      </span>
                    </div>
                  ))
                ) : (
                  <div className="py-8 text-center font-mono text-xs text-ink-faint">
                    NO QUEUED AUDIO IN BUFFER
                  </div>
                )}
              </div>
            </GlassPanel>
          </div>
        </div>
      </div>
    </PageTransition>
  );
}
