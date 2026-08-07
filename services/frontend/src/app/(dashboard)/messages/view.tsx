"use client";

import { Flag, Image, Loader2, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { GlassCard } from "@/components/glass/card";
import { GlassPanel } from "@/components/glass/panel";
import { SubNav } from "@/components/layout/sub-nav";
import { Lightbox } from "@/components/messages/lightbox";
import { extractFirstImage } from "@/components/messages/message-card";
import { MessageDetailView } from "@/components/messages/message-detail-view";
import { MessageList } from "@/components/messages/message-list";
import { SearchOverlay } from "@/components/messages/search-overlay";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared";
import { GuildSelector } from "@/components/shared/guild-selector";
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
  useReview,
  useTextChannels,
} from "@/hooks";
import { renderMessageContent } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWebSocket } from "@/lib/ws/context";

type MessagesTab = "all" | "images" | "review";

interface MessagesViewProps {
  initialGuild?: string;
  initialChannel?: string;
  initialDetailId?: string | null;
  initialTab?: MessagesTab;
  initialMessagePage?: { data: MessageRecord[]; nextCursor: string | null };
}

/**
 * Messages view — hydrated on the client. Initial guild/channel/detail/tab
 * come from the URL (server-read on first SSR), and the first message page is
 * seeded from the server when a guild is already selected.
 */
export default function MessagesView({
  initialGuild = "",
  initialChannel = "",
  initialDetailId = null,
  initialTab = "all",
  initialMessagePage,
}: MessagesViewProps) {
  const router = useRouter();
  const [guildId, setGuildId] = useState(initialGuild);
  const [selectedChannel, setSelectedChannel] = useState(initialChannel);
  const [detailId, setDetailId] = useState<string | null>(initialDetailId);
  const [tab, setTab] = useState<MessagesTab>(initialTab);
  const [searchOpen, setSearchOpen] = useState(false);
  const [lightbox, setLightbox] = useState<{
    images: Array<{ src: string; alt?: string }>;
    index: number;
  } | null>(null);

  const ws = useWebSocket();
  const { data: channels = [] } = useTextChannels(guildId);
  const {
    data: messages,
    error,
    refetch,
  } = useMessages(
    guildId,
    selectedChannel || undefined,
    guildId === initialGuild && selectedChannel === initialChannel
      ? initialMessagePage
      : undefined,
  );
  const { data: cursorData } = useMessagesHasMore(
    guildId,
    selectedChannel || undefined,
  );
  const loadMoreMut = useLoadMore();
  const { data: images } = useImages(guildId);
  const { data: reviews } = useReview(selectedChannel || undefined);

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
            <SelectTrigger className="h-9 w-48">
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
      ) : !messages ? (
        <LoadingSkeleton count={6} height="h-20" />
      ) : (
        <div className="flex gap-4">
          {/* Left pane */}
          <div
            className={cn("space-y-2", detailId ? "w-1/2 lg:w-2/5" : "w-full")}
          >
            {tab === "all" && (
              <MessageList
                messages={currentMessages}
                selectedId={detailId}
                onSelect={setDetailId}
                hasMore={cursorData?.hasMore}
                onLoadMore={handleLoadMore}
                isLoadingMore={loadMoreMut.isPending}
              />
            )}
            {tab === "images" && (
              <ImageGrid items={images ?? []} onSelect={setDetailId} />
            )}
            {tab === "review" && (
              <ReviewList items={reviews ?? []} onSelect={setDetailId} />
            )}
          </div>

          {/* Right pane — message detail */}
          {detailId && (
            <div className="sticky top-16 hidden w-1/2 self-start md:block lg:w-3/5">
              {detailLoading ? (
                <GlassPanel
                  dense
                  className="flex items-center justify-center py-12"
                >
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
                    onImageClick={(index) => {
                      const imgs = (detailAttachments ?? [])
                        .filter((a) => a.type?.startsWith("image/"))
                        .map((a) => ({
                          src: a.uploaded_url || a.discord_url,
                          alt: a.filename,
                        }));
                      if (imgs.length > 0) {
                        setLightbox({ images: imgs, index });
                      }
                    }}
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

      {/* ── Lightbox ── */}
      {lightbox && (
        <Lightbox
          images={lightbox.images}
          initialIndex={lightbox.index}
          open
          onClose={() => setLightbox(null)}
        />
      )}
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
        <EmptyState
          icon={Image}
          title="No images"
          description="Messages with image attachments will show up here."
          className="col-span-3"
        />
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
                {renderMessageContent(item.content, item.metadata) || item.id}
              </p>
            </div>
          </div>
        </GlassCard>
      ))}
      {items.length === 0 && (
        <EmptyState
          icon={Flag}
          title="No flagged messages"
          description="Messages flagged by AI moderation will appear here for review."
        />
      )}
    </div>
  );
}
