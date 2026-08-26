"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Search,
  ShieldAlert,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { useAmbient } from "@/components/ambient/ambient-context";
import { EditHistory } from "@/components/EditHistory";
import {
  Avatar,
  Badge,
  GlassPanel,
  Input,
  Skeleton,
} from "@/components/primitives";
import {
  EmptyState,
  ErrorState,
  SectionHeader,
  SkeletonRows,
} from "@/components/shared";
import { GuildChannelPicker } from "@/components/shared/guild-picker";
import {
  useLoadMore,
  useMessageActivity,
  useMessageDetail,
  useMessageSearch,
  useMessages,
  useMessagesHasMore,
  useMessagesStream,
  useMessagesWsSync,
  useRecentEdits,
  useReviewWsSync,
  useSemanticSearch,
} from "@/hooks";
import { useStaggerReveal } from "@/hooks/use-gsap-animation";
import { aiTone } from "@/lib/ai-status";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  getMessageChannelLabel,
  renderMessageContent,
  safeParseJsonArray,
} from "@/lib/format";
import type {
  AiStatus,
  EditHistoryRow,
  Guild,
  MessageRecord,
} from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function MessagesView({
  initialGuilds,
  initialGuildId,
  initialMessages,
  initialEdits,
}: {
  initialGuilds?: Guild[];
  initialGuildId?: string | null;
  initialMessages?: {
    data: MessageRecord[];
    nextCursor: string | null;
  } | null;
  initialEdits?: EditHistoryRow[];
}) {
  const ws = useWebSocket();
  const [guildId, setGuildId] = useState<string | null>(
    initialGuildId ?? initialGuilds?.[0]?.id ?? null,
  );
  const [channelId, setChannelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Search mode: "exact" (substring match over captured messages) or
  // "semantic" (vector similarity over the persistent Qdrant archive).
  const [semanticMode, setSemanticMode] = useState(false);
  // feed | timeline: "timeline" groups messages into date-grouped cards.
  const [viewMode, setViewMode] = useState<"feed" | "timeline">("feed");
  // Guard against loading the entire history on a long scroll: cap how many
  // older pages we append. Each page is 50 messages (backend limit default).
  const MAX_OLDER_PAGES = 10;
  const [loadedPages, setLoadedPages] = useState(0);

  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useMessages(
    guildId ?? "",
    channelId ?? undefined,
    initialMessages ?? undefined,
  );
  // Stream history one message per WS frame (replaces the 50-row batched fetch).
  // Drives snapshots into the SWR list above as they arrive; falls back to the
  // SSR `initialMessages` seed if WS is unavailable.
  useMessagesStream(ws, guildId ?? "", channelId ?? undefined);
  // Cursor to the next (older) page + whether more history exists.
  const { data: pageInfo } = useMessagesHasMore(
    guildId ?? "",
    channelId ?? undefined,
  );
  const nextCursor = pageInfo?.cursor ?? null;
  const hasMore = pageInfo?.hasMore ?? false;
  const loadMore = useLoadMore();
  useMessagesWsSync(ws, guildId ?? "");
  useReviewWsSync(ws);
  const search = useMessageSearch(
    query,
    query.trim().length >= 2 && !semanticMode,
  );
  const semantic = useSemanticSearch(
    query,
    query.trim().length >= 2 && semanticMode,
  );
  const activity = useMessageActivity(30);
  const edits = useRecentEdits(50, undefined, initialEdits);
  const detail = useMessageDetail(selected);
  const ambient = useAmbient();

  // Fetch the next (older) page via cursor and bump the loaded-page counter.
  // Older messages prepend at the top, so preserve the viewport by offsetting
  // scrollTop by the height added above (Discord keeps your place while loading).
  const loadOlder = useCallback(async () => {
    if (!guildId || !hasMore || loadedPages >= MAX_OLDER_PAGES) return;
    const el = scrollRef.current;
    const prevHeight = el ? el.scrollHeight : 0;
    await loadMore.mutateAsync({
      guildId,
      channelId: channelId ?? undefined,
      cursor: nextCursor ?? "",
    });
    setLoadedPages((n) => n + 1);
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollTop + (el.scrollHeight - prevHeight);
      });
    }
  }, [guildId, channelId, hasMore, loadedPages, nextCursor, loadMore]);

  useEffect(() => {
    ambient.set(query ? "amber" : "signal", 0.3, query ? "search" : "messages");
  }, [query, ambient]);

  const searching = query.trim().length >= 2 && !semanticMode;
  const semanticSearching = query.trim().length >= 2 && semanticMode;
  const list = searching ? (search.data ?? []) : (messages ?? []);
  // Discord-style order: oldest at the top, newest at the bottom. The backend
  // returns DESC (newest first); reverse so the feed reads top→bottom like DC.
  const display = useMemo(() => [...list].reverse(), [list]);

  // Timeline mode: inject date-separator headers above the first message of
  // each day. Messages are sorted oldest→newest (display is reversed), so a
  // date change means a new group. Produces an array of either "date" or "msg"
  // nodes so the render loop can switch easily.
  const timelineNodes = useMemo(() => {
    if (viewMode !== "timeline") return null;
    const out: Array<
      | { type: "date"; label: string; iso: string }
      | { type: "msg"; m: (typeof display)[number] }
    > = [];
    let prev = "";
    for (const m of display) {
      const d = new Date(m.created_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const iso = new Date(m.created_at).toISOString().slice(0, 10);
      if (d !== prev) {
        out.push({ type: "date", label: d, iso });
        prev = d;
      }
      out.push({ type: "msg", m });
    }
    return out;
  }, [display, viewMode]);

  // Ref to the scroll container so we can manage scroll position like Discord:
  // open at the bottom (newest), keep the viewport stable when prepending older
  // messages at the top, and follow new live messages only when already near
  // the bottom.
  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

  // Scroll to the bottom on the first load / when switching guild-channel, so
  // the newest messages are visible (Discord behaviour).
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current && display.length > 0) {
      firstLoadRef.current = false;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [display.length]);

  // When a new live message lands (list grows, still searching off), follow it
  // to the bottom only if the user was already near the bottom.
  const prevLen = useRef(list.length);
  useEffect(() => {
    if (searching) return;
    const el = scrollRef.current;
    if (!el) return;
    if (list.length > prevLen.current && nearBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
    prevLen.current = list.length;
  }, [list.length, searching]);

  const streamRef = useStaggerReveal<HTMLDivElement>(".msg-feed-card", {
    stagger: 0.02,
    y: 6,
    dependencies: [display.length, viewMode],
  });

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-[#7170ff] shadow-[0_0_8px_#7170ff]" />
          <h1 className="font-mono text-xs font-semibold tracking-wide text-[#f7f8f8] uppercase">
            Chat Log Stream · Ingestion Stream
          </h1>
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-[#8a8f98]">
          <span>MODE:</span>
          <span className="rounded bg-white/[0.04] px-1.5 py-0.5 font-medium text-[#7170ff] border border-white/[0.06]">
            {searching ? "SEARCH_ACTIVE" : viewMode.toUpperCase()}
          </span>
        </div>
      </div>

      {/* Filter and Mode Bar */}
      <GlassPanel className="flex flex-wrap items-center gap-3 p-3">
        <GuildChannelPicker
          mode="text"
          guildsInitial={initialGuilds}
          guildId={guildId}
          channelId={channelId}
          onChange={(g, c) => {
            setGuildId(g);
            setChannelId(c);
            setSelected(null);
            setLoadedPages(0);
            firstLoadRef.current = true;
          }}
        />
        <div className="relative ml-auto w-full sm:w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9 text-xs"
            placeholder="Search captured logs..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-white/[0.02] p-0.5">
          <button
            type="button"
            onClick={() => setSemanticMode(false)}
            className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              !semanticMode
                ? "bg-white/[0.08] text-white border border-white/[0.12]"
                : "text-[#8a8f98] hover:text-[#d0d6e0]"
            }`}
          >
            EXACT
          </button>
          <button
            type="button"
            onClick={() => setSemanticMode(true)}
            className={`flex items-center gap-1 rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              semanticMode
                ? "bg-[#7170ff]/20 text-[#7170ff] border border-[#7170ff]/30"
                : "text-[#8a8f98] hover:text-[#d0d6e0]"
            }`}
          >
            <Sparkles className="size-3" />
            SEMANTIC
          </button>
        </div>

        <div className="flex items-center gap-1.5 rounded-[6px] border border-white/[0.08] bg-white/[0.02] p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("feed")}
            className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              viewMode === "feed"
                ? "bg-white/[0.08] text-white border border-white/[0.12]"
                : "text-[#8a8f98] hover:text-[#d0d6e0]"
            }`}
          >
            FEED
          </button>
          <button
            type="button"
            onClick={() => setViewMode("timeline")}
            className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              viewMode === "timeline"
                ? "bg-white/[0.08] text-white border border-white/[0.12]"
                : "text-[#8a8f98] hover:text-[#d0d6e0]"
            }`}
          >
            TIMELINE
          </button>
        </div>
      </GlassPanel>

      <div className="grid gap-3 lg:grid-cols-5">
        {semanticSearching && (
          <GlassPanel className="lg:col-span-5">
            <SectionHeader
              eyebrow="semantic archive"
              title={`Vector Matches for “${query}”`}
              action={
                <span className="mono text-xs text-[#8a8f98]">
                  {semantic.data?.length ?? 0} matches
                </span>
              }
            />
            {semantic.isLoading ? (
              <SkeletonRows rows={4} />
            ) : semantic.data && semantic.data.length > 0 ? (
              <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
                {semantic.data.map((r, i) => (
                  <div
                    key={r.message_id ?? i}
                    className="flex items-start gap-3 rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-3 hover:border-white/[0.12] hover:bg-white/[0.04]"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-[#7170ff]">
                          {(r.score * 100).toFixed(0)}% RELEVANCE
                        </span>
                        <span className="ml-auto font-mono text-[10px] text-[#8a8f98]">
                          {formatRelativeTime(r.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-[#d0d6e0] leading-relaxed">
                        {r.content}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <EmptyState
                icon={<Search className="size-7" />}
                title="No semantic matches"
                description="Try different phrasing — vector search inspects contextual semantics."
              />
            )}
          </GlassPanel>
        )}

        {/* Message Stream Deck */}
        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow={searching ? "query results" : "realtime log"}
            title={searching ? `Matches for “${query}”` : "Message Stream"}
            action={
              <span className="mono text-xs text-[#8a8f98]">
                {list.length} messages
              </span>
            }
          />
          {error && !messages ? (
            <ErrorState error={error} onRetry={() => refetch()} />
          ) : isLoading && !messages ? (
            <SkeletonRows rows={8} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-7" />}
              title="No messages captured"
              description="Select a channel or verify discord bridge is active."
            />
          ) : (
            <div>
              {!searching && (
                <div className="mb-2 flex items-center justify-center gap-2">
                  {loadMore.isPending ? (
                    <span className="flex items-center gap-1.5 font-mono text-xs text-[#8a8f98]">
                      <Loader2 className="size-3.5 animate-spin" />
                      FETCHING EARLIER PACKETS...
                    </span>
                  ) : hasMore && loadedPages < MAX_OLDER_PAGES ? (
                    <button
                      type="button"
                      onClick={loadOlder}
                      className="rounded-[5px] border border-white/[0.08] bg-white/[0.02] px-3 py-1 font-mono text-[10px] text-[#8a8f98] transition-colors hover:bg-white/[0.05] hover:text-[#f7f8f8]"
                    >
                      ↑ LOAD PREVIOUS BATCH
                    </button>
                  ) : (
                    <span className="font-mono text-[10px] text-[#62666d]">
                      {loadedPages >= MAX_OLDER_PAGES
                        ? `CAPPED AT ${MAX_OLDER_PAGES} PAGES`
                        : "STREAM ROOT REACHED"}
                    </span>
                  )}
                </div>
              )}
              <div
                ref={scrollRef}
                className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  nearBottomRef.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                  if (searching || !hasMore || loadMore.isPending) return;
                  if (loadedPages >= MAX_OLDER_PAGES) return;
                  if (el.scrollTop <= 8) {
                    loadOlder();
                  }
                }}
              >
                <div ref={streamRef} className="space-y-1.5">
                  {viewMode === "timeline" && timelineNodes
                    ? timelineNodes.map((node) =>
                        node.type === "date" ? (
                          <div
                            key={`date-${node.iso}`}
                            className="flex items-center gap-2 py-1 font-mono text-[10px] text-[#8a8f98]"
                          >
                            <Calendar className="size-3 text-[#7170ff]" />
                            {node.label}
                          </div>
                        ) : (
                          <MessageRow
                            key={node.m.id}
                            m={node.m}
                            selected={selected}
                            onSelect={setSelected}
                          />
                        ),
                      )
                    : display.map((m) => (
                        <MessageRow
                          key={m.id}
                          m={m}
                          selected={selected}
                          onSelect={setSelected}
                        />
                      ))}
                </div>
              </div>
            </div>
          )}
        </GlassPanel>

        {/* Message Inspector Detail Panel */}
        <GlassPanel className="lg:col-span-2">
          <SectionHeader eyebrow="telemetry analysis" title="Inspector Deck" />
          {!selected ? (
            <EmptyState
              title="Select a message"
              description="Click any packet in the stream to inspect AI flags, moderation heuristics, and attachments."
            />
          ) : detail.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-12" />
            </div>
          ) : detail.message ? (
            <MessageDetail
              m={detail.message}
              attachments={detail.attachments}
            />
          ) : (
            <EmptyState title="Packet not found" />
          )}
        </GlassPanel>
      </div>

      {activity.data && activity.data.length > 0 && (
        <ActivityHeatmap buckets={activity.data} />
      )}

      {edits.data && <EditHistory edits={edits.data} />}
    </div>
  );
}

function AiBadge({
  status,
  durationMs,
}: {
  status?: AiStatus | null;
  durationMs?: number | null;
}) {
  if (!status) return null;
  const tone = aiTone(status);
  const icon =
    status === "clean" ? (
      <CheckCircle2 className="size-3" />
    ) : status === "flagged" ? (
      <ShieldAlert className="size-3" />
    ) : status === "warn" ? (
      <AlertTriangle className="size-3" />
    ) : status === "processing" || status === "pending" ? (
      <Loader2 className="size-3 animate-spin" />
    ) : (
      <AlertTriangle className="size-3" />
    );
  const label =
    durationMs && durationMs > 0
      ? `${status} · ${formatDuration(durationMs)}`
      : status;

  return (
    <Badge tone={tone} dot={status === "processing" || status === "pending"}>
      {icon}
      {label}
    </Badge>
  );
}

function MessageDetail({
  m,
  attachments,
}: {
  m: MessageRecord;
  attachments: import("@/lib/types").AttachmentRecord[];
}) {
  const flags = safeParseJsonArray(m.ai_moderation_flags);
  const cats = safeParseJsonArray(m.ai_categories);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <Avatar src={m.avatar_url} name={m.username} size={40} />
        <div>
          <div className="font-semibold text-ink">{m.username}</div>
          <div className="mono text-[0.65rem] text-ink-faint">
            {getMessageChannelLabel(m)} · {formatRelativeTime(m.created_at)}
          </div>
        </div>
        <div className="ml-auto">
          <AiBadge
            status={m.ai_status}
            durationMs={m.ai_analysis_duration_ms}
          />
        </div>
      </div>

      <div className="rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-[#d0d6e0] leading-relaxed">
        {renderMessageContent(m.edited_content ?? m.content, m.metadata) ||
          "(no text content)"}
      </div>

      {m.ai_analysis && (
        <div>
          <div className="eyebrow mb-1">AI heuristic reasoning</div>
          <div className="rounded-[6px] border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-[#8a8f98] leading-relaxed">
            {m.ai_analysis}
          </div>
        </div>
      )}

      {(flags.length > 0 || cats.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <Badge key={f} tone="vermilion">
              {f}
            </Badge>
          ))}
          {cats.map((c) => (
            <Badge key={c} tone="amber">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div>
          <div className="eyebrow mb-1 flex items-center gap-1.5">
            <Paperclip className="size-3" /> Attachments ({attachments.length})
          </div>
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={a.discord_url ?? a.uploaded_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-[6px] border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs text-[#d0d6e0] hover:border-white/[0.12] hover:text-[#f7f8f8]"
              >
                <ImageIcon className="size-3.5 text-[#7170ff]" />
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="mono text-[10px] text-[#8a8f98]">
                  {formatBytes(a.size)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/** Single message card used by both the live feed and the date-grouped timeline. */
function MessageRow({
  m,
  selected,
  onSelect,
}: {
  m: MessageRecord;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <button
      key={m.id}
      type="button"
      onClick={() => onSelect(m.id)}
      className={`msg-feed-card flex w-full items-start gap-3 rounded-[6px] border p-2.5 text-left transition-all ${
        selected === m.id
          ? "border-[#7170ff]/40 bg-[#7170ff]/10"
          : "border-white/[0.06] bg-white/[0.02] hover:border-white/[0.12] hover:bg-white/[0.04]"
      }`}
    >
      <Avatar src={m.avatar_url} name={m.username} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-[#f7f8f8]">
            {m.username}
          </span>
          <span className="font-mono text-[10px] text-[#8a8f98]">
            {getMessageChannelLabel(m)}
          </span>
          <span className="ml-auto font-mono text-[10px] text-[#8a8f98]">
            {formatRelativeTime(m.created_at)}
          </span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-xs text-[#d0d6e0]">
          {renderMessageContent(m.content, m.metadata) || (
            <span className="italic text-[#8a8f98]">(empty / embed)</span>
          )}
        </div>
      </div>
      <AiBadge status={m.ai_status} durationMs={m.ai_analysis_duration_ms} />
    </button>
  );
}
