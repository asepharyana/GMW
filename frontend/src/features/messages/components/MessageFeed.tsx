import { useEffect, useRef } from "react";
import { ScrollArea } from "../../../shared/ui";
import type { MessageRecord } from "../../../shared/api/client";
import { MessageCard, MessageCardSkeleton } from "./MessageCard";

export interface MessageFeedProps {
  messages: MessageRecord[];
  onReanalyze: (id: string) => Promise<void>;
  emptyText?: string;
  loading?: boolean;
  onLoadMore?: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
}

export function MessageFeed({ messages, onReanalyze, emptyText = "No messages found.", loading, onLoadMore, hasMore, loadingMore }: MessageFeedProps) {
  // IntersectionObserver for infinite scroll — fires when sentinel becomes visible
  const sentinelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!onLoadMore || !hasMore) return;
    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) onLoadMore();
      },
      { rootMargin: "400px" }, // preload before user reaches bottom
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  if (loading) {
    return (
      <ScrollArea className="h-[calc(100vh-260px)] pr-3">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => <MessageCardSkeleton key={i} />)}
        </div>
      </ScrollArea>
    );
  }

  if (messages.length === 0) {
    return <div className="rounded-2xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">{emptyText}</div>;
  }

  return (
    <ScrollArea className="h-[calc(100vh-260px)] pr-3">
      <div className="space-y-3">
        {messages.map((message) => (
          <MessageCard key={message.id} message={message} onReanalyze={onReanalyze} />
        ))}

        {/* Infinite-scroll sentinel */}
        {hasMore && (
          <div ref={sentinelRef} className="flex items-center justify-center py-4">
            {loadingMore ? (
              <MessageCardSkeleton />
            ) : (
              <div className="h-2 w-2 rounded-full bg-muted-foreground/40" />
            )}
          </div>
        )}
      </div>
    </ScrollArea>
  );
}
