"use client";

/**
 * Recordings scene — voice clips orbit as a timeline ring on the stage;
 * the clip archive docks right with inline audio players, playing clip
 * highlighted both in the dock and on the sky.
 */
import { Download, Hash, Headphones, Loader2, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Badge,
  Button,
  Skeleton,
  toast,
} from "@/components/primitives";
import { EmptyState, ErrorState } from "@/components/shared";
import {
  useSceneFocusSetter,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
import {
  NowPlayingChip,
  RecordingAudioPlayer,
} from "@/components/voice/recording-audio-player";
import {
  useDeleteRecording,
  useRecordings,
  useRecordingsWsSync,
} from "@/hooks";
import type { ConstellationGraph } from "@/lib/constellation/graph";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import type { VoiceRecording } from "@/lib/types";
import { staggerDelay } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

function recordingsGraph(items: VoiceRecording[]): ConstellationGraph {
  const recent = items.slice(0, 28);
  return {
    nodes: [
      { id: "archive", label: "archive", kind: "guild", value: 1 },
      ...recent.map((r) => ({
        id: `rec:${r.id}`,
        label: r.username,
        kind: "media" as const,
        value: 0.5,
        href: undefined,
      })),
    ],
    edges: recent.map((r) => ({ source: "archive", target: `rec:${r.id}` })),
  };
}

export function RecordingsView({
  initialItems,
}: {
  initialItems?: VoiceRecording[];
}) {
  const ws = useWebSocket();
  const { data: items, isLoading, error } = useRecordings(initialItems);
  const del = useDeleteRecording();
  useRecordingsWsSync(ws);
  const ambient = useAmbient();
  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();
  const [playingId, setPlayingId] = useState<string | null>(null);

  const list = items ?? [];

  const graph = useMemo(() => recordingsGraph(list), [list]);
  useEffect(() => {
    publish({ graph, focus: playingId ? `rec:${playingId}` : null });
  }, [graph, playingId, publish]);

  useEffect(
    () => () => {
      publish({ graph: { nodes: [], edges: [] }, focus: null });
      setFocus(null);
    },
    [publish, setFocus],
  );

  useEffect(() => {
    ambient.set("signal", 0.3, "recordings");
  }, [ambient]);

  const onDelete = async (id: string) => {
    try {
      await del.mutateAsync(id);
      toast({ title: "Recording deleted", tone: "signal" });
    } catch (e) {
      toast({
        title: "Delete failed",
        description: String(e),
        tone: "vermilion",
      });
    }
  };

  if (error && !items) return <ErrorState error={error} />;
  if (!items && isLoading)
    return (
      <div className="pointer-events-auto absolute inset-x-4 bottom-24 top-44 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/70 p-4 backdrop-blur-xl md:inset-x-auto md:right-5 md:top-28 md:w-[min(30rem,92vw)]">
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="flex flex-col gap-3 rounded-xl border border-[var(--color-hairline)] p-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-32" />
                </div>
              </div>
              <Skeleton className="h-9 w-full" />
            </div>
          ))}
        </div>
      </div>
    );

  return (
    <div className="min-h-full">
      {/* Archive dock — right */}
      <section
        className="pointer-events-auto absolute bottom-20 right-5 top-16 hidden w-[min(30rem,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/70 backdrop-blur-xl md:flex"
        aria-label="Voice captures"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2.5">
          <span className="eyebrow">voice captures</span>
          <span className="font-mono text-xs text-[var(--color-ink-faint)]">
            {list.length} clips
          </span>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {list.length === 0 ? (
            <EmptyState
              icon={<Headphones className="size-6" />}
              title="No recordings"
              description="Voice clips captured by the bot appear here."
            />
          ) : (
            <div className="space-y-2">
              {list.map((r, i) => {
                const up = uploadStatus(r);
                const isPlaying = playingId === r.id;
                return (
                  <article
                    key={r.id}
                    className={`animate-stagger flex flex-col gap-2.5 rounded-xl border p-3 transition-colors ${
                      isPlaying
                        ? "border-signal/40 shadow-[0_0_36px_-16px_var(--color-signal-glow)]"
                        : "border-[var(--color-hairline)] hover:bg-white/[0.04]"
                    }`}
                    style={staggerDelay(i)}
                  >
                    <div className="flex items-center gap-3">
                      <Avatar src={r.avatar_url} name={r.username} size={34} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                          {r.username}
                        </p>
                        <p className="flex items-center gap-1.5 font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                          <Hash className="size-3" />
                          <span className="truncate">
                            {r.channel_name ?? "voice"}
                          </span>
                          <span>·</span>
                          <span>{formatRelativeTime(r.created_at)}</span>
                        </p>
                      </div>
                      {isPlaying ? <NowPlayingChip /> : null}
                      {up && !isPlaying ? (
                        <Badge tone={up.tone}>{up.label}</Badge>
                      ) : null}
                      <span className="font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                        {formatBytes(r.size_bytes)}
                      </span>
                    </div>

                    {r.download_url ? (
                      <RecordingAudioPlayer
                        src={r.download_url}
                        label={`Voice recording by ${r.username}`}
                        onPlayStateChange={(active) =>
                          setPlayingId((prev) => {
                            if (active) return r.id;
                            return prev === r.id ? null : prev;
                          })
                        }
                      />
                    ) : (
                      <p className="flex items-center gap-1.5 rounded-lg px-1 py-1 font-mono text-xs text-[var(--color-ink-faint)]">
                        <Loader2 className="size-3.5 animate-spin" />
                        {r.upload_status === "pending"
                          ? "Upload pending…"
                          : r.upload_error
                            ? r.upload_error
                            : "Processing…"}
                      </p>
                    )}

                    <div className="flex items-center gap-2">
                      {r.download_url ? (
                        <a
                          href={r.download_url}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-full border border-[var(--color-hairline)] px-2.5 py-1 font-mono text-xs text-[var(--color-ink-soft)] hover:border-signal/40 hover:text-[var(--color-ink)]"
                        >
                          <Download className="size-3.5" /> Download
                        </a>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="ml-auto"
                        onClick={() => onDelete(r.id)}
                        disabled={del.isPending}
                      >
                        <Trash2 className="size-3.5" /> Delete
                      </Button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>

      {/* Mobile dock */}
      <section
        className="pointer-events-auto absolute inset-x-4 bottom-24 top-44 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/80 p-2.5 backdrop-blur-xl md:hidden"
        aria-label="Voice captures mobile"
      >
        {list.length === 0 ? (
          <EmptyState title="No recordings" />
        ) : (
          list.map((r) => (
            <article
              key={r.id}
              className={`mb-2 flex flex-col gap-2 rounded-xl border p-3 ${
                playingId === r.id
                  ? "border-signal/40"
                  : "border-[var(--color-hairline)]"
              }`}
            >
              <p className="truncate text-sm font-semibold text-[var(--color-ink)]">
                {r.username} · {formatRelativeTime(r.created_at)}
              </p>
              {r.download_url ? (
                <RecordingAudioPlayer
                  src={r.download_url}
                  label={`Voice recording by ${r.username}`}
                  onPlayStateChange={(active) =>
                    setPlayingId((prev) =>
                      active ? r.id : prev === r.id ? null : prev,
                    )
                  }
                />
              ) : (
                <p className="font-mono text-xs text-[var(--color-ink-faint)]">
                  processing…
                </p>
              )}
            </article>
          ))
        )}
      </section>

      {/* Hint */}
      <p className="pointer-events-none absolute bottom-24 left-5 hidden max-w-xs font-mono text-xs text-[var(--color-ink-faint)] lg:block">
        setiap klip adalah simpel di cincin timeline — yang sedang play menyala
        di langit
      </p>
    </div>
  );
}

function uploadStatus(
  r: VoiceRecording,
): { tone: "neutral" | "amber" | "vermilion"; label: string } | null {
  if (r.download_url) return null;
  if (r.upload_status === "error" || r.upload_error)
    return { tone: "vermilion", label: "failed" };
  if (r.upload_status === "pending") return { tone: "amber", label: "pending" };
  return { tone: "amber", label: "processing" };
}
