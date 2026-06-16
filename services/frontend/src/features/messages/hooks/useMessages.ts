import { useCallback, useRef, useState } from "react";
import type { MessageRecord } from "../../../entities/message/types.js";
import {
  listMessages,
  reanalyzeErrorBatch,
  reanalyzeMessage,
} from "../../../shared/api/client";
import { createLogger } from "../../../shared/lib/logger.js";

const logger = createLogger("use-messages");

const PAGE_SIZE = 100;

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

export function useMessages() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const currentGuild = useRef<string | null>(null);

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
      setMessages((prev) => [...prev, ...result.data]);
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
    // Capture prior state inside the functional updater so we don't need
    // `messages` as a useCallback dependency (avoids stale closure churn).
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
      // HTTP failed — revert the optimistic update so the UI stays truthful.
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

  const reanalyzeAllErrors = useCallback(async (): Promise<number> => {
    // Optimistically mark all error messages as pending
    setMessages((prev) =>
      prev.map((message) =>
        message.ai_status === "error"
          ? {
              ...message,
              ai_status: "pending" as const,
              ai_error: null,
              ai_analysis: null,
            }
          : message,
      ),
    );
    try {
      const { count } = await reanalyzeErrorBatch({
        guildId: currentGuild.current ?? undefined,
      });
      logger.info("Reanalyze all errors complete", { count });
      return count;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error("Failed to reanalyze error batch", { error: message });
      throw err;
    }
  }, []);

  return {
    messages,
    setMessages,
    loading,
    loadingMore,
    error,
    fetchMessages,
    reanalyze,
    reanalyzeAllErrors,
    loadMore,
    hasMore,
  };
}
