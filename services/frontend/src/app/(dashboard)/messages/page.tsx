"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, Flag, Image, Loader2, RefreshCw } from "lucide-react";
import { MessageList } from "@/components/messages/message-list";
import { MessageDetail } from "@/components/messages/message-detail";
import { SearchOverlay } from "@/components/messages/search-overlay";
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
  useGuilds,
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
import { useWebSocket } from "@/lib/ws/context";
import { GuildSelector } from "@/components/shared/guild-selector";
import { cn } from "@/lib/utils";

type MessagesTab = "all" | "images" | "review";

export default function MessagesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [guildId, setGuildId] = useState(searchParams.get("guild") || "");
  const [selectedChannel, setSelectedChannel] = useState(searchParams.get("channel") || "");
  const [detailId, setDetailId] = useState<string | null>(searchParams.get("selected"));
  const [tab, setTab] = useState<MessagesTab>((searchParams.get("tab") as MessagesTab) || "all");
  const [searchOpen, setSearchOpen] = useState(false);

  const ws = useWebSocket();
  const { data: channels = [] } = useTextChannels(guildId);
  const { data: messages, isLoading, error, refetch } = useMessages(guildId, selectedChannel || undefined);
  const { data: cursorData } = useMessagesHasMore(guildId, selectedChannel || undefined);
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

  // Sync to URL
  useEffect(() => {
    const params = new URLSearchParams();
    if (guildId) params.set("guild", guildId);
    if (selectedChannel) params.set("channel", selectedChannel);
    if (detailId) params.set("selected", detailId);
    if (tab !== "all") params.set("tab", tab);
    router.replace(`/messages?${params.toString()}`, { scroll: false });
  }, [guildId, selectedChannel, detailId, tab, router]);

  // Global Cmd+K
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

  const subNavTabs = [
    { id: "all", label: "All" },
    { id: "images", label: "Images", icon: <Image className="size-3" /> },
    { id: "review", label: "Review", icon: <Flag className="size-3" /> },
  ];

  const currentMessages = messages ?? [];

  return (
    <div className="animate-fade-in-up space-y-4">
      {/* Controls bar */}
      <div className="flex items-center gap-3">
        <GuildSelector value={guildId} onChange={(g) => { setGuildId(g ?? ""); setSelectedChannel(""); }} />
        {channels.length > 0 && (
          <Select value={selectedChannel} onValueChange={(v) => setSelectedChannel(v ?? "")}>
            <SelectTrigger className="h-8 w-40 glass border-glass-border text-xs">
              <SelectValue placeholder="All channels" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All channels</SelectItem>
              {channels.map((ch: any) => (
                <SelectItem key={ch.id} value={ch.id}># {ch.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs text-text-secondary/60 hover:text-text-primary glass hover:glass-elevated transition-all ml-auto"
        >
          <Search className="size-3.5" />
          Search
          <span className="text-[10px] text-text-secondary/30 font-mono hidden sm:inline">⌘K</span>
        </button>
        <Button variant="outline" size="sm" onClick={() => reanalyzeBatchMut.mutate(guildId)} className="h-8 text-xs">
          <RefreshCw className="size-3 mr-1" /> Reanalyze
        </Button>
      </div>

      <SubNav tabs={subNavTabs} activeTab={tab} onTabChange={(t) => setTab(t as MessagesTab)} />

      {/* Split pane */}
      {error ? (
        <ErrorState message={error.message} onRetry={refetch} />
      ) : isLoading ? (
        <LoadingSkeleton count={6} height="h-20" />
      ) : (
        <div className="flex gap-4">
          {/* Left pane — message list */}
          <div className={cn("space-y-2", detailId ? "w-1/2 lg:w-2/5" : "w-full")}>
            {tab === "all" && (
              <>
                <MessageList messages={currentMessages} selectedId={detailId} onSelect={setDetailId} />
                {cursorData?.hasMore && (
                  <div className="flex justify-center py-4">
                    <Button variant="outline" size="sm" onClick={handleLoadMore} disabled={loadMoreMut.isPending} className="text-xs glass">
                      {loadMoreMut.isPending && <Loader2 className="size-3 animate-spin mr-1" />}
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )}
            {tab === "images" && (
              <ImageGrid items={images ?? []} onSelect={setDetailId} />
            )}
            {tab === "review" && (
              <ReviewList items={reviews ?? []} onSelect={setDetailId} onReanalyze={(id: string) => reanalyzeMut.mutate(id)} />
            )}
          </div>

          {/* Right pane — detail */}
          {detailId && (
            <div className="hidden md:block w-1/2 lg:w-3/5 sticky top-16 self-start">
              {detailLoading ? (
                <GlassPanel dense className="flex items-center justify-center py-12">
                  <Loader2 className="size-5 animate-spin text-text-secondary/60" />
                </GlassPanel>
              ) : detailMessage ? (
                <MessageDetail
                  message={detailMessage}
                  attachments={detailAttachments}
                  onBack={() => setDetailId(null)}
                />
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* Search overlay */}
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} onSelect={setDetailId} />
    </div>
  );
}

// Inline ImageGrid and ReviewList
function ImageGrid({ items, onSelect }: { items: any[]; onSelect: (id: string) => void }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items.map((item: any) => (
        <button key={item.id} type="button" onClick={() => onSelect(item.message_id)} className="glass rounded-lg overflow-hidden hover:scale-[1.02] transition-transform">
          <img src={item.uploaded_url || item.discord_url} alt="" className="w-full h-24 object-cover" loading="lazy" />
        </button>
      ))}
      {items.length === 0 && (
        <div className="col-span-3 py-12 text-center text-xs text-text-secondary/40">No images</div>
      )}
    </div>
  );
}

function ReviewList({ items, onSelect, onReanalyze }: { items: any[]; onSelect: (id: string) => void; onReanalyze: (id: string) => void }) {
  return (
    <div className="space-y-2">
      {items.map((item: any) => (
        <GlassCard key={item.id} variant="danger" className="p-3 cursor-pointer" onClick={() => onSelect(item.message_id)}>
          <div className="flex items-start gap-2">
            <Flag className="size-3.5 text-accent-purple mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-xs text-text-secondary line-clamp-2">{item.content || item.id}</p>
            </div>
          </div>
        </GlassCard>
      ))}
      {items.length === 0 && (
        <div className="py-12 text-center text-xs text-text-secondary/40">No flagged messages</div>
      )}
    </div>
  );
}
