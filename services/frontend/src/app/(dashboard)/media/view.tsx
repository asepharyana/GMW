"use client";

/**
 * Media scene — the queue becomes a spiral of nodes on the stage; the
 * player console (disc + transport + URL bar) floats bottom-left, and
 * the up-next list docks right.
 */
import {
  ListMusic,
  Play,
  Radio,
  Repeat,
  SkipForward,
  Square,
  Volume2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import { Button, Input, toast } from "@/components/primitives";
import { ErrorState, SkeletonHero } from "@/components/shared";
import {
  useSceneFocusSetter,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
import {
  useMediaLoop,
  useMediaQueue,
  useMediaSkip,
  useMediaState,
  useMediaStop,
  useMediaWsSync,
} from "@/hooks";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import { formatDuration } from "@/lib/format";
import type { MediaState } from "@/lib/types";
import { staggerDelay } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

function queueGraph(media: MediaState | undefined): ConstellationGraph {
  const items = (media?.queue ?? []).slice(0, 24);
  return {
    nodes: [
      {
        id: "now-playing",
        label: media?.current?.title ?? "media",
        kind: "guild",
        value: 1,
      },
      ...items.map((it, i) => ({
        id: `track:${i}:${it.source}`,
        label: it.title,
        kind: "media" as const,
        value: Math.max(0.2, 0.8 - i * 0.05),
        href: undefined,
      })),
    ],
    edges: items.map((it, i) => ({
      source: "now-playing",
      target: `track:${i}:${it.source}`,
    })),
  };
}

export function MediaView({ initialStatus }: { initialStatus?: MediaState }) {
  const ws = useWebSocket();
  const { data: media, isLoading, error } = useMediaState(initialStatus);
  const queue = useMediaQueue();
  const skip = useMediaSkip();
  const stop = useMediaStop();
  const loop = useMediaLoop();
  useMediaWsSync(ws);
  const ambient = useAmbient();
  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();

  const [url, setUrl] = useState("");

  const playing = media?.playing ?? false;
  const current = media?.current ?? null;
  const queueList = media?.queue ?? [];
  const queueTotal = queueList.reduce(
    (acc, it) => acc + (it.durationMs ?? 0),
    0,
  );

  const graph = useMemo(() => queueGraph(media), [media]);
  useEffect(() => {
    publish({ graph, focus: null });
  }, [graph, publish]);

  useEffect(
    () => () => {
      publish({ graph: { nodes: [], edges: [] }, focus: null });
      setFocus(null);
    },
    [publish, setFocus],
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
  if (!media && isLoading) return <SkeletonHero />;

  return (
    <div className="min-h-full">
      {/* Now playing — top-center whisper */}
      <section
        className="pointer-events-none absolute inset-x-0 top-16 hidden justify-center px-6 md:flex"
        aria-label="Now playing"
      >
        <div className="pointer-events-auto flex max-w-[52vw] items-center gap-3 rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/60 px-4 py-2 backdrop-blur-md">
          <div
            className={`flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-[var(--color-hairline)] ${playing ? "animate-spin-disc" : ""}`}
          >
            {current?.thumbnailUrl ? (
              // biome-ignore lint/performance/noImgElement: external CDN thumbnails, next/image needs remote allowlist
              <img
                src={current.thumbnailUrl}
                alt=""
                className="size-full object-cover"
                loading="lazy"
              />
            ) : (
              <ListMusic className="size-4 text-signal" />
            )}
          </div>
          <div className="min-w-0">
            <p className="eyebrow flex items-center gap-2">
              {playing ? (
                <span className="flex h-3 items-end gap-[2px]" aria-hidden>
                  {[0, 1, 2].map((i) => (
                    <span
                      key={`eq-${i}`}
                      className="w-[3px] animate-eq rounded-full bg-signal"
                      style={{ animationDelay: `${i * 160}ms`, height: "100%" }}
                    />
                  ))}
                </span>
              ) : null}
              {playing ? "Now playing" : current ? "Paused" : "Nothing queued"}
            </p>
            <p className="truncate text-sm text-[var(--color-ink)]">
              {current?.title ?? "Nothing queued"}
              {formatDuration(current?.durationMs)
                ? ` · ${formatDuration(current?.durationMs)}`
                : ""}
            </p>
          </div>
        </div>
      </section>

      {/* Console — bottom-left */}
      <section
        className="pointer-events-auto absolute bottom-20 left-5 z-20 w-[min(26rem,92vw)] space-y-2.5 rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/75 p-3 backdrop-blur-xl lg:bottom-24"
        aria-label="Player console"
      >
        <div className="relative">
          <Input
            placeholder="Paste a YouTube / music URL…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onPlay()}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="primary"
            size="sm"
            onClick={onPlay}
            disabled={queue.isPending}
          >
            <Play className="size-4" /> Queue &amp; play
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
          <div className="ml-auto flex items-center gap-2">
            <Volume2 className="size-4 text-[var(--color-ink-faint)]" />
            <div className="h-1.5 w-20 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-signal/70"
                style={{
                  width: `${Math.round((media?.musicVolume ?? 0) * 100)}%`,
                }}
              />
            </div>
            <span className="w-9 text-right font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
              {Math.round((media?.musicVolume ?? 0) * 100)}%
            </span>
          </div>
        </div>
      </section>

      {/* Up next — right dock */}
      <section
        className="pointer-events-auto absolute bottom-20 right-5 top-28 hidden w-[min(24rem,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/70 backdrop-blur-xl md:flex"
        aria-label="Up next"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2.5">
          <span className="eyebrow">up next</span>
          <span className="font-mono text-xs text-[var(--color-ink-faint)]">
            {queueList.length} track{queueList.length === 1 ? "" : "s"}
            {queueTotal ? ` · ${formatDuration(queueTotal)}` : ""}
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          {queueList.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-10 text-center">
              <Radio className="size-6 text-[var(--color-ink-faint)]" />
              <p className="text-sm text-[var(--color-ink-soft)]">
                Queue is empty
              </p>
              <p className="font-mono text-xs text-[var(--color-ink-faint)]">
                Paste a URL to start playback.
              </p>
            </div>
          ) : (
            <div className="space-y-1.5">
              {queueList.map((item, i) => {
                const isNext = i === 0 && playing;
                return (
                  <div
                    key={`${item.source}-${i}`}
                    className={`animate-stagger flex items-center gap-3 rounded-xl border px-3 py-2 ${
                      isNext
                        ? "border-signal/40 bg-signal/[0.07]"
                        : "border-[var(--color-hairline)]"
                    }`}
                    style={staggerDelay(i)}
                  >
                    <span className="w-5 font-mono text-xs text-[var(--color-ink-faint)]">
                      {i + 1}
                    </span>
                    {item.thumbnailUrl ? (
                      // biome-ignore lint/performance/noImgElement: external CDN thumbnails, next/image needs remote allowlist
                      <img
                        src={item.thumbnailUrl}
                        alt=""
                        className="size-9 shrink-0 rounded-md object-cover"
                        loading="lazy"
                      />
                    ) : (
                      <span className="flex size-9 shrink-0 items-center justify-center rounded-md border border-[var(--color-hairline)]">
                        <ListMusic className="size-4 text-[var(--color-ink-faint)]" />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-[var(--color-ink)]">
                        {item.title}
                      </p>
                      <p className="truncate font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                        {item.source}
                      </p>
                    </div>
                    {isNext ? (
                      <span className="shrink-0 rounded-full border border-signal/40 bg-signal/10 px-2 py-0.5 font-mono text-[0.6rem] text-signal">
                        up next
                      </span>
                    ) : null}
                    <span className="w-10 text-right font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                      {formatDuration(item.durationMs)}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
