import { motion } from "framer-motion";
import { Hash } from "lucide-react";
import { useEffect, useMemo, useRef } from "react";
import { parseMetadata } from "../../../entities/message/types";
import type { MessageRecord } from "../../../shared/api/client";
import { cardItem, cardStagger } from "../../../shared/hooks/useFramerStagger";
import { ScrollArea, EmptyStateMascot } from "../../../shared/ui";
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

interface UserMessageGroup {
  messages: MessageRecord[];
}

function groupByUser(messages: MessageRecord[]): UserMessageGroup[] {
  const groups: UserMessageGroup[] = [];
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

interface ChannelSection {
  key: string;
  channelId: string;
  threadId: string | null;
  label: string;
  groups: UserMessageGroup[];
}

function computeChannelSections(messages: MessageRecord[]): ChannelSection[] {
  if (messages.length === 0) return [];

  // Group by (channel_id, thread_id)
  const map = new Map<string, MessageRecord[]>();
  for (const msg of messages) {
    const key = msg.thread_id
      ? `${msg.channel_id}:t:${msg.thread_id}`
      : msg.channel_id;
    const list = map.get(key);
    if (list) list.push(msg);
    else map.set(key, [msg]);
  }

  const sections: ChannelSection[] = [];
  for (const [key, channelMessages] of map) {
    const first = channelMessages[0];
    const meta = parseMetadata(first.metadata);
    const ch = meta?.channel;

    let label: string;
    if (ch?.threadName && ch?.channelName) {
      label = `# ${ch.channelName} › ${ch.threadName}`;
    } else if (ch?.channelName) {
      label = `# ${ch.channelName}`;
    } else if (first.thread_id) {
      label = `thread:${first.thread_id.slice(0, 8)}`;
    } else {
      label = `# ${first.channel_id.slice(0, 8)}`;
    }

    sections.push({
      key,
      channelId: first.channel_id,
      threadId: first.thread_id,
      label,
      groups: groupByUser(channelMessages),
    });
  }

  return sections;
}

export function MessageFeed({
  messages,
  onReanalyze,
  emptyText: _emptyText,
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
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [onLoadMore, hasMore]);

  const sections = useMemo(() => computeChannelSections(messages), [messages]);

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
    return <EmptyStateMascot />;
  }

  return (
    <ScrollArea className="h-[calc(100vh-260px)] pr-3">
      <motion.div
        className="space-y-3"
        variants={cardStagger}
        initial="initial"
        animate="animate"
      >
        {sections.map((section) => (
          <div key={section.key} className="space-y-2">
            {/* Channel/Thread section header */}
            <div className="sticky top-0 z-10 -mx-1 rounded-lg bg-muted/80 backdrop-blur-sm px-3 py-1.5 flex items-center gap-1.5">
              <Hash className="h-3.5 w-3.5 text-primary/60" />
              <span className="text-xs font-medium text-muted-foreground">
                {section.label}
              </span>
            </div>

            <div className="space-y-3">
              {section.groups.map((group) => (
                <motion.div key={group.messages[0].id} variants={cardItem}>
                  <MessageCard
                    messages={group.messages}
                    onReanalyze={onReanalyze}
                  />
                </motion.div>
              ))}
            </div>
          </div>
        ))}

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
