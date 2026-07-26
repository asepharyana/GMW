"use client";

import {
  AlertCircle,
  ExternalLink,
  Flag,
  Hash,
  Loader2,
  RefreshCw,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { messagesApi, voiceApi } from "@/lib/api";
import type { AttachmentRecord, Channel, MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export function MessagesPanel({ guildId }: { guildId: string }) {
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
  const [_searching, setSearching] = useState(false);
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

  // ── Data fetching ──

  useEffect(() => {
    if (!guildId) return;
    voiceApi
      .getTextChannels(guildId)
      .then(setChannels)
      .catch(() => {});
  }, [guildId]);

  const fetchMessages = useCallback(async () => {
    if (!guildId) return;
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

  const fetchImages = useCallback(async () => {
    if (!guildId) return;
    try {
      const result = await messagesApi.getImages(guildId, 50);
      setImageMessages(result.data);
    } catch {
      // silently fail
    }
  }, [guildId]);

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

  // WS subscriptions
  useEffect(() => {
    if (!guildId) return;
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
  }, [ws, guildId]);

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

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircle className="size-10 text-destructive mb-3" />
        <p className="text-sm text-muted-foreground mb-4 max-w-sm">{error}</p>
        <Button variant="outline" onClick={fetchMessages}>
          <RefreshCw className="size-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Search + toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9 h-9"
          />
        </div>

        {/* Channel filter */}
        {channels.length > 0 && (
          <Select
            value={selectedChannel}
            onValueChange={(v) => v && setSelectedChannel(v)}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">All channels</SelectItem>
              {channels.map((ch) => (
                <SelectItem key={ch.id} value={ch.id}>
                  # {ch.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button variant="outline" size="sm" onClick={handleReanalyzeBatch}>
          <RefreshCw className="size-4 mr-1.5" />
          Reanalyze Errors
        </Button>
      </div>

      {/* Tab bar using shadcn Tabs */}
      <Tabs
        value={viewTab}
        onValueChange={(v) => setViewTab(v as "all" | "images" | "review")}
      >
        <TabsList>
          <TabsTrigger value="all" onClick={() => setViewTab("all")}>
            All ({messages.length})
          </TabsTrigger>
          <TabsTrigger value="images" onClick={() => setViewTab("images")}>
            Images ({imageMessages.length})
          </TabsTrigger>
          <TabsTrigger value="review" onClick={() => setViewTab("review")}>
            <Flag className="size-3.5 mr-1" />
            Review ({reviewMessages.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Search results count */}
      {searchResults !== null && (
        <p className="text-sm text-muted-foreground animate-fade-in-up">
          Found {searchResults.length} result
          {searchResults.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* Messages feed */}
      {viewTab === "all" ? (
        <div className="space-y-2 animate-fade-in-up">
          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-28 rounded-xl" />
              ))}
            </div>
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="size-10 text-muted-foreground/40 mb-3" />
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

              {hasMore && searchResults === null && (
                <div className="flex justify-center py-6">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={loadingMore}
                  >
                    {loadingMore && (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    )}
                    {loadingMore ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      ) : viewTab === "images" ? (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in-up">
          {imageMessages.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <ImageIcon className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No images yet.</p>
            </div>
          ) : (
            imageMessages.map((msg) => {
              let imageUrl: string | null = null;
              try {
                const meta = JSON.parse(msg.metadata ?? "{}");
                const attachments: Array<{
                  url: string;
                  contentType?: string;
                }> = meta.attachments ?? [];
                const img = attachments.find((a) =>
                  a.contentType?.startsWith("image/"),
                );
                imageUrl = img?.url ?? null;
              } catch {
                // metadata malformed
              }

              return (
                <Card
                  key={msg.id}
                  className="group relative overflow-hidden cursor-pointer"
                  onClick={() => handleMessageClick(msg.id)}
                >
                  <div className="aspect-square relative bg-muted">
                    {imageUrl ? (
                      <Image
                        src={imageUrl}
                        alt={msg.content || "Image"}
                        fill
                        className="object-cover transition-transform duration-300 group-hover:scale-105"
                        sizes="(max-width: 768px) 50vw, 25vw"
                      />
                    ) : (
                      <div className="flex items-center justify-center size-full text-muted-foreground text-xs">
                        No image
                      </div>
                    )}
                    {/* Hover overlay */}
                    {msg.content && (
                      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
                        <p className="text-xs text-white/90 line-clamp-2">
                          {msg.username}: {msg.content}
                        </p>
                      </div>
                    )}
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : (
        /* Review tab */
        <div className="space-y-2 animate-fade-in-up">
          {reviewMessages.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Flag className="size-10 text-muted-foreground/40 mb-3" />
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

      {/* Message Detail Dialog */}
      <Dialog
        open={detailMessage !== null}
        onOpenChange={(open) => {
          if (!open) setDetailMessage(null);
        }}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4" />
              Message Detail
            </DialogTitle>
          </DialogHeader>

          <ScrollArea className="max-h-[70vh] pr-1">
            <div className="space-y-5">
              {detailLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="size-6 animate-spin text-muted-foreground" />
                </div>
              ) : detailMessage ? (
                <>
                  {/* Message info */}
                  <div className="flex items-start gap-3">
                    <Avatar className="size-10">
                      <AvatarImage
                        src={detailMessage.avatar_url ?? undefined}
                      />
                      <AvatarFallback>
                        {detailMessage.username.charAt(0).toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium">
                          {detailMessage.username}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {new Date(detailMessage.created_at).toLocaleString()}
                        </span>
                        {detailMessage.type === "deleted" && (
                          <Badge variant="destructive" className="text-[10px]">
                            deleted
                          </Badge>
                        )}
                        {detailMessage.type === "edited" && (
                          <Badge variant="outline" className="text-[10px]">
                            edited
                          </Badge>
                        )}
                      </div>
                      <p className="text-sm mt-2 whitespace-pre-wrap break-words leading-relaxed">
                        {detailMessage.content}
                      </p>
                    </div>
                  </div>

                  {/* AI Analysis */}
                  {detailMessage.ai_analysis && (
                    <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
                      <div className="flex items-center gap-2 mb-2">
                        <Sparkles className="size-4 text-primary" />
                        <p className="text-xs text-muted-foreground font-medium">
                          AI Analysis
                        </p>
                      </div>
                      <p className="text-sm leading-relaxed">
                        {detailMessage.ai_analysis}
                      </p>
                    </div>
                  )}

                  {/* AI flags */}
                  {detailMessage.ai_moderation_flags &&
                    detailMessage.ai_moderation_flags !== "[]" && (
                      <div className="space-y-2">
                        <p className="text-xs text-muted-foreground font-medium">
                          Moderation Flags
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {safeParseJsonArray(
                            detailMessage.ai_moderation_flags,
                          ).map((flag) => (
                            <Badge
                              key={flag}
                              variant="destructive"
                              className="text-[11px]"
                            >
                              {flag}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                  {/* AI Scores */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {detailMessage.ai_status && (
                      <Card>
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            Status
                          </p>
                          <p className="text-sm font-medium mt-0.5 capitalize">
                            {detailMessage.ai_status}
                          </p>
                        </CardContent>
                      </Card>
                    )}
                    {detailMessage.ai_severity &&
                      detailMessage.ai_severity !== "none" && (
                        <Card>
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">
                              Severity
                            </p>
                            <p className="text-sm font-medium mt-0.5 text-destructive capitalize">
                              {detailMessage.ai_severity}
                            </p>
                          </CardContent>
                        </Card>
                      )}
                    {detailMessage.ai_confidence != null && (
                      <Card>
                        <CardContent className="p-3">
                          <p className="text-xs text-muted-foreground">
                            Confidence
                          </p>
                          <p className="text-sm font-medium mt-0.5 tabular-nums">
                            {(detailMessage.ai_confidence * 100).toFixed(0)}%
                          </p>
                        </CardContent>
                      </Card>
                    )}
                    {detailMessage.ai_recommended_action &&
                      detailMessage.ai_recommended_action !== "none" && (
                        <Card>
                          <CardContent className="p-3">
                            <p className="text-xs text-muted-foreground">
                              Action
                            </p>
                            <p className="text-sm font-medium mt-0.5 capitalize">
                              {detailMessage.ai_recommended_action}
                            </p>
                          </CardContent>
                        </Card>
                      )}
                  </div>

                  {/* Attachments */}
                  {detailAttachments.length > 0 && (
                    <div className="space-y-2">
                      <p className="text-xs text-muted-foreground font-medium">
                        Attachments ({detailAttachments.length})
                      </p>
                      <div className="grid grid-cols-2 gap-2">
                        {detailAttachments.map((att) => (
                          <a
                            key={att.id}
                            href={att.uploaded_url ?? att.discord_url}
                            target="_blank"
                            rel="noreferrer"
                            className="flex items-center gap-2 rounded-lg border border-border/50 p-2 hover:bg-muted transition-colors group"
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium truncate">
                                {att.filename}
                              </p>
                              <p className="text-[11px] text-muted-foreground">
                                {att.type} · {formatBytes(att.size)}
                              </p>
                            </div>
                            <ExternalLink className="size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Raw metadata */}
                  {detailMessage.metadata &&
                    detailMessage.metadata !== "{}" && (
                      <div className="space-y-1">
                        <p className="text-xs text-muted-foreground font-medium">
                          Metadata (raw)
                        </p>
                        <pre className="text-xs bg-muted/50 rounded-lg p-3 overflow-x-auto max-h-32 border border-border/50">
                          {JSON.stringify(
                            safeParseJsonObject(detailMessage.metadata),
                            null,
                            2,
                          )}
                        </pre>
                      </div>
                    )}
                </>
              ) : null}
            </div>
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Message Card ────────────────────────────────

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
    clean:
      "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
    warn: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
    flagged: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
    error: "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20",
    pending:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    processing:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
  };

  const severityLeftBorder: Record<string, string> = {
    low: "border-l-sky-400",
    medium: "border-l-yellow-400",
    high: "border-l-orange-400",
    critical: "border-l-red-500",
  };

  const hasSeverity =
    msg.ai_severity &&
    msg.ai_severity !== "none" &&
    severityLeftBorder[msg.ai_severity];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:bg-accent/5 hover:shadow-sm",
        hasSeverity && "border-l-2",
        hasSeverity && severityLeftBorder[msg.ai_severity as string],
      )}
      onClick={() => onClick(msg.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-8 shrink-0 mt-0.5">
            <AvatarImage src={msg.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {msg.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>

          <div className="flex-1 min-w-0 space-y-2">
            {/* Username + time + badges */}
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{msg.username}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                <Hash className="size-3 inline mr-0.5" />
                {msg.channel_id.slice(0, 8)}
              </span>

              {/* AI Status badge */}
              {msg.ai_status && aiStatusColor[msg.ai_status] && (
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px] px-1.5 py-0 h-4 font-medium",
                    aiStatusColor[msg.ai_status],
                  )}
                >
                  {msg.ai_status}
                </Badge>
              )}

              {/* Severity badge */}
              {msg.ai_severity && msg.ai_severity !== "none" && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {msg.ai_severity}
                </Badge>
              )}

              {/* Deleted/edited badges */}
              {msg.type === "deleted" && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  deleted
                </Badge>
              )}
              {msg.type === "edited" && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  edited
                </Badge>
              )}
            </div>

            {/* Content */}
            <p
              className={cn(
                "text-sm leading-relaxed",
                msg.type === "deleted" &&
                  "italic text-muted-foreground line-through",
              )}
            >
              {msg.content}
            </p>

            {/* AI flags */}
            {msg.ai_moderation_flags && msg.ai_moderation_flags !== "[]" && (
              <div className="flex flex-wrap gap-1">
                {safeParseJsonArray(msg.ai_moderation_flags).map((flag) => (
                  <Badge
                    key={flag}
                    variant="destructive"
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    {flag}
                  </Badge>
                ))}
              </div>
            )}

            {/* AI analysis snippet */}
            {msg.ai_analysis && (
              <p className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed">
                {msg.ai_analysis}
              </p>
            )}

            {/* Confidence bar */}
            {msg.ai_confidence !== undefined && msg.ai_confidence !== null && (
              <div className="flex items-center gap-2 max-w-40">
                <Progress value={msg.ai_confidence * 100} className="h-1.5" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {(msg.ai_confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-1.5 pt-0.5">
              <Button
                variant="ghost"
                size="xs"
                onClick={(e) => {
                  e.stopPropagation();
                  onReanalyze(msg.id);
                }}
              >
                <RefreshCw className="size-3 mr-1" />
                Reanalyze
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Helpers ─────────────────────────────────────

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

// Inline icon components to avoid missing imports
function ImageIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Image"
    >
      <title>Image</title>
      <rect width="18" height="18" x="3" y="3" rx="2" ry="2" />
      <circle cx="9" cy="9" r="2" />
      <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />
    </svg>
  );
}

function MessageSquare({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      role="img"
      aria-label="Message"
    >
      <title>Message</title>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}
