"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Flag, Image, Loader2, RefreshCw, Search } from "lucide-react";
import { MessageList } from "@/components/messages/message-list";
import { MessageDetailView } from "@/components/messages/message-detail-view";
import { SearchOverlay } from "@/components/messages/search-overlay";
import { extractFirstImage } from "@/components/messages/message-card";
import { SubNav } from "@/components/layout/sub-nav";
import { ErrorState, LoadingSkeleton } from "@/components/shared";
import { GlassCard } from "@/components/glass/card";
import { GlassPanel } from "@/components/glass/panel";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";
import { GuildSelector } from "@/components/shared/guild-selector";

type MessagesTab = "all" | "images" | "review";

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guildId, setGuildId] = useState(searchParams.get("guild") || "");
  const [selectedChannel, setSelectedChannel] = useState(
    searchParams.get("channel") || "",
  );
  const [detailId, setDetailId] = useState<string | null>(
    searchParams.get("selected"),
  );
  const [tab, setTab] = useState<MessagesTab>(
    (searchParams.get("tab") as MessagesTab) || "all",
  );
  const [searchOpen, setSearchOpen] = useState(false);

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

  const {
    message: detailMessage,
    attachments: detailAttachments,
    loading: detailLoading,
  } = useMessageDetail(detailId);

  useMessagesWsSync(ws, guildId);

  // Sync state to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (guildId) params.set("guild", guildId);
    if (selectedChannel) params.set("channel", selectedChannel);
    if (detailId) params.set("selected", detailId);
    if (tab !== "all") params.set("tab", tab);
    router.replace(`/messages?${params.toString()}`, { scroll: false });
  }, [guildId, selectedChannel, detailId, tab, router]);

  // Global Cmd+K search trigger
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, []);

  const handleLoadMore = useCallback(() => {
    if (!cursorData?.cursor || loadMoreMut.isPending) return;
    loadMoreMut.mutate({
      guildId,
      channelId: selectedChannel || undefined,
      cursor: cursorData.cursor,
    });
  }, [cursorData, loadMoreMut, guildId, selectedChannel]);

  const handleGuildChange = useCallback((g: string) => {
    setGuildId(g);
    setSelectedChannel("");
    setDetailId(null);
  }, []);

  const subNavTabs = [
    { id: "all", label: "All", icon: null },
    { id: "images", label: "Images", icon: <Image className="size-3" /> },
    { id: "review", label: "Review", icon: <Flag className="size-3" /> },
  ];

  const currentMessages = messages ?? [];

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* ── Controls bar ── */}
      <div className="flex items-center gap-3">
        <GuildSelector value={guildId} onChange={handleGuildChange} />
        {channels.length > 0 && (
          <Select
            value={selectedChannel}
            onValueChange={(v) => setSelectedChannel(v ?? "")}
          >
            <SelectTrigger className="h-8 w-40 glass border-glass-border text-xs">
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
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ml-auto flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs text-text-secondary/60 hover:text-text-primary glass hover:glass-elevated transition-all"
        >
          <Search className="size-3.5" />
          Search
          <span className="hidden font-mono text-[10px] text-text-secondary/30 sm:inline">
            &#8984;K
          </span>
        </button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => reanalyzeBatchMut.mutate(guildId)}
          className="h-8 text-xs"
        >
          <RefreshCw className="mr-1 size-3" /> Reanalyze
        </Button>
      </div>

      {/* ── Sub navigation ── */}
      <SubNav
        tabs={subNavTabs}
        activeTab={tab}
        onTabChange={(t) => setTab(t as MessagesTab)}
      />

      {/* ── Split pane ── */}
      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} height="h-20" />
      ) : (
        <div className="flex gap-4">
          {/* Left pane */}
          <div
            className={cn(
              "space-y-2",
              detailId ? "w-1/2 lg:w-2/5" : "w-full",
            )}
          >
            {tab === "all" && (
              <MessageList
                messages={currentMessages}
                selectedId={detailId}
                onSelect={setDetailId}
                onReanalyze={(id) => reanalyzeMut.mutate(id)}
                hasMore={cursorData?.hasMore}
                onLoadMore={handleLoadMore}
                isLoadingMore={loadMoreMut.isPending}
              />
            )}
            {tab === "images" && (
              <ImageGrid items={images ?? []} onSelect={setDetailId} />
            )}
            {tab === "review" && (
              <ReviewList
                items={reviews ?? []}
                onSelect={setDetailId}
              />
            )}
          </div>

          {/* Right pane — message detail */}
          {detailId && (
            <div className="sticky top-16 hidden w-1/2 self-start md:block lg:w-3/5">
              {detailLoading ? (
                <GlassPanel dense className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-text-secondary/60" />
                </GlassPanel>
              ) : detailMessage ? (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => setDetailId(null)}
                    className="text-xs text-text-secondary/60 hover:text-text-primary transition-colors"
                  >
                    &larr; Back to list
                  </button>
                  <MessageDetailView
                    message={detailMessage}
                    attachments={detailAttachments}
                  />
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ── Search overlay ── */}
      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        onSelect={(id) => {
          setDetailId(id);
          setTab("all");
        }}
      />
    </div>
  );
}

// ── Inline ImageGrid (glass-styled) ────────────────

function ImageGrid({
  items,
  onSelect,
}: {
  items: MessageRecord[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item) => {
        const imgUrl = extractFirstImage(item.metadata);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="glass overflow-hidden rounded-lg transition-transform hover:scale-[1.02]"
          >
            {imgUrl ? (
              <img
                src={imgUrl}
                alt=""
                className="h-24 w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center text-xs text-text-secondary/40">
                No image
              </div>
            )}
          </button>
        );
      })}
      {items.length === 0 && (
        <div className="col-span-3 py-12 text-center text-xs text-text-secondary/40">
          No images
        </div>
      )}
    </div>
  );
}

// ── Inline ReviewList (glass-styled) ────────────────

function ReviewList({
  items,
  onSelect,
}: {
  items: MessageRecord[];
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-2">
      {items.map((item) => (
        <GlassCard
          key={item.id}
          variant="danger"
          className="cursor-pointer p-3"
          onClick={() => onSelect(item.id)}
        >
          <div className="flex items-start gap-2">
            <Flag className="mt-0.5 size-3.5 shrink-0 text-accent-purple" />
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 text-xs text-text-secondary">
                {item.content || item.id}
              </p>
            </div>
          </div>
        </GlassCard>
      ))}
      {items.length === 0 && (
        <div className="py-12 text-center text-xs text-text-secondary/40">
          No flagged messages
        </div>
      )}
    </div>
  );
}
