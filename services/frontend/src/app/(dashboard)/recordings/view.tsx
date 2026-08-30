"use client";

import {
  Download,
  FileAudio,
  Files,
  Hash,
  Headphones,
  Loader2,
  Trash2,
  Users,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Badge,
  Button,
  GlassCard,
  GlassPanel,
  Select,
  type SelectOption,
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
import {
  audioBufferToWav,
  concatAudioBuffers,
  decodeAudio,
  downloadBlob,
} from "@/lib/audio/wav";
import { formatBytes, formatRelativeTime } from "@/lib/format";
import type { PaginatedRecordings, VoiceRecording } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

const ALL_USERS = "__all__";

export function RecordingsView({
  initialPage,
}: {
  initialPage?: PaginatedRecordings;
}) {
  const ws = useWebSocket();
  const [filterUserId, setFilterUserId] = useState<string | null>(null);
  const {
    data: items,
    isLoading,
    error,
    nextCursor,
    hasMore,
    mutate,
  } = useRecordings(initialPage, filterUserId ?? undefined);
  const loadMore = useLoadMoreRecordings(filterUserId ?? undefined);
  const del = useDeleteRecording();
  useRecordingsWsSync(ws);
  const ambient = useAmbient();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());
  const [exportingAll, setExportingAll] = useState(false);

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

  // Distinct speakers visible in the current (filtered) list, for the dropdown.
  const userOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, string>();
    for (const r of items ?? []) {
      if (r.user_id && !map.has(r.user_id)) map.set(r.user_id, r.username);
    }
    const opts: SelectOption[] = [
      { value: ALL_USERS, label: "All speakers" },
      ...[...map.entries()].map(([value, label]) => ({ value, label })),
    ];
    return opts;
  }, [items]);

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

  const onExportOne = async (r: VoiceRecording) => {
    if (!r.download_url) return;
    if (exportingIds.has(r.id)) return;
    setExportingIds((prev) => new Set(prev).add(r.id));
    try {
      const buf = await decodeAudio(r.download_url);
      const wav = audioBufferToWav(buf);
      const safeName = (r.username ?? "speaker").replace(/[^\w.-]+/g, "_");
      downloadBlob(wav, `gmw-rec-${safeName}-${r.id.slice(0, 8)}.wav`);
      toast({ title: "WAV exported (Audacity-ready)", tone: "signal" });
    } catch (e) {
      toast({
        title: "Export failed",
        description: String(e),
        tone: "vermilion",
      });
    } finally {
      setExportingIds((prev) => {
        const next = new Set(prev);
        next.delete(r.id);
        return next;
      });
    }
  };

  const onExportAll = async () => {
    if (exportingAll) return;
    const target = (items ?? []).filter(
      (r): r is VoiceRecording & { download_url: string } =>
        Boolean(r.download_url),
    );
    if (target.length === 0) return;
    setExportingAll(true);
    try {
      const buffers = [];
      for (const r of target) {
        buffers.push(await decodeAudio(r.download_url));
      }
      const merged = concatAudioBuffers(buffers);
      if (!merged) throw new Error("No audio decoded");
      const wav = audioBufferToWav(merged);
      const who = filterUserId
        ? (target[0]?.username ?? "speaker").replace(/[^\w.-]+/g, "_")
        : "all";
      downloadBlob(wav, `gmw-rec-${who}-${target.length}clips.wav`);
      toast({
        title: `Exported ${target.length} clips as one WAV`,
        tone: "signal",
      });
    } catch (e) {
      toast({
        title: "Export failed",
        description: String(e),
        tone: "vermilion",
      });
    } finally {
      setExportingAll(false);
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
  const exportableCount = (items ?? []).filter((r) => r.download_url).length;

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

      {/* Filter + Export toolbar */}
      <div className="flex flex-wrap items-center gap-2.5">
        <div className="flex items-center gap-2">
          <Users className="size-3.5 text-ink-faint" />
          <Select
            value={filterUserId ?? ALL_USERS}
            onChange={(v) => {
              setFilterUserId(v === ALL_USERS ? null : v);
              setLoadedPages(0);
            }}
            options={userOptions}
            placeholder="Filter by speaker"
            size="sm"
            className="w-48"
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={onExportAll}
          disabled={exportingAll || exportableCount === 0}
          title="Concatenate the visible (filtered) recordings into one WAV for Audacity"
        >
          {exportingAll ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Files className="size-3.5" />
          )}
          {exportingAll ? "RENDERING..." : `EXPORT WAV (${exportableCount})`}
        </Button>
        {filterUserId && (
          <Button
            variant="subtle"
            size="sm"
            onClick={() => setFilterUserId(null)}
          >
            CLEAR FILTER
          </Button>
        )}
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
            title={
              filterUserId
                ? "No recordings for this speaker"
                : "Tape deck is empty"
            }
            description={
              filterUserId
                ? "This speaker has no captured transmissions (or the filter is stale)."
                : "Voice transmissions captured in connected channels will be archived here."
            }
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
                const isExporting = exportingIds.has(r.id);
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
                            <span suppressHydrationWarning>
                              {formatRelativeTime(r.created_at)}
                            </span>
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
                          <>
                            <button
                              type="button"
                              onClick={() => onExportOne(r)}
                              disabled={isExporting}
                              className="inline-flex items-center gap-1 rounded-md border border-signal/40 bg-signal/10 px-2 py-1 font-mono text-[10px] text-signal transition-colors hover:bg-signal/20"
                            >
                              {isExporting ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <FileAudio className="size-3" />
                              )}
                              {isExporting ? "WAV..." : "WAV"}
                            </button>
                            <a
                              href={r.download_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink-soft transition-colors hover:bg-surface hover:text-ink"
                            >
                              <Download className="size-3 text-signal" /> RAW
                            </a>
                          </>
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
                  <span className="typing-dots">
                    <span />
                    <span />
                    <span />
                  </span>
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
