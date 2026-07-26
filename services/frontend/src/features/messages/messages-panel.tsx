"use client";

import {
  AlertCircle,
  ExternalLink,
  Flag,
  Loader2,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { messagesApi, voiceApi } from "@/lib/api";
import type { AttachmentRecord, Channel, MessageRecord } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export function MessagesPanel({ guildId }: { guildId: string }) {
  // All hooks must be called unconditionally — before the early return.
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageRecord[] | null>(
    null,
  );
  const [searching, setSearching] = useState(false);
  const [viewTab, setViewTab] = useState<"all" | "images" | "review">("all");
  const [imageMessages, setImageMessages] = useState<MessageRecord[]>([]);
  const [reviewMessages, setReviewMessages] = useState<MessageRecord[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [detailMessage, setDetailMessage] = useState<MessageRecord | null>(
    null,
  );
  const [detailAttachments, setDetailAttachments] = useState<
    AttachmentRecord[]
  >([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState("");

  const ws = useWebSocket();

  // ── Guild placeholder (after all hooks) ───────────────────
  if (!guildId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="size-8 text-muted-foreground mb-2" />
        <p className="text-sm text-muted-foreground">
          No guild selected. Select a guild above to view messages.
        </p>
      </div>
    );
  }

  // ── Data-fetching side effects (guildId guaranteed non-empty) ──

  // Fetch available text channels for filtering
  useEffect(() => {
    voiceApi
      .getTextChannels(guildId)
      .then(setChannels)
      .catch(() => {});
  }, [guildId]);

  // Fetch initial messages
  const fetchMessages = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await messagesApi.list(
        guildId,
        50,
        selectedChannel || undefined,
      );
      setMessages(result.data);
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [guildId, selectedChannel]);

  // Fetch image messages
  const fetchImages = useCallback(async () => {
    try {
      const result = await messagesApi.getImages(guildId, 50);
      setImageMessages(result.data);
    } catch {
      // silently fail
    }
  }, [guildId]);

  // Fetch review (flagged) messages
  const fetchReview = useCallback(async () => {
    try {
      const result = await messagesApi.getReview(
        50,
        selectedChannel || undefined,
      );
      setReviewMessages(result.results);
    } catch {
      // silently fail
    }
  }, [selectedChannel]);

  useEffect(() => {
    fetchMessages();
    fetchImages();
  }, [fetchMessages, fetchImages]);

  useEffect(() => {
    if (viewTab === "review") fetchReview();
  }, [viewTab, fetchReview]);

  // WS subscription for real-time message updates
  useEffect(() => {
    const unsubCreated = ws.on("message_created", (msg) => {
      setMessages((prev) => [msg as MessageRecord, ...prev]);
    });
    const unsubUpdated = ws.on("message_updated", (msg) => {
      setMessages((prev) =>
        prev.map((m) =>
          (msg as MessageRecord).id === m.id ? (msg as MessageRecord) : m,
        ),
      );
    });
    const unsubDeleted = ws.on("message_deleted", (id) => {
      setMessages((prev) =>
        prev.filter((m) => m.id !== (id as unknown as string)),
      );
    });
    const unsubAnalyzed = ws.on("message_analyzed", (msg) => {
      setMessages((prev) =>
        prev.map((m) =>
          (msg as MessageRecord).id === m.id ? (msg as MessageRecord) : m,
        ),
      );
    });

    return () => {
      unsubCreated();
      unsubUpdated();
      unsubDeleted();
      unsubAnalyzed();
    };
  }, [ws]);

  // Search handler
  const handleSearch = useCallback(async () => {
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }
    setSearching(true);
    try {
      const result = await messagesApi.search(searchQuery, 50);
      setSearchResults(result.results);
    } catch {
      setSearchResults([]);
    } finally {
      setSearching(false);
    }
  }, [searchQuery]);

  // Load more (cursor pagination)
  const handleLoadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await messagesApi.list(
        guildId,
        50,
        selectedChannel || undefined,
        cursor,
      );
      setMessages((prev) => [...prev, ...result.data]);
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch {
      // ignore
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, guildId, selectedChannel]);

  const handleMessageClick = useCallback(async (id: string) => {
    setDetailLoading(true);
    setDetailAttachments([]);
    try {
      const detail = await messagesApi.getDetail(id);
      setDetailMessage(detail);
      // Try to fetch attachments too
      if (detail.channel_id && id) {
        messagesApi
          .getAttachments(detail.channel_id, 10)
          .then((res) => setDetailAttachments(res.data))
          .catch(() => {});
      }
    } catch {
      setDetailMessage(null);
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const handleReanalyze = useCallback(async (id: string) => {
    try {
      await messagesApi.reanalyze(id);
    } catch {
      // ignore
    }
  }, []);

  const handleReanalyzeBatch = useCallback(async () => {
    try {
      await messagesApi.reanalyzeBatch(guildId);
    } catch {
      // ignore
    }
  }, [guildId]);

  const displayMessages = searchResults ?? messages;
  const isEmpty = !loading && displayMessages.length === 0;

  // Render error state
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <AlertCircle className="size-8 text-destructive mb-2" />
        <p className="text-sm text-muted-foreground mb-4">{error}</p>
        <button
          onClick={fetchMessages}
          className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="size-4" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search + toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="w-full h-9 rounded-lg border border-input bg-background pl-9 pr-3 text-sm shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          />
        </div>

        {/* Channel filter */}
        {channels.length > 0 && (
          <select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value)}
            className="h-9 rounded-lg border border-input bg-background px-3 text-sm"
          >
            <option value="">All channels</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                #{ch.name}
              </option>
            ))}
          </select>
        )}

        <button
          onClick={handleReanalyzeBatch}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          <RefreshCw className="size-4" />
          Reanalyze Errors
        </button>
      </div>

      {/* Tab bar */}
      <div className="flex gap-1 rounded-lg border p-1 w-fit">
        <button
          type="button"
          onClick={() => setViewTab("all")}
          data-active={viewTab === "all" ? "" : undefined}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-primary data-[active]:text-primary-foreground hover:bg-muted"
        >
          All ({messages.length})
        </button>
        <button
          type="button"
          onClick={() => setViewTab("images")}
          data-active={viewTab === "images" ? "" : undefined}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-primary data-[active]:text-primary-foreground hover:bg-muted"
        >
          Images
        </button>
        <button
          type="button"
          onClick={() => setViewTab("review")}
          data-active={viewTab === "review" ? "" : undefined}
          className="rounded-md px-3 py-1.5 text-sm font-medium transition-colors data-[active]:bg-primary data-[active]:text-primary-foreground hover:bg-muted"
        >
          <Flag className="size-3.5 inline mr-1" />
          Review ({reviewMessages.length})
        </button>
      </div>

      {/* Search results count */}
      {searchResults !== null && (
        <p className="text-sm text-muted-foreground">
          Found {searchResults.length} result
          {searchResults.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Messages feed */}
      {viewTab === "all" ? (
        <div className="space-y-2">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="flex gap-3 rounded-lg border p-4">
                  <div className="size-8 shrink-0 rounded-full bg-muted animate-pulse" />
                  <div className="flex-1 space-y-2">
                    <div className="h-4 w-32 bg-muted rounded animate-pulse" />
                    <div className="h-3 w-full bg-muted rounded animate-pulse" />
                    <div className="h-3 w-3/4 bg-muted rounded animate-pulse" />
                  </div>
                </div>
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="text-sm text-muted-foreground">
                {searchResults !== null
                  ? "No messages found matching your search."
                  : "No captures yet."}
              </p>
            </div>
          ) : (
            <>
              {displayMessages.map((msg) => (
                <MessageCard
                  key={msg.id}
                  message={msg}
                  onClick={handleMessageClick}
                  onReanalyze={handleReanalyze}
                />
              ))}

              {/* Load more */}
              {hasMore && searchResults === null && (
                <div className="flex justify-center py-4">
                  <button
                    type="button"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                    className="inline-flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    {loadingMore ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : null}
                    {loadingMore ? "Loading…" : "Load more"}
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      ) : viewTab === "images" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {imageMessages.map((msg) => (
            <div
              key={msg.id}
              className="aspect-square rounded-lg border bg-muted overflow-hidden"
            >
              {msg.content && (
                <div className="p-2 text-xs text-muted-foreground truncate">
                  {msg.username}: {msg.content}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        /* Review tab */
        <div className="space-y-2">
          {reviewMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Flag className="size-8 text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">
                No flagged messages to review.
              </p>
            </div>
          ) : (
            reviewMessages.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                onClick={handleMessageClick}
                onReanalyze={handleReanalyze}
              />
            ))
          )}
        </div>
      )}

      {/* Message Detail Modal */}
      {detailMessage && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 pt-12 px-4">
          <div className="w-full max-w-2xl rounded-lg border bg-background shadow-xl overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between border-b p-4">
              <h3 className="text-sm font-semibold">Message Detail</h3>
              <button
                type="button"
                onClick={() => setDetailMessage(null)}
                className="inline-flex size-7 items-center justify-center rounded-md hover:bg-muted transition-colors"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Content */}
            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-4">
              {detailLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="size-6 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Message info */}
                  <div className="flex items-start gap-3">
                    <div className="size-10 shrink-0 rounded-full bg-muted flex items-center justify-center text-sm font-medium overflow-hidden">
                      {detailMessage.avatar_url ? (
                        <img
                          src={detailMessage.avatar_url}
                          alt=""
                          className="size-full object-cover"
                        />
                      ) : (
                        detailMessage.username.charAt(0).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {detailMessage.username}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(detailMessage.created_at).toLocaleString()}
                        </span>
                        {detailMessage.type === "deleted" && (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-500">
                            deleted
                          </span>
                        )}
                      </div>
                      <p className="text-sm mt-1 whitespace-pre-wrap break-words">
                        {detailMessage.content}
                      </p>
                    </div>
                  </div>

                  {/* AI Analysis section */}
                  {detailMessage.ai_analysis && (
                    <div className="rounded-lg bg-muted/50 p-3">
                      <p className="text-xs text-muted-foreground mb-1">
                        AI Analysis
                      </p>
                      <p className="text-sm">{detailMessage.ai_analysis}</p>
                    </div>
                  )}

                  {/* AI flags */}
                  {detailMessage.ai_moderation_flags &&
                    detailMessage.ai_moderation_flags !== "[]" && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Moderation Flags
                        </p>
                        <div className="flex flex-wrap gap-1">
                          {safeParseJsonArray(
                            detailMessage.ai_moderation_flags,
                          ).map((flag) => (
                            <span
                              key={flag}
                              className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive"
                            >
                              {flag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* AI Scores */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {detailMessage.ai_status && (
                      <div className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">Status</p>
                        <p className="text-sm font-medium">
                          {detailMessage.ai_status}
                        </p>
                      </div>
                    )}
                    {detailMessage.ai_severity &&
                      detailMessage.ai_severity !== "none" && (
                        <div className="rounded-lg border p-2">
                          <p className="text-xs text-muted-foreground">
                            Severity
                          </p>
                          <p className="text-sm font-medium text-destructive">
                            {detailMessage.ai_severity}
                          </p>
                        </div>
                      )}
                    {detailMessage.ai_confidence != null && (
                      <div className="rounded-lg border p-2">
                        <p className="text-xs text-muted-foreground">
                          Confidence
                        </p>
                        <p className="text-sm font-medium">
                          {(detailMessage.ai_confidence * 100).toFixed(0)}%
                        </p>
                      </div>
                    )}
                    {detailMessage.ai_recommended_action &&
                      detailMessage.ai_recommended_action !== "none" && (
                        <div className="rounded-lg border p-2">
                          <p className="text-xs text-muted-foreground">
                            Action
                          </p>
                          <p className="text-sm font-medium">
                            {detailMessage.ai_recommended_action}
                          </p>
                        </div>
                      )}
                  </div>

                  {/* Attachments */}
                  {detailAttachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Attachments ({detailAttachments.length})
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {detailAttachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.uploaded_url ?? att.discord_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg border p-2 hover:bg-muted transition-colors"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {att.filename}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {att.type} · {formatBytes(att.size)}
                              </p>
                            </div>
                            <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw metadata */}
                  {detailMessage.metadata &&
                    detailMessage.metadata !== "{}" && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground">
                          Metadata (raw)
                        </p>
                        <pre className="text-xs bg-muted rounded-lg p-3 overflow-x-auto max-h-32">
                          {JSON.stringify(
                            safeParseJsonObject(detailMessage.metadata),
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Message Card ──────────────────────────────────────────

function MessageCard({
  message: msg,
  onClick,
  onReanalyze,
}: {
  message: MessageRecord;
  onClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  const aiStatusColor: Record<string, string> = {
    clean: "bg-green-500/15 text-green-600 dark:text-green-400",
    warn: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400",
    flagged: "bg-red-500/15 text-red-600 dark:text-red-400",
    error: "bg-gray-500/15 text-gray-600 dark:text-gray-400",
    pending: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
    processing: "bg-blue-500/15 text-blue-600 dark:text-blue-400",
  };

  const severityColor: Record<string, string> = {
    none: "",
    low: "border-l-green-400",
    medium: "border-l-yellow-400",
    high: "border-l-orange-400",
    critical: "border-l-red-500",
  };

  const date = new Date(msg.created_at);
  const timeStr = date.toLocaleString();

  return (
    // biome-ignore lint/a11y/useSemanticElements: complex nested content prevents using button
    <div
      role="button"
      tabIndex={0}
      onClick={() => onClick(msg.id)}
      onKeyDown={(e) => e.key === "Enter" && onClick(msg.id)}
      className={`rounded-lg border p-4 space-y-2 transition-colors cursor-pointer hover:bg-muted/50 ${
        msg.ai_severity ? (severityColor[msg.ai_severity] ?? "") : ""
      } ${msg.ai_severity && msg.ai_severity !== "none" ? "border-l-2" : ""}`}
    >
      {/* Header */}
      <div className="flex items-start gap-3">
        {/* Avatar */}
        <div className="size-8 shrink-0 rounded-full bg-muted flex items-center justify-center text-xs font-medium overflow-hidden">
          {msg.avatar_url ? (
            <img
              src={msg.avatar_url}
              alt=""
              className="size-full object-cover"
            />
          ) : (
            msg.username.charAt(0).toUpperCase()
          )}
        </div>

        <div className="flex-1 min-w-0">
          {/* Username + time + badges */}
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{msg.username}</span>
            <span className="text-xs text-muted-foreground">{timeStr}</span>
            <span className="text-xs text-muted-foreground">
              #{msg.channel_id.slice(0, 8)}
            </span>

            {/* AI Status badge */}
            {msg.ai_status && aiStatusColor[msg.ai_status] && (
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${aiStatusColor[msg.ai_status]}`}
              >
                {msg.ai_status}
              </span>
            )}

            {/* Severity badge */}
            {msg.ai_severity && msg.ai_severity !== "none" && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-destructive/10 text-destructive">
                {msg.ai_severity}
              </span>
            )}

            {/* Message type badge */}
            {msg.type === "deleted" && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-red-500/10 text-red-500">
                deleted
              </span>
            )}
            {msg.type === "edited" && (
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-blue-500/10 text-blue-500">
                edited
              </span>
            )}
          </div>

          {/* Content */}
          <p className="text-sm mt-1 whitespace-pre-wrap break-words">
            {msg.type === "deleted" ? (
              <span className="italic text-muted-foreground line-through">
                {msg.content}
              </span>
            ) : (
              msg.content
            )}
          </p>

          {/* AI Details */}
          {msg.ai_moderation_flags && msg.ai_moderation_flags !== "[]" && (
            <div className="flex flex-wrap gap-1 mt-1">
              {safeParseJsonArray(msg.ai_moderation_flags).map((flag) => (
                <span
                  key={flag}
                  className="inline-flex items-center rounded-md bg-destructive/10 px-1.5 py-0.5 text-xs font-medium text-destructive"
                >
                  {flag}
                </span>
              ))}
            </div>
          )}

          {msg.ai_analysis && (
            <p className="text-xs text-muted-foreground mt-1 italic line-clamp-2">
              {msg.ai_analysis}
            </p>
          )}

          {/* Confidence score */}
          {msg.ai_confidence !== undefined && msg.ai_confidence !== null && (
            <div className="flex items-center gap-2 mt-1">
              <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden max-w-24">
                <div
                  className="h-full rounded-full bg-primary"
                  style={{
                    width: msg.ai_confidence * 100 + "%",
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {(msg.ai_confidence * 100).toFixed(0)}%
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex gap-2 mt-2">
            <button
              type="button"
              onClick={() => onReanalyze(msg.id)}
              className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium hover:bg-muted transition-colors"
              title="Re-analyze this message"
            >
              <RefreshCw className="size-3" />
              Reanalyze
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────

function safeParseJsonObject(
  value: string | null | undefined,
): Record<string, unknown> {
  if (!value) return {};
  try {
    const parsed = JSON.parse(value);
    if (typeof parsed === "object" && parsed !== null) return parsed;
    return {};
  } catch {
    return {};
  }
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function safeParseJsonArray(value: string | null | undefined): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch {
    return [];
  }
}
