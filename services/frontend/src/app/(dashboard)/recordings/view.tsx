"use client";

import {
  Download,
  FileAudio,
  Files,
  Hash,
  Headphones,
  Loader2,
  MessagesSquare,
  Mic,
  Pause,
  Play,
  Search,
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
  Input,
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
  type RecordingsFilter,
  useDeleteRecording,
  useLoadMoreRecordings,
  useRecordings,
  useRecordingsSummary,
  useRecordingsWsSync,
} from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import {
  audioBufferToWav,
  concatAudioBuffers,
  decodeAudio,
  downloadBlob,
} from "@/lib/audio/wav";
import { formatBytes, formatDuration, formatRelativeTime } from "@/lib/format";
import type {
  PaginatedRecordings,
  SpeakerSummary,
  VoiceRecording,
} from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

const ALL = "__all__";

type Tab = "deck" | "leaderboard";

export function RecordingsView({
  initialPage,
}: {
  initialPage?: PaginatedRecordings;
}) {
  const ws = useWebSocket();
  const [tab, setTab] = useState<Tab>("deck");
  const [q, setQ] = useState("");
  const [channelId, setChannelId] = useState(ALL);
  const [userId, setUserId] = useState(ALL);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const activeFilter: RecordingsFilter = useMemo(() => {
    const f: RecordingsFilter = {};
    if (channelId !== ALL) f.channelId = channelId;
    if (userId !== ALL) f.userId = userId;
    const sq = q.trim();
    if (sq) f.q = sq;
    if (startDate) f.startDate = new Date(`${startDate}T00:00:00`).getTime();
    if (endDate) f.endDate = new Date(`${endDate}T23:59:59`).getTime();
    return f;
  }, [channelId, userId, q, startDate, endDate]);

  const {
    data: items,
    isLoading,
    error,
    nextCursor,
    hasMore,
    mutate,
  } = useRecordings(initialPage, activeFilter);
  const loadMore = useLoadMoreRecordings(activeFilter);
  const del = useDeleteRecording();
  const summary = useRecordingsSummary();
  useRecordingsWsSync(ws);
  const ambient = useAmbient();
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [exportingIds, setExportingIds] = useState<Set<string>>(new Set());
  const [exportingAll, setExportingAll] = useState(false);
  const [exportingSessions, setExportingSessions] = useState<Set<string>>(
    new Set(),
  );

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

  // Distinct speakers/channels across the current (filtered) list.
  const userOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, string>();
    for (const r of items ?? []) {
      if (r.user_id && !map.has(r.user_id)) map.set(r.user_id, r.username);
    }
    return [
      { value: ALL, label: "All speakers" },
      ...[...map.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [items]);

  const channelOptions = useMemo<SelectOption[]>(() => {
    const map = new Map<string, string>();
    for (const r of items ?? []) {
      if (r.channel_id && !map.has(r.channel_id))
        map.set(r.channel_id, r.channel_name ?? r.channel_id);
    }
    return [
      { value: ALL, label: "All channels" },
      ...[...map.entries()].map(([value, label]) => ({ value, label })),
    ];
  }, [items]);

  const sessions = useMemo(() => groupSessions(items ?? []), [items]);

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
      const who =
        userId !== ALL
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

  const onExportSession = async (session: Session) => {
    if (exportingSessions.has(session.key)) return;
    const target = session.clips.filter(
      (r): r is VoiceRecording & { download_url: string } =>
        Boolean(r.download_url),
    );
    if (target.length === 0) return;
    setExportingSessions((prev) => new Set(prev).add(session.key));
    try {
      const buffers = [];
      for (const r of target) {
        buffers.push(await decodeAudio(r.download_url));
      }
      const merged = concatAudioBuffers(buffers);
      if (!merged) throw new Error("No audio decoded");
      const wav = audioBufferToWav(merged);
      const safeChannel = (session.channelName ?? "session").replace(
        /[^\w.-]+/g,
        "_",
      );
      downloadBlob(wav, `gmw-session-${safeChannel}-${target.length}clips.wav`);
      toast({
        title: `Session exported: ${target.length} clips as one WAV`,
        tone: "signal",
      });
    } catch (e) {
      toast({
        title: "Session export failed",
        description: String(e),
        tone: "vermilion",
      });
    } finally {
      setExportingSessions((prev) => {
        const next = new Set(prev);
        next.delete(session.key);
        return next;
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
        <div className="flex items-center gap-1.5">
          <TabButton active={tab === "deck"} onClick={() => setTab("deck")}>
            <MessagesSquare className="size-3.5" /> DECK
          </TabButton>
          <TabButton
            active={tab === "leaderboard"}
            onClick={() => setTab("leaderboard")}
          >
            <Users className="size-3.5" /> LEADERBOARD
          </TabButton>
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

      {tab === "leaderboard" ? (
        <Leaderboard
          summary={summary.data}
          isLoading={summary.isLoading}
          onShowSpeaker={(uid) => {
            setUserId(uid);
            setTab("deck");
            setLoadedPages(0);
          }}
        />
      ) : (
        <>
          {/* Filter + Search + Export toolbar */}
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="relative min-w-0 flex-1 basis-56">
              <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-faint" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Search transcriptions / speakers…"
                className="pl-8"
              />
            </div>
            <Select
              value={userId}
              onChange={(v) => {
                setUserId(v);
                setLoadedPages(0);
              }}
              options={userOptions}
              placeholder="Speaker"
              size="sm"
              className="w-40"
            />
            <Select
              value={channelId}
              onChange={(v) => {
                setChannelId(v);
                setLoadedPages(0);
              }}
              options={channelOptions}
              placeholder="Channel"
              size="sm"
              className="w-40"
            />
            <Input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              aria-label="From date"
              className="w-36"
            />
            <Input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              aria-label="To date"
              className="w-36"
            />
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
              {exportingAll
                ? "RENDERING..."
                : `EXPORT WAV (${exportableCount})`}
            </Button>
            {(Object.keys(activeFilter).length > 0 ||
              channelId !== ALL ||
              userId !== ALL) && (
              <Button
                variant="subtle"
                size="sm"
                onClick={() => {
                  setQ("");
                  setChannelId(ALL);
                  setUserId(ALL);
                  setStartDate("");
                  setEndDate("");
                  setLoadedPages(0);
                }}
              >
                RESET
              </Button>
            )}
          </div>

          <GlassPanel>
            <SectionHeader
              eyebrow="acoustic buffer"
              title="Voice Capture Tape Deck"
              action={
                <span className="mono text-xs text-[#8a8f98]">
                  {totalRecordings} clips loaded{" "}
                  {hasMore ? "· more available" : ""}
                </span>
              }
            />
            {totalRecordings === 0 ? (
              <EmptyState
                icon={<Headphones className="size-7" />}
                title={
                  Object.keys(activeFilter).length > 0
                    ? "No recordings match these filters"
                    : "Tape deck is empty"
                }
                description={
                  Object.keys(activeFilter).length > 0
                    ? "Try clearing the search or filters, or pick a different speaker/channel."
                    : "Voice transmissions captured in connected channels will be archived here."
                }
              />
            ) : (
              <div
                ref={scrollRef}
                className="mt-4 max-h-[calc(100vh-260px)] overflow-y-auto pr-1"
              >
                <div
                  ref={deckRef}
                  className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3"
                >
                  {sessions.flatMap((session) => {
                    const sessionPlayable = session.clips.some((c) =>
                      Boolean(c.download_url),
                    );
                    const sessionExporting = exportingSessions.has(session.key);
                    const header = (
                      <SessionHeader
                        key={`session-${session.key}`}
                        session={session}
                        playable={sessionPlayable}
                        exporting={sessionExporting}
                        onExport={() => void onExportSession(session)}
                      />
                    );
                    const cards = session.clips.map((r) => {
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

                            {/* Transcription snippet */}
                            <div className="py-2">
                              <TranscriptionSnippet text={r.transcription} />
                            </div>

                            {/* Audio Player Scrub */}
                            <div className="my-1">
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
                                    <Download className="size-3 text-signal" />{" "}
                                    RAW
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
                    });
                    return [header, ...cards];
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
        </>
      )}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-mono text-[10px] transition-colors ${
        active
          ? "border-signal/40 bg-signal/15 text-signal"
          : "border-hairline bg-surface-2 text-ink-soft hover:bg-surface hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function TranscriptionSnippet({ text }: { text?: string | null }) {
  const [open, setOpen] = useState(false);
  if (!text) {
    return (
      <div className="h-10 rounded-[6px] border border-dashed border-hairline bg-surface-2/40 px-3 py-2 font-mono text-[10px] text-ink-faint">
        no transcription
      </div>
    );
  }
  const collapsed = !open && text.length > 160;
  return (
    <div className="rounded-[6px] border border-hairline bg-surface-2 px-3 py-2">
      <p
        className={`font-mono text-[11px] leading-relaxed text-ink-soft ${
          collapsed ? "line-clamp-3" : ""
        }`}
      >
        {text}
      </p>
      {collapsed && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="mt-1 font-mono text-[10px] text-signal hover:underline"
        >
          READ FULL TRANSCRIPT
        </button>
      )}
    </div>
  );
}

function Leaderboard({
  summary,
  isLoading,
  onShowSpeaker,
}: {
  summary: SpeakerSummary[] | undefined;
  isLoading: boolean;
  onShowSpeaker: (userId: string, username: string) => void;
}) {
  if (isLoading && !summary)
    return (
      <GlassPanel>
        <Skeleton className="h-4 w-40" />
        <div className="mt-3 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      </GlassPanel>
    );
  if (!summary || summary.length === 0)
    return (
      <GlassPanel>
        <EmptyState
          icon={<Mic className="size-7" />}
          title="No speakers yet"
          description="Leaderboard populates as voice is captured and transcribed."
        />
      </GlassPanel>
    );

  const maxClips = Math.max(...summary.map((s) => s.clips), 1);

  return (
    <GlassPanel>
      <SectionHeader
        eyebrow="speech analytics"
        title="Speaker Leaderboard"
        action={
          <span className="mono text-xs text-[#8a8f98]">
            {summary.length} speakers
          </span>
        }
      />
      <div className="mt-4 space-y-1.5">
        {summary.map((s, idx) => (
          <button
            key={s.user_id}
            type="button"
            onClick={() => onShowSpeaker(s.user_id, s.username)}
            className="group flex w-full items-center gap-3 rounded-lg border border-hairline bg-surface-2/50 px-3 py-2.5 text-left transition-colors hover:border-signal/40 hover:bg-surface"
          >
            <span className="w-6 shrink-0 text-center font-mono text-xs text-ink-faint">
              {idx + 1}
            </span>
            <Avatar src={s.avatar_url} name={s.username} size={32} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs font-semibold text-ink">
                {s.username}
              </div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-surface">
                <div
                  className="h-full rounded-full bg-signal"
                  style={{ width: `${(s.clips / maxClips) * 100}%` }}
                />
              </div>
            </div>
            <div className="shrink-0 text-right font-mono text-[10px] text-ink-soft">
              <div className="flex items-center justify-end gap-1">
                <Mic className="size-3 text-signal" /> {s.clips}
              </div>
              <div>{formatDuration(s.est_duration_s * 1000)}</div>
              <div className="text-ink-faint">
                {s.transcribed > 0 ? `${s.words} words` : "no transcript"}
              </div>
            </div>
          </button>
        ))}
      </div>
    </GlassPanel>
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

// ── Session grouping ──────────────────────────────────────────────────────
// Clips become one "meeting session" when they share a channel and the gap
// between consecutive clips is within SESSION_GAP_MS. items arrive newest-first,
// so sessions are produced most-recent-first and each keeps its clips in that
// order (newest → oldest).
const SESSION_GAP_MS = 120_000;

interface Session {
  key: string;
  channelId: string;
  channelName: string;
  startTs: number;
  endTs: number;
  clips: VoiceRecording[];
}

function groupSessions(items: VoiceRecording[]): Session[] {
  const sessions: Session[] = [];
  for (const r of items) {
    const last = sessions[sessions.length - 1];
    if (
      last &&
      last.channelId === (r.channel_id ?? "") &&
      last.startTs - r.created_at <= SESSION_GAP_MS
    ) {
      last.clips.push(r);
      last.startTs = r.created_at;
    } else {
      sessions.push({
        key: r.id,
        channelId: r.channel_id ?? "",
        channelName: r.channel_name ?? "voice",
        startTs: r.created_at,
        endTs: r.created_at,
        clips: [r],
      });
    }
  }
  return sessions;
}

function sessionEstDurationSec(session: Session): number {
  const bytes = session.clips.reduce((acc, c) => acc + c.size_bytes, 0);
  return Math.round((bytes * 8) / 128000);
}

function sessionTimestamp(session: Session): string {
  const d = new Date(session.endTs);
  const s = new Date(session.startTs);
  const sameDay = d.toDateString() === s.toDateString();
  const fmt = (x: Date) =>
    `${x.getMonth() + 1}/${x.getDate()} ${String(x.getHours()).padStart(2, "0")}:${String(
      x.getMinutes(),
    ).padStart(2, "0")}`;
  return sameDay ? fmt(d) : `${fmt(d)} – ${fmt(s)}`;
}

/** Sequential playback of a session's clips via one <audio> element. */
function SessionPlayer({
  clips,
}: {
  clips: Array<VoiceRecording & { download_url: string }>;
}) {
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    const audio = new Audio();
    audio.preload = "metadata";
    audioRef.current = audio;
    const onEnded = () => {
      setIdx((i) => {
        const next = i + 1;
        if (next < clips.length) {
          audio.src = clips[next].download_url;
          void audio.play().catch(() => setPlaying(false));
          return next;
        }
        setPlaying(false);
        return 0;
      });
    };
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("ended", onEnded);
      audio.pause();
      audio.src = "";
    };
  }, [clips]);

  const toggle = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (playing) {
      audio.pause();
      setPlaying(false);
    } else {
      if (idx >= clips.length || audio.src === "")
        audio.src = clips[0].download_url;
      void audio.play().catch(() => setPlaying(false));
      setPlaying(true);
    }
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={
        playing ? "Pause session playback" : "Play all clips in this session"
      }
      className="inline-flex items-center gap-1 rounded-md border border-signal/40 bg-signal/10 px-2 py-1 font-mono text-[10px] text-signal transition-colors hover:bg-signal/20"
    >
      {playing ? <Pause className="size-3" /> : <Play className="size-3" />}
      {playing ? `PAUSE ${idx + 1}/${clips.length}` : "PLAY SESSION"}
    </button>
  );
}

function SessionHeader({
  session,
  playable,
  exporting,
  onExport,
}: {
  session: Session;
  playable: boolean;
  exporting: boolean;
  onExport: () => void;
}) {
  return (
    <div className="col-span-full -mx-1 mb-1 mt-2 flex items-center gap-3 rounded-lg border border-hairline bg-surface px-3 py-2 first:mt-0">
      <Hash className="size-3.5 shrink-0 text-signal" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-[11px] font-semibold uppercase tracking-wide text-ink">
          {session.channelName}
        </div>
        <div className="font-mono text-[10px] text-ink-faint">
          {sessionTimestamp(session)} · {session.clips.length} clips ·{" "}
          {formatDuration(sessionEstDurationSec(session) * 1000)}
        </div>
      </div>
      {playable && (
        <SessionPlayer
          clips={session.clips.filter(
            (c): c is VoiceRecording & { download_url: string } =>
              Boolean(c.download_url),
          )}
        />
      )}
      <button
        type="button"
        onClick={onExport}
        disabled={exporting || !playable}
        className="inline-flex items-center gap-1 rounded-md border border-hairline bg-surface-2 px-2 py-1 font-mono text-[10px] text-ink-soft transition-colors hover:bg-surface hover:text-ink"
      >
        {exporting ? (
          <Loader2 className="size-3 animate-spin" />
        ) : (
          <Files className="size-3" />
        )}
        {exporting ? "WAV..." : "EXPORT SESSION"}
      </button>
    </div>
  );
}
