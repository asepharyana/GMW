"use client";

import { useQuery } from "@tanstack/react-query";
import { Flag, Loader2, MessageSquare, RefreshCw, Search } from "lucide-react";
import { useCallback, useState } from "react";
import { ImagesGrid } from "@/components/messages/images-grid";
import { MessageCard } from "@/components/messages/message-card";
import { MessageDetailView } from "@/components/messages/message-detail-view";
import { ReviewList } from "@/components/messages/review-list";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { GuildSelector } from "@/components/shared/guild-selector";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import type { MessageRecord } from "@/lib/types";
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
  const { data: cursorData } = useMessagesHasMore(
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

  // Search query (manual trigger)
  const [searchEnabled, setSearchEnabled] = useState(false);
  const { data: searchResults } = useQuery<
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
            onValueChange={(v) => setSelectedChannel(v ?? "")}
          >
            <SelectTrigger className="h-9 w-full sm:w-44">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All channels</SelectItem>
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
        <ImagesGrid images={images ?? []} onSelect={setDetailId} />
      )}

      {/* ── REVIEW tab ── */}
      {viewTab === "review" && (
        <ReviewList
          reviews={reviews ?? []}
          onSelect={setDetailId}
          onReanalyze={(id) => reanalyzeMut.mutate(id)}
        />
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
              <MessageDetailView
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
