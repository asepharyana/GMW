"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
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
  useMessageDetail,
  useMessageSearch,
  useMessages,
  useMessagesHasMore,
  useMessagesWsSync,
} from "@/hooks";
import { aiTone } from "@/lib/ai-status";
import {
  formatBytes,
  formatDuration,
  formatRelativeTime,
  getMessageChannelLabel,
  renderMessageContent,
  safeParseJsonArray,
} from "@/lib/format";
import type { AiStatus, Guild, MessageRecord } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function MessagesView({
  initialGuilds,
  initialGuildId,
}: {
  initialGuilds?: Guild[];
  initialGuildId?: string | null;
}) {
  const ws = useWebSocket();
  const [guildId, setGuildId] = useState<string | null>(
    initialGuildId ?? initialGuilds?.[0]?.id ?? null,
  );
  const [channelId, setChannelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  // Guard against loading the entire history on a long scroll: cap how many
  // older pages we append. Each page is 50 messages (backend limit default).
  const MAX_OLDER_PAGES = 10;
  const [loadedPages, setLoadedPages] = useState(0);

  const {
    data: messages,
    isLoading,
    error,
  } = useMessages(guildId ?? "", channelId ?? undefined);
  // Cursor to the next (older) page + whether more history exists.
  const { data: pageInfo } = useMessagesHasMore(
    guildId ?? "",
    channelId ?? undefined,
  );
  const nextCursor = pageInfo?.cursor ?? null;
  const hasMore = pageInfo?.hasMore ?? false;
  const loadMore = useLoadMore();
  useMessagesWsSync(ws, guildId ?? "");
  const search = useMessageSearch(query, query.trim().length >= 2);
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

  const searching = query.trim().length >= 2;
  const list = searching ? (search.data ?? []) : (messages ?? []);
  // Discord-style order: oldest at the top, newest at the bottom. The backend
  // returns DESC (newest first); reverse so the feed reads top→bottom like DC.
  const display = useMemo(() => [...list].reverse(), [list]);

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

  return (
    <div className="space-y-4">
      <GlassPanel className="flex flex-wrap items-center gap-3">
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
            className="pl-9"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </GlassPanel>

      <div className="grid gap-4 lg:grid-cols-5">
        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow={searching ? "results" : "live feed"}
            title={searching ? `“${query}”` : "Messages"}
            action={
              <span className="mono text-xs text-ink-faint">
                {list.length} shown
              </span>
            }
          />
          {error && !messages ? (
            <ErrorState error={error} />
          ) : isLoading && !messages ? (
            <SkeletonRows rows={8} />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-7" />}
              title="No messages"
              description="Pick a guild to begin, or run a search."
            />
          ) : (
            <div>
              {!searching && (
                <div className="mb-2 flex items-center justify-center gap-2">
                  {loadMore.isPending ? (
                    <span className="flex items-center gap-1.5 text-xs text-ink-soft">
                      <Loader2 className="size-3.5 animate-spin" />
                      Loading older…
                    </span>
                  ) : hasMore && loadedPages < MAX_OLDER_PAGES ? (
                    <button
                      type="button"
                      onClick={loadOlder}
                      className="rounded-full border border-hairline bg-white/[0.03] px-3 py-1 text-xs text-ink-soft transition-colors hover:bg-white/[0.06]"
                    >
                      ↑ Load older messages
                    </button>
                  ) : loadedPages >= MAX_OLDER_PAGES ? (
                    <span className="mono text-[0.65rem] text-ink-faint">
                      capped at {MAX_OLDER_PAGES} older pages · use search for
                      more
                    </span>
                  ) : (
                    messages &&
                    messages.length > 0 && (
                      <span className="mono text-[0.65rem] text-ink-faint">
                        beginning of history
                      </span>
                    )
                  )}
                </div>
              )}
              <div
                ref={scrollRef}
                className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1"
                onScroll={(e) => {
                  const el = e.currentTarget;
                  // Track whether the user is near the bottom (to follow live
                  // messages) and auto-load older messages when scrolled to top.
                  nearBottomRef.current =
                    el.scrollHeight - el.scrollTop - el.clientHeight < 120;
                  if (searching || !hasMore || loadMore.isPending) return;
                  if (loadedPages >= MAX_OLDER_PAGES) return;
                  if (el.scrollTop <= 8) {
                    loadOlder();
                  }
                }}
              >
                {display.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setSelected(m.id)}
                    className={`flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors ${
                      selected === m.id
                        ? "border-signal/40 bg-signal/8"
                        : "border-hairline bg-white/[0.03] hover:bg-white/[0.06]"
                    }`}
                  >
                    <Avatar src={m.avatar_url} name={m.username} size={34} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-semibold text-ink">
                          {m.username}
                        </span>
                        <span className="mono text-[0.65rem] text-ink-faint">
                          {getMessageChannelLabel(m)}
                        </span>
                        <span className="mono ml-auto text-[0.6rem] text-ink-faint">
                          {formatRelativeTime(m.created_at)}
                        </span>
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                        {renderMessageContent(m.content, m.metadata) || (
                          <span className="italic text-ink-faint">
                            (empty / embed)
                          </span>
                        )}
                      </div>
                    </div>
                    <AiBadge
                      status={m.ai_status}
                      durationMs={m.ai_analysis_duration_ms}
                    />
                  </button>
                ))}
              </div>
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="lg:col-span-2">
          <SectionHeader eyebrow="inspect" title="Detail" />
          {!selected ? (
            <EmptyState
              title="Select a message"
              description="Click any message to inspect AI analysis, attachments and edit history."
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
            <EmptyState title="Not found" />
          )}
        </GlassPanel>
      </div>
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

      <div className="rounded-[10px] border border-hairline bg-white/[0.03] p-3 text-ink-soft">
        {renderMessageContent(m.edited_content ?? m.content, m.metadata) ||
          "(no text)"}
      </div>

      {m.ai_analysis && (
        <div>
          <div className="eyebrow mb-1">AI analysis</div>
          <div className="rounded-[10px] border border-hairline bg-white/[0.03] p-3 text-ink-soft">
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
                className="flex items-center gap-2 rounded-[10px] border border-hairline bg-white/5 px-3 py-2 text-xs text-ink-soft hover:text-ink"
              >
                <ImageIcon className="size-3.5 text-signal" />
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="mono text-ink-faint">
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
