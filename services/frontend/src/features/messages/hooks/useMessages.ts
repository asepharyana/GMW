import { useCallback, useRef, useState } from "react";
import type { MessageRecord } from "../../../shared/api/client";
import { listMessages, reanalyzeErrorBatch, reanalyzeMessage } from "../../../shared/api/client";

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
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        guildId,
      });
      const result = await listMessages(params);
      if (currentGuild.current === guildId) {
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
    if (!cursor || !currentGuild.current || loadingMore) return;
    setLoadingMore(true);
    try {
      const params = new URLSearchParams({
        limit: String(PAGE_SIZE),
        guildId: currentGuild.current,
        cursor,
      });
      const result = await listMessages(params);
      setMessages((prev) => [...prev, ...result.data]);
      setCursor(result.nextCursor);
      setHasMore(!!result.nextCursor);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore]);

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

  const reanalyzeAllErrors = useCallback(
    async (): Promise<number> => {
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
      const { count } = await reanalyzeErrorBatch({
        guildId: currentGuild.current ?? undefined,
      });
      return count;
    },
    [],
  );

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
