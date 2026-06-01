import { useCallback, useRef, useState } from "react";
import type { MessageRecord } from "../../../shared/api/client";
import { listMessages, reanalyzeMessage } from "../../../shared/api/client";

const PAGE_SIZE = 100;

export function mergeMessages(
  current: MessageRecord[],
  incoming: MessageRecord[],
): MessageRecord[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, { ...byId.get(message.id), ...message });
  }
  // Removed .slice(0, 200) cap — let the message list grow unbounded.
  // Infinite scroll handles the data volume via cursor pagination.
  return Array.from(byId.values()).sort(
    (a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id),
  );
}

export function useMessages() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const currentChannel = useRef<string | null>(null);

  const fetchMessages = useCallback(async (channelId?: string) => {
    if (!channelId) {
      setMessages([]);
      setCursor(null);
      setHasMore(false);
      return [];
    }
    currentChannel.current = channelId;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        channelId,
      });
      const result = await listMessages(params);
      // Only update state if we're still on the same channel (avoid race conditions)
      if (currentChannel.current === channelId) {
        setMessages(result.data);
        setCursor(result.nextCursor);
        setHasMore(!!result.nextCursor);
      }
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || !currentChannel.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        channelId: currentChannel.current,
        cursor,
      });
      const result = await listMessages(params);
      // Only update if still on the same channel
      if (
        currentChannel.current === result.data[0]?.channel_id ||
        currentChannel.current
      ) {
        setMessages((prev) => [...prev, ...result.data]);
        setCursor(result.nextCursor);
        setHasMore(!!result.nextCursor);
      }
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  // BUG 5 FIX: reanalyze returns Promise<void> so callers can await it
  const reanalyze = useCallback(async (id: string): Promise<void> => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? {
              ...message,
              ai_status: "pending" as const,
              ai_error: null,
              ai_analysis: null,
            }
          : message,
      ),
    );
    await reanalyzeMessage(id);
  }, []);

  return {
    messages,
    setMessages,
    loading,
    loadingMore,
    error,
    fetchMessages,
    reanalyze,
    loadMore,
    hasMore,
  };
}
