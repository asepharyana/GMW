"use client";

import { Download, Hash, Headphones, Loader2, Trash2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Badge,
  GlassCard,
  GlassPanel,
  Skeleton,
  toast,
} from "@/components/primitives";
import { EmptyState, ErrorState, SectionHeader } from "@/components/shared";
import {
  NowPlayingChip,
  RecordingAudioPlayer,
} from "@/components/voice/recording-audio-player";
import {
  useDeleteRecording,
  useLoadMoreRecordings,
  useRecordings,
  useRecordingsWsSync,
} from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import type { PaginatedRecordings, VoiceRecording } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function RecordingsView({
  initialPage,
}: {
  initialPage?: PaginatedRecordings;
}) {
  const ws = useWebSocket();
  const {
    data: items,
    isLoading,
    error,
    nextCursor,
    hasMore,
    mutate,
  } = useRecordings(initialPage);
  const loadMore = useLoadMoreRecordings();
  const del = useDeleteRecording();
  useRecordingsWsSync(ws);
  const ambient = useAmbient();
  const [playingId, setPlayingId] = useState<string | null>(null);

  // Maximum older pages to prevent infinite runaway memory usage
  const MAX_OLDER_PAGES = 10;
  const [loadedPages, setLoadedPages] = useState(0);

  const scrollRef = useRef<HTMLDivElement>(null);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const deckRef = useStaggerReveal<HTMLDivElement>(".recording-deck-card", {
    stagger: 0.04,
    y: 10,
    dependencies: [items?.length === 0],
  });

  useEffect(() => {
    ambient.set("signal", 0.3, "recordings");
  }, [ambient]);

  const loadOlder = useCallback(async () => {
    if (
      !hasMore ||
      !nextCursor ||
      loadMore.isPending ||
      loadedPages >= MAX_OLDER_PAGES
    )
      return;
    try {
      await loadMore.mutateAsync({ cursor: nextCursor });
      setLoadedPages((n) => n + 1);
    } catch {
      // client error handling in hook/action
    }
  }, [hasMore, nextCursor, loadMore, loadedPages]);

  // Infinite scroll trigger via IntersectionObserver on sentinel at the bottom of the list
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          void loadOlder();
        }
      },
      { root: scrollRef.current, rootMargin: "200px" },
    );

    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [loadOlder]);

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

  if (error && !items)
    return <ErrorState error={error} onRetry={() => void mutate()} />;
  if (!items && isLoading)
    return (
      <GlassPanel>
        <div className="mb-3 flex items-center justify-between">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-3 w-12" />
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <GlassCard key={i} className="flex flex-col gap-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 rounded-full" />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-2.5 w-32" />
                </div>
              </div>
              <Skeleton className="h-9 w-full" />
            </GlassCard>
          ))}
        </div>
      </GlassPanel>
    );

  const totalRecordings = (items ?? []).length;

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-signal glow-pulse" />
          <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
            Tape Deck · Captured Audio Archive
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
          <span>STATUS:</span>
          <span
            className="glitch-text rounded bg-signal/15 px-2 py-0.5 font-medium text-signal border border-signal/30"
            data-text={`${totalRecordings} CLIPS_LOADED`}
          >
            {totalRecordings} CLIPS_LOADED
          </span>
        </div>
      </div>

      <GlassPanel>
        <SectionHeader
          eyebrow="acoustic buffer"
          title="Voice Capture Tape Deck"
          action={
            <span className="mono text-xs text-[#8a8f98]">
              {totalRecordings} clips loaded {hasMore ? "· more available" : ""}
            </span>
          }
        />
        {totalRecordings === 0 ? (
          <EmptyState
            icon={<Headphones className="size-7" />}
            title="Tape deck is empty"
            description="Voice transmissions captured in connected channels will be archived here."
          />
        ) : (
          <div
            ref={scrollRef}
            className="mt-4 max-h-[calc(100vh-220px)] overflow-y-auto pr-1"
          >
            <div
              ref={deckRef}
              className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
            >
              {(items ?? []).map((r) => {
                const up = uploadStatus(r);
                const isPlaying = playingId === r.id;
                return (
                  <div
                    key={r.id}
                    className={`recording-deck-card hud-card flex flex-col justify-between p-4 transition-all duration-200 ${
                      isPlaying
                        ? "border-signal/50 bg-signal/10 shadow-[0_0_24px_-10px_var(--color-signal-glow)]"
                        : ""
                    }`}
                  >
                    <div>
                      {/* Header info */}
                      <div className="flex items-center gap-3 border-b border-hairline pb-3">
                        <Avatar
                          src={r.avatar_url}
                          name={r.username}
                          size={36}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-xs font-semibold text-ink">
                            {r.username}
                          </div>
                          <div className="flex items-center gap-1.5 font-mono text-[10px] text-ink-faint">
                            <Hash className="size-2.5 text-signal" />
                            <span className="truncate">
                              {r.channel_name ?? "voice"}
                            </span>
                            <span>·</span>
                            <span>{formatRelativeTime(r.created_at)}</span>
                          </div>
                        </div>
                        {isPlaying && <NowPlayingChip />}
                        {up && !isPlaying && (
                          <Badge
                            tone={up.tone}
                            className="font-mono text-[9px]"
                          >
                            {up.label}
                          </Badge>
                        )}
                      </div>

                      {/* Audio Player Scrub */}
                      <div className="my-3">
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
                          <div className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface-2 px-3 py-2 font-mono text-[11px] text-ink-muted">
                            <Loader2 className="size-3.5 animate-spin text-signal" />
                            {r.upload_status === "pending"
                              ? "UPLOAD_PENDING..."
                              : r.upload_error
                                ? r.upload_error
                                : "SYNTHESIZING_PCM..."}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Actions & File Stats */}
                    <div className="flex items-center justify-between border-t border-hairline pt-2.5">
                      <span className="font-mono text-[10px] text-ink-faint">
                        SIZE: {formatBytes(r.size_bytes)}
                      </span>
                      <div className="flex items-center gap-2">
                        {r.download_url && (
                          <a
                            href={r.download_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                          >
                            <Download className="size-3 text-signal" /> RAW
                          </a>
                        )}
                        <button
                          type="button"
                          onClick={() => onDelete(r.id)}
                          disabled={del.isPending}
                          className="inline-flex items-center gap-1 rounded-md border border-vermilion/30 bg-vermilion/10 px-2 py-1 font-mono text-[10px] text-vermilion transition-colors hover:bg-vermilion/20"
                        >
                          <Trash2 className="size-3" /> PURGE
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Infinite scroll sentinel & status footer */}
            <div ref={sentinelRef} className="py-4 text-center">
              {loadMore.isPending ? (
                <span className="flex items-center justify-center gap-2 font-mono text-xs text-ink-muted">
                  <Loader2 className="size-4 animate-spin text-signal" />
                  LOADING EARLIER RECORDINGS...
                  <span className="typing-dots"><span /><span /><span /></span>
                </span>
              ) : hasMore && loadedPages < MAX_OLDER_PAGES ? (
                <button
                  type="button"
                  onClick={loadOlder}
                  className="rounded-md border border-hairline bg-surface-2 px-3 py-1.5 font-mono text-xs text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                >
                  ↓ LOAD MORE RECORDINGS
                </button>
              ) : (
                <span className="font-mono text-[10px] text-ink-faint">
                  {loadedPages >= MAX_OLDER_PAGES
                    ? `CAPPED AT ${MAX_OLDER_PAGES} PAGES`
                    : "ARCHIVE END REACHED"}
                </span>
              )}
            </div>
          </div>
        )}
      </GlassPanel>
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
