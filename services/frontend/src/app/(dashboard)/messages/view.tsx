"use client";

import { Flag, Image, Loader2, Search, Send, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { Lightbox } from "@/components/messages/lightbox";
import { MessageDetailView } from "@/components/messages/message-detail-view";
import { MessageList } from "@/components/messages/message-list";
import { SearchOverlay } from "@/components/messages/search-overlay";
import { StaggerGroup, StaggerItem } from "@/components/motion/stagger";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import { Dialog } from "@/components/primitives/dialog";
import { Input } from "@/components/primitives/input";
import { Select } from "@/components/primitives/select";
import { EmptyState, ErrorState, LoadingSkeleton } from "@/components/shared";
import { GuildSelector } from "@/components/shared/guild-selector";
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
  const { message: detailMessage, loading: detailLoading } =
    useMessageDetail(detailId);

  useMessagesWsSync(ws, guildId);

  useEffect(() => {
    const params = new URLSearchParams();
    if (guildId) params.set("guild", guildId);
    if (selectedChannel) params.set("channel", selectedChannel);
    if (detailId) params.set("selected", detailId);
    if (tab !== "all") params.set("tab", tab);
    router.replace(`/messages?${params.toString()}`, { scroll: false });
  }, [guildId, selectedChannel, detailId, tab, router]);

  // global Cmd+K
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
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

  const tabs: { id: MessagesTab; label: string; icon: React.ReactNode }[] = [
    { id: "all", label: "All", icon: null },
    { id: "images", label: "Images", icon: <Image className="size-3.5" /> },
    { id: "review", label: "Review", icon: <Flag className="size-3.5" /> },
  ];

  const currentMessages = messages ?? [];

  return (
    <div className="flex flex-col gap-4">
      {/* Controls */}
      <div className="flex items-center gap-3">
        <GuildSelector value={guildId} onChange={handleGuildChange} />
        {channels.length > 0 && (
          <Select
            value={selectedChannel}
            onChange={(e) => setSelectedChannel(e.target.value || "")}
            className="w-48"
          >
            <option value="">All channels</option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                # {ch.name}
              </option>
            ))}
          </Select>
        )}
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ms-auto flex items-center gap-1.5 rounded-[var(--radius-r-control)] px-3 py-1.5 text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
        >
          <Search className="size-3.5" />
          Search{" "}
          <span className="hidden font-mono text-[10px] sm:inline">(⌘K)</span>
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 rounded-[var(--radius-r)] bg-[var(--color-surface-2)] p-1">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={cn(
              "flex items-center gap-1.5 rounded-[var(--radius-r-control)] px-3 py-1.5 text-xs font-medium transition-colors",
              tab === t.id
                ? "bg-[var(--color-signal)] text-[var(--color-signal-ink)]"
                : "text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]",
            )}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex gap-4">
        {/* Left — timeline spine + entries */}
        <div
          className={cn("surface p-3", detailId ? "w-1/2 lg:w-2/5" : "w-full")}
        >
          {error ? (
            <ErrorState message={error.message} onRetry={refetch} />
          ) : !messages ? (
            <LoadingSkeleton count={6} />
          ) : tab === "all" ? (
            <MessageList
              messages={currentMessages}
              selectedId={detailId}
              onSelect={setDetailId}
              hasMore={cursorData?.hasMore}
              onLoadMore={handleLoadMore}
              isLoadingMore={loadMoreMut.isPending}
            />
          ) : tab === "images" ? (
            <ImageGrid items={images ?? []} onSelect={setDetailId} />
          ) : (
            <ReviewList items={reviews ?? []} onSelect={setDetailId} />
          )}
        </div>

        {/* Right — detail */}
        {detailId && (
          <div className="sticky top-16 hidden w-1/2 self-start md:block lg:w-3/5">
            <div className="surface h-full p-4">
              {detailLoading ? (
                <div className="flex h-40 items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-[var(--color-ink-soft)]" />
                </div>
              ) : detailMessage ? (
                <div className="flex flex-col gap-3">
                  <button
                    type="button"
                    onClick={() => setDetailId(null)}
                    className="text-xs text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                  >
                    ← Back to list
                  </button>
                  <MessageDetailView message={detailMessage} />
                  {detailMessage && (
                    <Lightbox
                      open={!!lightbox}
                      onClose={() => setLightbox(null)}
                      images={extractImages(detailMessage.metadata)}
                    />
                  )}
                </div>
              ) : null}
            </div>
          </div>
        )}
      </div>

      <SearchOverlay
        open={searchOpen}
        onClose={() => setSearchOpen(false)}
        results={(currentMessages ?? []).map((m) => ({
          id: m.id,
          content: m.edited_content ?? m.content,
          username: m.username ?? "unknown",
          channel: m.channel_id,
          time: m.created_at
            ? new Date(m.created_at * 1000).toLocaleTimeString()
            : "",
        }))}
        onSelect={(msg) => {
          const found = currentMessages.find((m) => m.id === msg.id);
          if (found) setDetailId(found.id);
          setTab("all");
        }}
      />

      {lightbox && (
        <Lightbox
          open={!!lightbox}
          onClose={() => setLightbox(null)}
          images={lightbox.images}
          initialIndex={lightbox.index}
        />
      )}
    </div>
  );
}

function ImageGrid({
  items,
  onSelect,
}: {
  items: MessageRecord[];
  onSelect: (id: string) => void;
}) {
  return !items.length ? (
    <EmptyState
      icon={Image}
      title="No images"
      description="Messages with image attachments will appear here."
    />
  ) : (
    <div className="grid grid-cols-3 gap-2.5">
      {items.map((item) => {
        const url = extractFirstImage(item.metadata);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item.id)}
            className="overflow-hidden rounded-[var(--radius-r)] border border-[var(--color-hairline)]"
          >
            {url ? (
              <img
                src={url}
                alt=""
                className="h-24 w-full object-cover"
                loading="lazy"
              />
            ) : (
              <div className="flex h-24 w-full items-center justify-center text-xs text-[var(--color-ink-soft)]/40">
                No image
              </div>
            )}
          </button>
        );
      })}
    </div>
  );
}

function ReviewList({
  items,
  onSelect,
}: {
  items: MessageRecord[];
  onSelect: (id: string) => void;
}) {
  return !items.length ? (
    <EmptyState
      icon={Flag}
      title="No flagged messages"
      description="Review-flagged messages will appear here."
    />
  ) : (
    <StaggerGroup className="space-y-2">
      {items.map((item) => (
        <StaggerItem key={item.id} className="surface p-3">
          <button
            type="button"
            onClick={() => onSelect(item.id)}
            className="flex items-start gap-2 w-full text-left"
          >
            <Flag className="mt-0.5 size-3.5 shrink-0 text-[var(--color-vermilion)]" />
            <p className="line-clamp-2 text-xs text-[var(--color-ink-soft)]">
              {renderMessageContent(item.content, item.metadata) || item.id}
            </p>
          </button>
        </StaggerItem>
      ))}
    </StaggerGroup>
  );
}

function extractFirstImage(metadata?: string | null): string | null {
  try {
    if (!metadata) return null;
    const m = JSON.parse(metadata);
    const atts = m?.attachments ?? [];
    const img = atts.find(
      (a: {
        contentType?: string | null;
        url?: string;
        discord_url?: string;
      }) => /image/i.test(a.contentType ?? ""),
    );
    return img?.url ?? img?.discord_url ?? null;
  } catch {
    return null;
  }
}

function extractImages(metadata?: string | null) {
  try {
    if (!metadata) return [];
    const m = JSON.parse(metadata);
    return (m?.attachments ?? [])
      .filter((a: { contentType?: string | null }) =>
        /image/i.test(a.contentType ?? ""),
      )
      .map((a: { url?: string; discord_url?: string; name?: string }) => ({
        src: a.url ?? a.discord_url ?? "",
        alt: a.name,
      }));
  } catch {
    return [];
  }
}
