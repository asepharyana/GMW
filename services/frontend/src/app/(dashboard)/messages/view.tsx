"use client";

import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  History,
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
  MessageMetadata,
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
  // Stream history over WS.
  // Drives snapshots into the SWR list above buffered by rAF; falls back to the
  // SSR `initialMessages` seed if WS is unavailable.
  const { streaming } = useMessagesStream(
    ws,
    guildId ?? "",
    channelId ?? undefined,
  );
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
    guildId,
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

  // Depend on viewMode and initial load flag, NOT display.length, so streaming 200 items doesn't thrash animation
  const streamRef = useStaggerReveal<HTMLDivElement>(".msg-feed-card", {
    stagger: 0.02,
    y: 6,
    dependencies: [viewMode],
  });

  return (
    <div className="space-y-4">
      {/* Tactical HUD Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline pb-3">
        <div className="flex items-center gap-2.5">
          <span className="h-2 w-2 rounded-full bg-signal glow-pulse" />
          <h1 className="font-mono text-xs font-semibold tracking-wide text-ink uppercase">
            Chat Log Stream · Ingestion Stream
          </h1>
          {streaming && (
            <span className="flex items-center gap-1 font-mono text-[10px] text-signal animate-pulse">
              <Loader2 className="size-3 animate-spin" />
              STREAMING
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 font-mono text-[11px] text-ink-muted">
          <span>MODE:</span>
          <span
            className="glitch-text rounded bg-signal/15 px-2 py-0.5 font-medium text-signal border border-signal/30"
            data-text={searching ? "SEARCH_ACTIVE" : viewMode.toUpperCase()}
          >
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
        <div className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setSemanticMode(false)}
            className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              !semanticMode
                ? "bg-surface text-ink border border-hairline-focus shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            EXACT
          </button>
          <button
            type="button"
            onClick={() => setSemanticMode(true)}
            className={`flex items-center gap-1 rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              semanticMode
                ? "bg-signal/20 text-signal border border-signal/40 shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            <Sparkles className="size-3" />
            SEMANTIC
          </button>
        </div>

        <div className="flex items-center gap-1.5 rounded-[6px] border border-hairline bg-surface-2 p-0.5">
          <button
            type="button"
            onClick={() => setViewMode("feed")}
            className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              viewMode === "feed"
                ? "bg-surface text-ink border border-hairline-focus shadow-xs"
                : "text-ink-muted hover:text-ink"
            }`}
          >
            FEED
          </button>
          <button
            type="button"
            onClick={() => setViewMode("timeline")}
            className={`rounded-[4px] px-2.5 py-1 font-mono text-[10px] font-medium transition-all ${
              viewMode === "timeline"
                ? "bg-surface text-ink border border-hairline-focus shadow-xs"
                : "text-ink-muted hover:text-ink"
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
                    className="hud-card flex items-start gap-3 p-3"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-[10px] font-semibold text-signal">
                          {(r.score * 100).toFixed(0)}% RELEVANCE
                        </span>
                        {r.username && (
                          <span className="font-mono text-[10px] font-medium text-ink">
                            {r.username}
                          </span>
                        )}
                        {r.channel_id && (
                          <span className="font-mono text-[10px] text-ink-muted">
                            #{r.channel_id}
                          </span>
                        )}
                        <span
                          className="ml-auto font-mono text-[10px] text-ink-muted"
                          suppressHydrationWarning
                        >
                          {formatRelativeTime(r.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-ink-soft leading-relaxed">
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
                    <span className="flex items-center gap-1.5 font-mono text-xs text-ink-muted">
                      <Loader2 className="size-3.5 animate-spin text-signal" />
                      FETCHING EARLIER PACKETS...
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
                      className="rounded-md border border-hairline bg-surface-2 px-3 py-1 font-mono text-[10px] text-ink-muted transition-colors hover:bg-surface hover:text-ink"
                    >
                      ↑ LOAD PREVIOUS BATCH
                    </button>
                  ) : (
                    <span className="font-mono text-[10px] text-ink-faint">
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
                            className="flex items-center gap-2 py-1 font-mono text-[10px] text-ink-muted"
                          >
                            <Calendar className="size-3 text-signal" />
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
  const editHistory =
    (m as { edit_history?: Array<{ old_content: string; edited_at: number }> })
      .edit_history ?? [];
  const editCount = (m as { edit_count?: number }).edit_count ?? 0;
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <Avatar
          src={m.avatar_url}
          name={m.server_nick ?? m.username}
          size={40}
        />
        <div>
          <div className="font-semibold text-ink">
            {m.server_nick ?? m.username}
          </div>
          {m.server_nick && m.server_nick !== m.username && (
            <div className="text-[11px] text-ink-muted">@{m.username}</div>
          )}
          <div
            className="mono text-[0.65rem] text-ink-faint"
            suppressHydrationWarning
          >
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

      <div className="hud-card p-3 text-xs text-ink-soft leading-relaxed">
        {renderMessageContent(m.edited_content ?? m.content, m.metadata) ||
          "(no text content)"}
      </div>

      {m.ai_analysis && (
        <div>
          <div className="eyebrow mb-1">AI heuristic reasoning</div>
          <div className="hud-card p-3 text-xs text-ink-muted leading-relaxed">
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

      {/* Edit history — before / after diff */}
      {editCount > 0 && editHistory.length > 0 && (
        <div>
          <div className="eyebrow mb-1.5 flex items-center gap-1.5">
            <History className="size-3" /> Edit history ({editCount})
          </div>
          <div className="space-y-2">
            {editHistory.map((e, i) => (
              <div
                key={`${m.id}-edit-${i}`}
                className="grid grid-cols-2 gap-1.5 rounded-[6px] border border-hairline bg-surface-2/50 text-[10px] leading-relaxed"
              >
                <div className="overflow-hidden rounded-l-[5px] border-r border-hairline">
                  <div className="border-b border-hairline bg-vermilion/5 px-2 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-vermilion">
                    Before
                  </div>
                  <div className="max-h-20 overflow-y-auto p-1.5">
                    <pre className="whitespace-pre-wrap break-words text-ink-faint/80">
                      {e.old_content || <em>(empty)</em>}
                    </pre>
                  </div>
                </div>
                <div className="overflow-hidden rounded-r-[5px]">
                  <div className="border-b border-hairline bg-success/5 px-2 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-wider text-success">
                    After
                  </div>
                  <div className="max-h-20 overflow-y-auto p-1.5">
                    <pre className="whitespace-pre-wrap break-words text-ink-soft">
                      {m.content || <em>(empty)</em>}
                    </pre>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
                className="hud-card flex items-center gap-2 px-3 py-2 text-xs text-ink-soft hover:text-ink"
              >
                <ImageIcon className="size-3.5 text-signal" />
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="mono text-[10px] text-ink-muted">
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

/** Parse metadata JSON safely — returns null on malformed / missing data. */
function parseMeta(raw: string | null | undefined): MessageMetadata | null {
  if (!raw) return null;
  try {
    return JSON.parse(raw) as MessageMetadata;
  } catch {
    return null;
  }
}

/** True when an attachment content-type looks like an image we can inline. */
function isImageType(ct?: string | null): boolean {
  if (!ct) return false;
  return ct.startsWith("image/");
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
  const meta = parseMeta(m.metadata);
  const attachments = meta?.attachments ?? [];
  const embeds = meta?.embeds ?? [];
  const stickers = meta?.stickers ?? [];
  const imageAttachments = attachments.filter((a) =>
    isImageType(a.contentType),
  );
  const fileAttachments = attachments.filter(
    (a) => !isImageType(a.contentType),
  );

  // First embed image or sticker url for visual preview
  const embedImage =
    embeds.find((e) => e.image?.url)?.image?.url ??
    embeds.find((e) => e.thumbnail?.url)?.thumbnail?.url ??
    null;
  const stickerUrl = stickers.find((s) => s.url)?.url ?? null;

  return (
    <button
      key={m.id}
      type="button"
      onClick={() => onSelect(m.id)}
      className={`msg-feed-card flex w-full items-start gap-3 rounded-[8px] border p-2.5 text-left transition-all ${
        selected === m.id
          ? "border-signal/50 bg-signal/10 shadow-xs"
          : "border-hairline bg-surface-2 hover:border-hairline-focus hover:bg-surface"
      }`}
    >
      <Avatar src={m.avatar_url} name={m.server_nick ?? m.username} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-ink">
            {m.server_nick ?? m.username}
          </span>
          {m.server_nick && m.server_nick !== m.username && (
            <span className="truncate font-mono text-[10px] text-ink-muted">
              @{m.username}
            </span>
          )}
          <span className="font-mono text-[10px] text-ink-muted">
            {getMessageChannelLabel(m)}
          </span>
          <span
            className="ml-auto font-mono text-[10px] text-ink-muted"
            suppressHydrationWarning
          >
            {formatRelativeTime(m.created_at)}
          </span>
        </div>

        {/* Text content */}
        {m.content && (
          <div className="mt-0.5 line-clamp-2 text-xs text-ink-soft">
            {renderMessageContent(m.content, m.metadata)}
          </div>
        )}

        {/* Inline image attachments */}
        {imageAttachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {imageAttachments.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="block overflow-hidden rounded-[6px] border border-hairline"
              >
                <img
                  src={a.url}
                  alt={a.name}
                  loading="lazy"
                  className="max-h-32 w-auto max-w-[200px] object-cover"
                />
              </a>
            ))}
          </div>
        )}

        {/* Sticker image */}
        {stickerUrl && imageAttachments.length === 0 && (
          <div className="mt-1.5">
            <a
              href={stickerUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block overflow-hidden rounded-[6px] border border-hairline"
            >
              <img
                src={stickerUrl}
                alt={stickers[0]?.name ?? "sticker"}
                loading="lazy"
                className="max-h-28 w-auto max-w-[160px] object-contain"
              />
            </a>
          </div>
        )}

        {/* Embed image / thumbnail */}
        {embedImage && imageAttachments.length === 0 && !stickerUrl && (
          <div className="mt-1.5">
            <a
              href={embedImage}
              target="_blank"
              rel="noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="block overflow-hidden rounded-[6px] border border-hairline"
            >
              <img
                src={embedImage}
                alt="embed"
                loading="lazy"
                className="max-h-32 w-auto max-w-[240px] object-cover"
              />
            </a>
            {embeds[0]?.title && (
              <div className="mt-0.5 truncate text-[10px] font-medium text-ink-muted">
                {embeds[0].title}
              </div>
            )}
          </div>
        )}

        {/* Non-image file attachments */}
        {fileAttachments.length > 0 && (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {fileAttachments.map((a) => (
              <a
                key={a.url}
                href={a.url}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="inline-flex items-center gap-1 rounded-[4px] border border-hairline bg-surface px-2 py-0.5 font-mono text-[10px] text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink"
              >
                <Paperclip className="size-2.5" />
                {a.name}
              </a>
            ))}
          </div>
        )}

        {/* No content at all */}
        {!m.content && attachments.length === 0 && embeds.length === 0 && (
          <div className="mt-0.5 text-xs italic text-ink-muted">
            (empty / embed)
          </div>
        )}
      </div>
      <AiBadge status={m.ai_status} durationMs={m.ai_analysis_duration_ms} />
    </button>
  );
}
