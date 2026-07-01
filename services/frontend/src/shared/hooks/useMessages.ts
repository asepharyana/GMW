import type { MessageRecord } from "@bete/shared";
import { useCallback, useRef, useState } from "react";
import { useMessageStore } from "../../stores/message-store.js";
import { listMessages, reanalyzeMessage } from "../api/client.js";
import { createLogger } from "../lib/logger.js";

const logger = createLogger("use-messages");

const PAGE_SIZE = 100;

/**
 * Merge two message arrays, deduplicating by id and sorting by created_at desc.
 * Later entries overwrite earlier ones for the same id (useful for WS updates).
 */
export function mergeMessages(
  current: MessageRecord[],
  incoming: MessageRecord[],
): MessageRecord[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, { ...byId.get(message.id), ...message });
  }
  return Array.from(byId.values()).sort(
    (a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id),
  );
}

/**
 * Hook for fetching, paginating, and re-analyzing messages.
 * Reads/writes through the zustand `useMessageStore` so that WebSocket updates
 * (handled by the store directly via prependMessage/updateMessage/removeMessage)
 * are reflected without duplicating state.
 */
export function useMessages() {
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const currentGuild = useRef<string | null>(null);
  const { messages, setMessages } = useMessageStore();

  const fetchMessages = useCallback(async (guildId?: string) => {
    if (!guildId) {
      setMessages([]);
      setCursor(null);
      setHasMore(false);
      return [];
    }
    currentGuild.current = guildId;
    setLoading(true);
    setError(null);
    try {
      const result = await listMessages({
        guildId,
        limit: PAGE_SIZE,
      });
      // Guard against stale responses if guildId changed mid-flight
      if (currentGuild.current === guildId) {
        setMessages(result.data);
        setCursor(result.nextCursor);
        setHasMore(!!result.nextCursor);
      }
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      logger.error("Failed to fetch messages", { guildId, error: message });
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    if (!cursor || !currentGuild.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await listMessages({
        guildId: currentGuild.current,
        cursor,
        limit: PAGE_SIZE,
      });
      setMessages((prev) => mergeMessages(prev, result.data));
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Failed to load more messages", { error: message });
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

  const reanalyze = useCallback(async (id: string): Promise<void> => {
    // Snapshot the current state so we can revert on HTTP failure
    let saved: MessageRecord | undefined;

    setMessages((prev) => {
      saved = prev.find((m) => m.id === id);
      return prev.map((message) =>
        message.id === id
          ? {
              ...message,
              ai_status: "pending" as const,
              ai_error: null,
              ai_analysis: null,
            }
          : message,
      );
    });

    try {
      await reanalyzeMessage(id);
    } catch (err) {
      // Revert optimistic update on failure
      if (saved) {
        const snapshot = saved;
        setMessages((prev) =>
          prev.map((message) => (message.id === id ? snapshot : message)),
        );
      }
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Failed to reanalyze message", { id, error: message });
      throw err;
    }
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    error,
    fetchMessages,
    reanalyze,
    loadMore,
    hasMore,
  };
}
