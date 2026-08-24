"use client";

/**
 * Messages scene — the live feed becomes an orbital belt of nodes on the
 * stage; the functional console (picker/search/modes) floats top-left,
 * the stream itself is a translucent dossier column, and a selected
 * message opens its inspection dossier bottom-center.
 */
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
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityHeatmap } from "@/components/ActivityHeatmap";
import { useAmbient } from "@/components/ambient/ambient-context";
import { EditHistory } from "@/components/EditHistory";
import { Avatar, Badge, Skeleton } from "@/components/primitives";
import { EmptyState, ErrorState, SkeletonRows } from "@/components/shared";
import { GuildChannelPicker } from "@/components/shared/guild-picker";
import {
  useSceneFocusSetter,
  useScenePublish,
} from "@/components/shell/scene-graph-context";
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
  useSemanticSearch,
} from "@/hooks";
import { aiTone } from "@/lib/ai-status";
import type { ConstellationGraph } from "@/lib/constellation/graph";
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
import { staggerDelay } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

/** Recent messages → orbital belt (chained edges give the belt shape). */
function beltGraph(list: MessageRecord[]): ConstellationGraph {
  const recent = list.slice(0, 36);
  const nodes = recent.map((m, i) => ({
    id: `msg:${m.id}`,
    label: m.username,
    kind:
      m.ai_status === "flagged" ? ("flagged" as const) : ("message" as const),
    value: Math.max(0.15, 1 - i / Math.max(1, recent.length)),
    href: undefined,
  }));
  const edges = nodes.slice(0, -1).map((n, i) => ({
    source: n.id,
    target: nodes[i + 1]?.id ?? n.id,
  }));
  return { nodes, edges };
}

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
  const [semanticMode, setSemanticMode] = useState(false);
  const [viewMode, setViewMode] = useState<"feed" | "timeline">("feed");
  const MAX_OLDER_PAGES = 10;
  const [loadedPages, setLoadedPages] = useState(0);
  const [showIntel, setShowIntel] = useState(false);

  const {
    data: messages,
    isLoading,
    error,
  } = useMessages(
    guildId ?? "",
    channelId ?? undefined,
    initialMessages ?? undefined,
  );
  useMessagesStream(ws, guildId ?? "", channelId ?? undefined);
  const { data: pageInfo } = useMessagesHasMore(
    guildId ?? "",
    channelId ?? undefined,
  );
  const nextCursor = pageInfo?.cursor ?? null;
  const hasMore = pageInfo?.hasMore ?? false;
  const loadMore = useLoadMore();
  useMessagesWsSync(ws, guildId ?? "");
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
  const publish = useScenePublish();
  const setFocus = useSceneFocusSetter();

  const scrollRef = useRef<HTMLDivElement>(null);
  const nearBottomRef = useRef(true);

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
  const display = useMemo(() => [...list].reverse(), [list]);

  const graph = useMemo(
    () => (searching ? { nodes: [], edges: [] } : beltGraph(list)),
    [list, searching],
  );

  useEffect(() => {
    publish({ graph, focus: selected ? `msg:${selected}` : null });
  }, [graph, selected, publish]);

  useEffect(
    () => () => {
      publish({ graph: { nodes: [], edges: [] }, focus: null });
      setFocus(null);
    },
    [publish, setFocus],
  );

  const timelineNodes = useMemo(() => {
    if (viewMode !== "timeline") return null;
    const out: Array<
      | { type: "date"; label: string; iso: string }
      | { type: "msg"; m: (typeof display)[number] }
    > = [];
    let prevDate = "";
    for (const m of display) {
      const d = new Date(m.created_at).toLocaleDateString(undefined, {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
      const iso = new Date(m.created_at).toISOString().slice(0, 10);
      if (d !== prevDate) {
        out.push({ type: "date", label: d, iso });
        prevDate = d;
      }
      out.push({ type: "msg", m });
    }
    return out;
  }, [display, viewMode]);

  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current && display.length > 0) {
      firstLoadRef.current = false;
      const el = scrollRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [display.length]);

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

  return (
    <div className="min-h-full">
      {/* Console whisper — top-left */}
      <section
        className="pointer-events-auto absolute left-5 top-16 z-20 w-[min(22rem,90vw)] space-y-2"
        aria-label="Stream controls"
      >
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
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[var(--color-ink-faint)]" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search messages…"
              className="h-9 w-full rounded-full border border-[var(--color-hairline)] bg-[var(--color-canvas)]/70 pl-9 pr-3 font-mono text-xs text-[var(--color-ink)] backdrop-blur-md outline-none placeholder:text-[var(--color-ink-faint)] focus:border-[var(--color-signal)]"
            />
          </div>
          <button
            type="button"
            onClick={() => setSemanticMode((v) => !v)}
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              semanticMode
                ? "border-signal/40 bg-signal/10 text-signal"
                : "border-[var(--color-hairline)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            }`}
            title="Toggle semantic (vector) search over the message archive"
          >
            {semanticMode ? "Semantic" : "Exact"}
          </button>
          <button
            type="button"
            onClick={() =>
              setViewMode((v) => (v === "feed" ? "timeline" : "feed"))
            }
            className={`rounded-full border px-3 py-1.5 font-mono text-xs transition-colors ${
              viewMode === "timeline"
                ? "border-signal/40 bg-signal/10 text-signal"
                : "border-[var(--color-hairline)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
            }`}
            title="Toggle timeline (date-grouped) view"
          >
            {viewMode === "timeline" ? "Timeline" : "Feed"}
          </button>
        </div>
      </section>

      {/* Stream dossier — right column */}
      <section
        className="pointer-events-auto absolute bottom-20 right-5 top-28 hidden w-[min(30rem,92vw)] flex-col overflow-hidden rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/70 backdrop-blur-xl md:flex"
        aria-label="Message stream"
      >
        <div className="flex items-center justify-between border-b border-[var(--color-hairline)] px-4 py-2.5">
          <span className="eyebrow">
            {searching ? `“${query}”` : "live stream"}
          </span>
          <span className="font-mono text-xs text-[var(--color-ink-faint)]">
            {list.length} shown
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden p-2">
          {semanticSearching ? (
            <SemanticResults semantic={semantic} />
          ) : error && !messages ? (
            <ErrorState error={error} />
          ) : isLoading && !messages ? (
            <SkeletonRows rows={8} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-6" />}
              title="No messages"
              description="Pick a guild to begin, or run a search."
            />
          ) : (
            <div className="flex h-full flex-col">
              {!searching && (
                <div className="mb-1.5 flex items-center justify-center gap-2">
                  {loadMore.isPending ? (
                    <span className="flex items-center gap-1.5 font-mono text-xs text-[var(--color-ink-soft)]">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading older…
                    </span>
                  ) : hasMore && loadedPages < MAX_OLDER_PAGES ? (
                    <button
                      type="button"
                      onClick={loadOlder}
                      className="rounded-full border border-[var(--color-hairline)] px-3 py-1 font-mono text-xs text-[var(--color-ink-soft)] transition-colors hover:text-[var(--color-ink)]"
                    >
                      ↑ Load older messages
                    </button>
                  ) : loadedPages >= MAX_OLDER_PAGES ? (
                    <span className="font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                      capped at {MAX_OLDER_PAGES} older pages · use search for
                      more
                    </span>
                  ) : (
                    messages &&
                    messages.length > 0 && (
                      <span className="font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
                        beginning of history
                      </span>
                    )
                  )}
                </div>
              )}
              <div
                ref={scrollRef}
                className="min-h-0 flex-1 space-y-1.5 overflow-y-auto pr-1"
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
                {viewMode === "timeline" && timelineNodes
                  ? timelineNodes.map((node) =>
                      node.type === "date" ? (
                        <div
                          key={`date-${node.iso}`}
                          className="flex items-center gap-2 px-1 font-mono text-[0.65rem] text-[var(--color-ink-faint)]"
                        >
                          <Calendar className="size-3" />
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
          )}
        </div>
      </section>

      {/* Mobile stream — full-width sheet under the console */}
      <section
        className="pointer-events-auto absolute inset-x-4 bottom-24 top-44 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/80 p-2 backdrop-blur-xl md:hidden"
        aria-label="Message stream mobile"
      >
        {error && !messages ? (
          <ErrorState error={error} />
        ) : isLoading && !messages ? (
          <SkeletonRows rows={6} />
        ) : display.length === 0 ? (
          <EmptyState title="No messages" description="Pick a guild first." />
        ) : (
          display.map((m) => (
            <MessageRow
              key={m.id}
              m={m}
              selected={selected}
              onSelect={setSelected}
            />
          ))
        )}
      </section>

      {/* Inspection dossier — bottom-center */}
      {selected ? (
        <aside
          className="pointer-events-auto absolute bottom-20 left-1/2 z-30 max-h-[52vh] w-[min(34rem,92vw)] -translate-x-1/2 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/85 p-4 backdrop-blur-xl"
          aria-label="Message detail"
        >
          <button
            type="button"
            className="absolute right-3 top-3 font-mono text-xs text-[var(--color-ink-faint)] hover:text-[var(--color-ink)]"
            onClick={() => setSelected(null)}
          >
            esc
          </button>
          {detail.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-16" />
              <Skeleton className="h-10" />
            </div>
          ) : detail.message ? (
            <MessageDetail
              m={detail.message}
              attachments={detail.attachments}
            />
          ) : (
            <EmptyState title="Not found" />
          )}
        </aside>
      ) : null}

      {/* Intel strip — bottom-left */}
      <div className="pointer-events-auto absolute bottom-20 left-5 hidden w-72 lg:block">
        <button
          type="button"
          onClick={() => setShowIntel((v) => !v)}
          className={`rounded-full border px-3 py-1 font-mono text-xs transition-colors ${
            showIntel
              ? "border-signal/40 bg-signal/10 text-signal"
              : "border-[var(--color-hairline)] text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
          }`}
        >
          intel {showIntel ? "▲" : "▼"}
        </button>
        {showIntel ? (
          <div className="mt-2 max-h-[38vh] space-y-3 overflow-y-auto rounded-2xl border border-[var(--color-hairline)] bg-[var(--color-canvas-2)]/75 p-3 backdrop-blur-xl">
            {activity.data && activity.data.length > 0 ? (
              <ActivityHeatmap buckets={activity.data} />
            ) : null}
            {edits.data ? <EditHistory edits={edits.data} /> : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function SemanticResults({
  semantic,
}: {
  semantic: ReturnType<typeof useSemanticSearch>;
}) {
  if (semantic.isLoading) return <SkeletonRows rows={4} />;
  if (!semantic.data || semantic.data.length === 0) {
    return (
      <EmptyState
        icon={<Search className="size-6" />}
        title="No semantic matches"
        description="Try different wording — semantic search finds meaning, not exact text."
      />
    );
  }
  return (
    <div className="h-full space-y-1.5 overflow-y-auto pr-1">
      {semantic.data.map((r, i) => (
        <div
          key={r.message_id ?? i}
          className="animate-stagger rounded-xl border border-[var(--color-hairline)] p-2.5"
          style={staggerDelay(i)}
        >
          <div className="flex items-center gap-2">
            <span className="font-mono text-[0.6rem] text-signal">
              {(r.score * 100).toFixed(0)}%
            </span>
            <span className="ml-auto font-mono text-[0.6rem] text-[var(--color-ink-faint)]">
              {formatRelativeTime(r.created_at)}
            </span>
          </div>
          <p className="mt-0.5 line-clamp-3 text-sm text-[var(--color-ink-soft)]">
            {r.content}
          </p>
        </div>
      ))}
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
        <Avatar src={m.avatar_url} name={m.username} size={36} />
        <div>
          <div className="font-semibold text-[var(--color-ink)]">
            {m.username}
          </div>
          <div className="font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
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

      <div className="rounded-xl border border-[var(--color-hairline)] p-3 text-[var(--color-ink-soft)]">
        {renderMessageContent(m.edited_content ?? m.content, m.metadata) ||
          "(no text)"}
      </div>

      {m.ai_analysis ? (
        <div>
          <div className="eyebrow mb-1">AI analysis</div>
          <div className="rounded-xl border border-[var(--color-hairline)] p-3 text-[var(--color-ink-soft)]">
            {m.ai_analysis}
          </div>
        </div>
      ) : null}

      {flags.length > 0 || cats.length > 0 ? (
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
      ) : null}

      {attachments.length > 0 ? (
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
                className="flex items-center gap-2 rounded-xl border border-[var(--color-hairline)] px-3 py-2 font-mono text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
              >
                <ImageIcon className="size-3.5 text-signal" />
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="text-[var(--color-ink-faint)]">
                  {formatBytes(a.size)}
                </span>
              </a>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

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
      type="button"
      onClick={() => onSelect(m.id)}
      className={`animate-stagger flex w-full items-start gap-3 rounded-xl border p-2.5 text-left transition-colors ${
        selected === m.id
          ? "border-signal/40 bg-signal/8"
          : "border-[var(--color-hairline)] hover:bg-white/[0.04]"
      }`}
    >
      <Avatar src={m.avatar_url} name={m.username} size={32} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-[var(--color-ink)]">
            {m.username}
          </span>
          <span className="font-mono text-[0.65rem] text-[var(--color-ink-faint)]">
            {getMessageChannelLabel(m)}
          </span>
          <span className="ml-auto font-mono text-[0.6rem] text-[var(--color-ink-faint)]">
            {formatRelativeTime(m.created_at)}
          </span>
        </div>
        <div className="mt-0.5 line-clamp-2 text-sm text-[var(--color-ink-soft)]">
          {renderMessageContent(m.content, m.metadata) || (
            <span className="italic text-[var(--color-ink-faint)]">
              (empty / embed)
            </span>
          )}
        </div>
      </div>
      <AiBadge status={m.ai_status} durationMs={m.ai_analysis_duration_ms} />
    </button>
  );
}
