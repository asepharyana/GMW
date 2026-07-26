"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Flag,
  Hash,
  ImageIcon,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared";
import { GuildSelector } from "@/components/shared/guild-selector";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  useImages,
  useLoadMore,
  useMessageDetail,
  useMessages,
  useMessagesHasMore,
  useMessagesWsSync,
  useReanalyze,
  useReanalyzeBatch,
  useReview,
  useTextChannels,
} from "@/hooks";
import { messagesApi } from "@/lib/api";
import { formatBytes, safeParseJsonArray } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export default function MessagesPage() {
  const [guildId, setGuildId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");
  const [viewTab, setViewTab] = useState<"all" | "images" | "review">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [detailId, setDetailId] = useState<string | null>(null);

  const ws = useWebSocket();
  const { data: channels = [] } = useTextChannels(guildId);
  const {
    data: messages,
    isLoading,
    error,
    refetch,
  } = useMessages(guildId, selectedChannel || undefined);
  const { data: cursorData, refetch: refetchCursor } = useMessagesHasMore(
    guildId,
    selectedChannel || undefined,
  );
  const loadMoreMut = useLoadMore();
  const { data: images } = useImages(guildId);
  const { data: reviews } = useReview(selectedChannel || undefined);
  const reanalyzeMut = useReanalyze();
  const reanalyzeBatchMut = useReanalyzeBatch();

  // Sync WS events into the TanStack Query cache
  useMessagesWsSync(ws, guildId);

  // Detail dialog
  const {
    message: detailMessage,
    attachments: detailAttachments,
    loading: detailLoading,
  } = useMessageDetail(detailId);

  // Images fetch is managed by the query hook (enabled when guildId is set)
  // Review fetch is managed by the query hook

  // Search query (manual trigger)
  const [searchEnabled, setSearchEnabled] = useState(false);
  const { data: searchResults, isFetching: searching } = useQuery<
    MessageRecord[]
  >({
    queryKey: ["messages-search", guildId, searchQuery],
    queryFn: async () => {
      const result = await messagesApi.search(searchQuery, 50);
      return result.results;
    },
    enabled: searchEnabled && !!searchQuery && !!guildId,
  });

  const handleSearch = useCallback(() => {
    if (!searchQuery.trim()) return;
    setSearchEnabled(true);
  }, [searchQuery]);

  const handleLoadMore = useCallback(() => {
    if (!cursorData?.cursor || loadMoreMut.isPending) return;
    loadMoreMut.mutate({
      guildId,
      channelId: selectedChannel || undefined,
      cursor: cursorData.cursor,
    });
  }, [cursorData, loadMoreMut, guildId, selectedChannel]);

  const displayMessages = searchResults ?? messages ?? [];
  const hasMore = cursorData?.hasMore ?? false;
  const isEmpty = !isLoading && displayMessages.length === 0;

  if (error) {
    return (
      <div className="space-y-5">
        <GuildSelector value={guildId} onChange={setGuildId} />
        <ErrorState message={error.message} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <GuildSelector value={guildId} onChange={setGuildId} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="pl-9 h-9"
          />
        </div>
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
        <Button
          variant="outline"
          size="sm"
          onClick={() => reanalyzeBatchMut.mutate(guildId)}
        >
          <RefreshCw className="size-4 mr-1.5" />
          Reanalyze Errors
        </Button>
      </div>

      <Tabs
        value={viewTab}
        onValueChange={(v) => setViewTab(v as typeof viewTab)}
      >
        <TabsList>
          <TabsTrigger value="all">
            All ({(searchResults ?? messages)?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="images">
            Images ({images?.length ?? 0})
          </TabsTrigger>
          <TabsTrigger value="review">
            <Flag className="size-3.5 mr-1" /> Review ({reviews?.length ?? 0})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {searchResults && (
        <p className="text-sm text-muted-foreground animate-fade-in-up">
          Found {searchResults.length} result
          {searchResults.length !== 1 ? "s" : ""}
        </p>
      )}

      {/* ── ALL tab ── */}
      {viewTab === "all" && (
        <div className="space-y-2 animate-fade-in-up">
          {isLoading ? (
            <LoadingSkeleton count={8} height="h-28" />
          ) : isEmpty ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Search className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                {searchResults
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
                  onClick={setDetailId}
                  onReanalyze={(id) => reanalyzeMut.mutate(id)}
                />
              ))}
              {hasMore && (
                <div className="flex justify-center py-6">
                  <Button
                    variant="outline"
                    onClick={handleLoadMore}
                    disabled={loadMoreMut.isPending}
                  >
                    {loadMoreMut.isPending && (
                      <Loader2 className="size-4 animate-spin mr-2" />
                    )}
                    {loadMoreMut.isPending ? "Loading…" : "Load more"}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── IMAGES tab ── */}
      {viewTab === "images" && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in-up">
          {!images || images.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20 text-center">
              <ImageIcon
                className="size-10 text-muted-foreground/40 mb-3"
                aria-label="No images"
              />
              <p className="text-sm text-muted-foreground">No images yet.</p>
            </div>
          ) : (
            images.map((msg) => {
              const imgUrl = extractImage(msg.metadata);
              return (
                <Card
                  key={msg.id}
                  className="group relative overflow-hidden cursor-pointer"
                  onClick={() => setDetailId(msg.id)}
                >
                  <div className="aspect-square relative bg-muted">
                    {imgUrl ? (
                      <img
                        src={imgUrl}
                        alt={msg.content || "Image"}
                        className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="flex items-center justify-center size-full text-muted-foreground text-xs">
                        No image
                      </div>
                    )}
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
      )}

      {/* ── REVIEW tab ── */}
      {viewTab === "review" && (
        <div className="space-y-2 animate-fade-in-up">
          {!reviews || reviews.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Flag className="size-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">
                No flagged messages to review.
              </p>
            </div>
          ) : (
            reviews.map((msg) => (
              <MessageCard
                key={msg.id}
                message={msg}
                onClick={setDetailId}
                onReanalyze={(id) => reanalyzeMut.mutate(id)}
              />
            ))
          )}
        </div>
      )}

      {/* Detail dialog */}
      <Dialog
        open={detailId !== null}
        onOpenChange={(o) => !o && setDetailId(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4" /> Message Detail
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-1">
            {detailLoading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="size-6 animate-spin text-muted-foreground" />
              </div>
            ) : detailMessage ? (
              <DetailView
                message={detailMessage}
                attachments={detailAttachments}
              />
            ) : null}
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Message Card ────────────────────────────────────────────────

function MessageCard({
  message: msg,
  onClick,
  onReanalyze,
}: {
  message: MessageRecord;
  onClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  const severity = (
    {
      low: "border-l-sky-400",
      medium: "border-l-yellow-400",
      high: "border-l-orange-400",
      critical: "border-l-red-500",
    } as Record<string, string>
  )[msg.ai_severity ?? ""];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:bg-accent/5 hover:shadow-sm",
        severity && "border-l-2",
        severity,
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
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{msg.username}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.created_at).toLocaleString()}
              </span>
              <span className="text-xs text-muted-foreground">
                <Hash className="size-3 inline mr-0.5" />
                {msg.channel_id.slice(0, 8)}
              </span>
              <AiStatusBadge status={msg.ai_status} />
              {msg.ai_severity && msg.ai_severity !== "none" && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {msg.ai_severity}
                </Badge>
              )}
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
            <p
              className={cn(
                "text-sm leading-relaxed",
                msg.type === "deleted" &&
                  "italic text-muted-foreground line-through",
              )}
            >
              {msg.content}
            </p>
            {(() => {
              const u = extractFirstImage(msg.metadata);
              if (!u) return null;
              return (
                <img
                  src={u}
                  alt=""
                  className="mt-2 max-h-48 rounded-lg border border-border/50 object-cover"
                />
              );
            })()}
            {msg.ai_moderation_flags && msg.ai_moderation_flags !== "[]" && (
              <div className="flex flex-wrap gap-1">
                {safeParseJsonArray(msg.ai_moderation_flags).map((f) => (
                  <Badge
                    key={f}
                    variant="destructive"
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            {msg.ai_analysis && (
              <p className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed">
                {msg.ai_analysis}
              </p>
            )}
            {msg.ai_confidence != null && (
              <div className="flex items-center gap-2 max-w-40">
                <Progress value={msg.ai_confidence * 100} className="h-1.5" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {(msg.ai_confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onReanalyze(msg.id);
              }}
            >
              <RefreshCw className="size-3 mr-1" /> Reanalyze
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AiStatusBadge({ status }: { status?: string | null }) {
  const c = (
    {
      clean:
        "bg-green-500/15 text-green-600 dark:text-green-400 border-green-500/20",
      warn: "bg-yellow-500/15 text-yellow-600 dark:text-yellow-400 border-yellow-500/20",
      flagged: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/20",
      error:
        "bg-gray-500/15 text-gray-600 dark:text-gray-400 border-gray-500/20",
      pending:
        "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
      processing:
        "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/20",
    } as Record<string, string>
  )[status ?? ""];
  if (!c) return null;
  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", c)}
    >
      {status}
    </Badge>
  );
}

// ── Detail View ──────────────────────────────────────────────────

function DetailView({
  message,
  attachments,
}: {
  message: MessageRecord;
  attachments: {
    id: string;
    filename: string;
    type: string;
    size: number;
    uploaded_url?: string | null;
    discord_url?: string | null;
  }[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarImage src={message.avatar_url ?? undefined} />
          <AvatarFallback>
            {message.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{message.username}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.created_at).toLocaleString()}
            </span>
            {message.type === "deleted" && (
              <Badge variant="destructive" className="text-[10px]">
                deleted
              </Badge>
            )}
            {message.type === "edited" && (
              <Badge variant="outline" className="text-[10px]">
                edited
              </Badge>
            )}
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
      {message.ai_analysis && (
        <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-primary" />
            <p className="text-xs text-muted-foreground font-medium">
              AI Analysis
            </p>
          </div>
          <p className="text-sm leading-relaxed">{message.ai_analysis}</p>
        </div>
      )}
      {message.ai_moderation_flags && message.ai_moderation_flags !== "[]" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Moderation Flags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {safeParseJsonArray(message.ai_moderation_flags).map((f) => (
              <Badge key={f} variant="destructive" className="text-[11px]">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {message.ai_status && (
          <MiniStat label="Status" value={message.ai_status} capitalize />
        )}
        {message.ai_severity && message.ai_severity !== "none" && (
          <MiniStat
            label="Severity"
            value={message.ai_severity}
            destructive
            capitalize
          />
        )}
        {message.ai_confidence != null && (
          <MiniStat
            label="Confidence"
            value={`${(message.ai_confidence * 100).toFixed(0)}%`}
          />
        )}
        {message.ai_recommended_action &&
          message.ai_recommended_action !== "none" && (
            <MiniStat
              label="Action"
              value={message.ai_recommended_action}
              capitalize
            />
          )}
      </div>
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={a.uploaded_url ?? a.discord_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border/50 p-2 hover:bg-muted transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{a.filename}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.type} · {formatBytes(a.size)}
                  </p>
                </div>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function MiniStat({
  label,
  value,
  destructive,
  capitalize,
}: {
  label: string;
  value: string;
  destructive?: boolean;
  capitalize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-sm font-medium mt-0.5",
            capitalize && "capitalize",
            destructive && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Helpers ──────────────────────────────────────────────────────

function extractFirstImage(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    const atts: Array<{ url: string; contentType?: string }> =
      m.attachments ?? [];
    return atts.find((a) => a.contentType?.startsWith("image/"))?.url ?? null;
  } catch {
    return null;
  }
}

function extractImage(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    const atts: Array<{ url: string; contentType?: string }> =
      m.attachments ?? [];
    return atts.find((a) => a.contentType?.startsWith("image/"))?.url ?? null;
  } catch {
    return null;
  }
}
