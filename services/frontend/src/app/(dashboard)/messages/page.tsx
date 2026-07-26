"use client";

import {
  ExternalLink,
  Flag,
  Hash,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
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
  useMessageDetail,
  useMessages,
  useMessageWsSubscription,
  useReview,
  useSearch,
  useTextChannels,
} from "@/hooks";
import { formatBytes, safeParseJsonArray } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

export default function MessagesPage() {
  const [guildId, setGuildId] = useState("");
  const [selectedChannel, setSelectedChannel] = useState("");

  const ws = useWebSocket();
  const { channels } = useTextChannels(guildId);
  const {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch,
    loadMore,
    prepend,
    update,
    remove,
  } = useMessages(guildId, selectedChannel || undefined);
  const { images, refetch: refetchImages } = useImages(guildId);
  const { reviews, refetch: refetchReviews } = useReview(
    selectedChannel || undefined,
  );
  const { results: searchResults, searching, search } = useSearch();
  const {
    message: detailMessage,
    attachments: detailAttachments,
    loading: detailLoading,
    open: openDetail,
    close: closeDetail,
  } = useMessageDetail();

  const [viewTab, setViewTab] = useState<"all" | "images" | "review">("all");
  const [searchQuery, setSearchQuery] = useState("");

  // WS real-time subscriptions
  const handleCreated = useCallback(
    (msg: MessageRecord) => prepend(msg),
    [prepend],
  );
  const handleUpdated = useCallback(
    (msg: MessageRecord) => update(msg),
    [update],
  );
  const handleDeleted = useCallback((id: string) => remove(id), [remove]);
  const handleAnalyzed = useCallback(
    (msg: MessageRecord) => update(msg),
    [update],
  );

  useMessageWsSubscription(
    ws,
    guildId,
    handleCreated,
    handleUpdated,
    handleDeleted,
    handleAnalyzed,
  );

  // Fetch images on mount and when guild changes
  useEffect(() => {
    refetchImages();
  }, [refetchImages]);

  // Fetch reviews when tab switches
  useEffect(() => {
    if (viewTab === "review") refetchReviews();
  }, [viewTab, refetchReviews]);

  const handleReanalyze = useCallback(async (id: string) => {
    const { messagesApi } = await import("@/lib/api");
    try {
      await messagesApi.reanalyze(id);
    } catch (err) {
      console.error("messages/reanalyze:", err);
    }
  }, []);

  const handleReanalyzeBatch = useCallback(async () => {
    if (!guildId) return;
    const { messagesApi } = await import("@/lib/api");
    try {
      await messagesApi.reanalyzeBatch(guildId);
    } catch (err) {
      console.error("messages/reanalyzeBatch:", err);
    }
  }, [guildId]);

  const displayMessages = searchResults ?? messages;
  const _isEmpty = !loading && displayMessages.length === 0;

  if (error) {
    return (
      <div className="space-y-5">
        <GuildSelector value={guildId} onChange={setGuildId} />
        <ErrorState message={error} onRetry={refetch} />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <GuildSelector value={guildId} onChange={setGuildId} />

      {/* Search + toolbar */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search messages…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search(searchQuery)}
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

        <Button variant="outline" size="sm" onClick={handleReanalyzeBatch}>
          <RefreshCw className="size-4 mr-1.5" />
          Reanalyze Errors
        </Button>
      </div>

      {/* Tabs */}
      <Tabs
        value={viewTab}
        onValueChange={(v) => setViewTab(v as "all" | "images" | "review")}
      >
        <TabsList>
          <TabsTrigger value="all">All ({messages.length})</TabsTrigger>
          <TabsTrigger value="images">Images ({images.length})</TabsTrigger>
          <TabsTrigger value="review">
            <Flag className="size-3.5 mr-1" />
            Review ({reviews.length})
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {searchResults !== null && (
        <p className="text-sm text-muted-foreground animate-fade-in-up">
          Found {searchResults.length} result
          {searchResults.length !== 1 ? "s" : ""}
        </p>
      )}

      {viewTab === "all" && (
        <MessageFeed
          messages={displayMessages}
          searchResult={searchResults !== null}
          loading={loading}
          hasMore={hasMore && searchResults === null}
          loadingMore={loadingMore}
          onLoadMore={loadMore}
          onMessageClick={openDetail}
          onReanalyze={handleReanalyze}
        />
      )}

      {viewTab === "images" && (
        <ImageGrid images={images} onImageClick={(id) => openDetail(id)} />
      )}

      {viewTab === "review" && (
        <ReviewFeed
          messages={reviews}
          onMessageClick={openDetail}
          onReanalyze={handleReanalyze}
        />
      )}

      {/* Detail dialog */}
      <Dialog
        open={detailMessage !== null}
        onOpenChange={(o) => !o && closeDetail()}
      >
        <DialogContent className="sm:max-w-2xl max-h-[85vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquare className="size-4" />
              Message Detail
            </DialogTitle>
          </DialogHeader>
          <ScrollArea className="max-h-[70vh] pr-1">
            <MessageDetail
              message={detailMessage}
              attachments={detailAttachments}
              loading={detailLoading}
            />
          </ScrollArea>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ── Feed Sub-components ─────────────────────────

function MessageFeed({
  messages,
  searchResult,
  loading,
  hasMore,
  loadingMore,
  onLoadMore,
  onMessageClick,
  onReanalyze,
}: {
  messages: MessageRecord[];
  searchResult: boolean;
  loading: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  onMessageClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  if (loading) return <LoadingSkeleton count={8} height="h-28" />;

  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Search className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          {searchResult
            ? "No messages found matching your search."
            : "No captures yet."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in-up">
      {messages.map((msg) => (
        <MessageCard
          key={msg.id}
          message={msg}
          onClick={onMessageClick}
          onReanalyze={onReanalyze}
        />
      ))}

      {hasMore && (
        <div className="flex justify-center py-6">
          <Button variant="outline" onClick={onLoadMore} disabled={loadingMore}>
            {loadingMore && <Loader2 className="size-4 animate-spin mr-2" />}
            {loadingMore ? "Loading…" : "Load more"}
          </Button>
        </div>
      )}
    </div>
  );
}

function ImageGrid({
  images,
  onImageClick,
}: {
  images: MessageRecord[];
  onImageClick: (id: string) => void;
}) {
  if (images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">No images yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in-up">
      {images.map((msg) => (
        <ImageCard key={msg.id} message={msg} onClick={onImageClick} />
      ))}
    </div>
  );
}

function ImageCard({
  message: msg,
  onClick,
}: {
  message: MessageRecord;
  onClick: (id: string) => void;
}) {
  const imageUrl = useMemo(() => extractImageUrl(msg.metadata), [msg.metadata]);

  return (
    <Card
      className="group relative overflow-hidden cursor-pointer"
      onClick={() => onClick(msg.id)}
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
}

function ReviewFeed({
  messages,
  onMessageClick,
  onReanalyze,
}: {
  messages: MessageRecord[];
  onMessageClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  if (messages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Flag className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No flagged messages to review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in-up">
      {messages.map((msg) => (
        <MessageCard
          key={msg.id}
          message={msg}
          onClick={onMessageClick}
          onReanalyze={onReanalyze}
        />
      ))}
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
  const severityBorder = (
    {
      low: "border-l-sky-400",
      medium: "border-l-yellow-400",
      high: "border-l-orange-400",
      critical: "border-l-red-500",
    } as Record<string, string>
  )[msg.ai_severity ?? ""];
  const hasSeverity = !!severityBorder;

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:bg-accent/5 hover:shadow-sm",
        hasSeverity && "border-l-2",
        hasSeverity && severityBorder,
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
              <AiBadge status={msg.ai_status} />
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
              <RefreshCw className="size-3 mr-1" />
              Reanalyze
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function AiBadge({ status }: { status?: string | null }) {
  const colors: Record<string, string> = {
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

  if (!status || !colors[status]) return null;

  return (
    <Badge
      variant="outline"
      className={cn("text-[10px] px-1.5 py-0 h-4 font-medium", colors[status])}
    >
      {status}
    </Badge>
  );
}

// ── Message Detail ──────────────────────────────

function MessageDetail({
  message,
  attachments,
  loading,
}: {
  message: MessageRecord | null;
  attachments: {
    id: string;
    filename: string;
    type: string;
    size: number;
    uploaded_url?: string | null;
    discord_url?: string | null;
  }[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!message) return null;

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
            {safeParseJsonArray(message.ai_moderation_flags).map((flag) => (
              <Badge key={flag} variant="destructive" className="text-[11px]">
                {flag}
              </Badge>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {message.ai_status && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Status</p>
              <p className="text-sm font-medium mt-0.5 capitalize">
                {message.ai_status}
              </p>
            </CardContent>
          </Card>
        )}
        {message.ai_severity && message.ai_severity !== "none" && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Severity</p>
              <p className="text-sm font-medium mt-0.5 text-destructive capitalize">
                {message.ai_severity}
              </p>
            </CardContent>
          </Card>
        )}
        {message.ai_confidence != null && (
          <Card>
            <CardContent className="p-3">
              <p className="text-xs text-muted-foreground">Confidence</p>
              <p className="text-sm font-medium mt-0.5 tabular-nums">
                {(message.ai_confidence * 100).toFixed(0)}%
              </p>
            </CardContent>
          </Card>
        )}
        {message.ai_recommended_action &&
          message.ai_recommended_action !== "none" && (
            <Card>
              <CardContent className="p-3">
                <p className="text-xs text-muted-foreground">Action</p>
                <p className="text-sm font-medium mt-0.5 capitalize">
                  {message.ai_recommended_action}
                </p>
              </CardContent>
            </Card>
          )}
      </div>

      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((att) => (
              <a
                key={att.id}
                href={att.uploaded_url ?? att.discord_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border/50 p-2 hover:bg-muted transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{att.filename}</p>
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
    </div>
  );
}

// ── Helpers ─────────────────────────────────────

function extractImageUrl(metadata: string | null | undefined): string | null {
  if (!metadata) return null;
  try {
    const meta = JSON.parse(metadata);
    const attachments: Array<{ url: string; contentType?: string }> =
      meta.attachments ?? [];
    const img = attachments.find((a) => a.contentType?.startsWith("image/"));
    return img?.url ?? null;
  } catch {
    return null;
  }
}

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
