import { motion } from "framer-motion";
import { useEffect, useMemo, useRef } from "react";
import type { MessageRecord } from "../../../shared/api/client";
import { cardItem, cardStagger } from "../../../shared/hooks/useFramerStagger";
import { ScrollArea } from "../../../shared/ui";
import { EmptyStateMascot } from "../../../widgets/mascot/ChibiMascot";
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

/** Messages from the same user within 5 minutes are visually grouped. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

interface MessageGroup {
  messages: MessageRecord[];
}

function groupMessages(messages: MessageRecord[]): MessageGroup[] {
  const groups: MessageGroup[] = [];
  for (const msg of messages) {
    const lastGroup = groups[groups.length - 1];
    if (
      lastGroup &&
      lastGroup.messages[0].user_id === msg.user_id &&
      lastGroup.messages[lastGroup.messages.length - 1].created_at -
        msg.created_at <
        GROUP_WINDOW_MS
    ) {
      lastGroup.messages.push(msg);
    } else {
      groups.push({ messages: [msg] });
    }
  }
  return groups;
}

export function MessageFeed({
  messages,
  onReanalyze,
  emptyText = "No messages found.",
  loading,
  onLoadMore,
  hasMore,
  loadingMore,
}: MessageFeedProps) {
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

  const groupedMessages = useMemo(() => groupMessages(messages), [messages]);

  if (loading) {
    return (
      <ScrollArea className="h-[calc(100vh-260px)] pr-3">
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <MessageCardSkeleton key={i} />
          ))}
        </div>
      </ScrollArea>
    );
  }

  if (messages.length === 0) {
    return <EmptyStateMascot variant="waving" message="No messages yet~" />;
  }

  return (
    <ScrollArea className="h-[calc(100vh-260px)] pr-3">
      <motion.div
        className="space-y-3"
        variants={cardStagger}
        initial="initial"
        animate="animate"
      >
        {groupedMessages.map((group) =>
          group.messages.map((message, idx) => {
            const isFirstInGroup = idx === 0;
            const isCompact = !isFirstInGroup;
            return (
              <motion.div key={message.id} variants={cardItem}>
                <MessageCard
                  message={message}
                  onReanalyze={onReanalyze}
                  compact={isCompact}
                />
              </motion.div>
            );
          }),
        )}

        {/* Infinite-scroll sentinel */}
        {hasMore && (
          <div
            ref={sentinelRef}
            className="flex items-center justify-center py-4"
          >
            {loadingMore ? (
              <MessageCardSkeleton />
            ) : (
              <div className="h-2 w-2 rounded-full bg-primary/40" />
            )}
          </div>
        )}
      </motion.div>
    </ScrollArea>
  );
}
