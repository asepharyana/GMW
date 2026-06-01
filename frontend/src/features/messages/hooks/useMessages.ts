import { useCallback, useState } from "react";
import { listMessages, reanalyzeMessage } from "../../../shared/api/client";
import type { MessageRecord } from "../../../shared/api/client";

export function mergeMessages(current: MessageRecord[], incoming: MessageRecord[]): MessageRecord[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) {
    byId.set(message.id, { ...byId.get(message.id), ...message });
  }
  return Array.from(byId.values())
    .sort((a, b) => b.created_at - a.created_at || b.id.localeCompare(a.id))
    .slice(0, 200);
}

export function useMessages() {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchMessages = useCallback(async (channelId?: string) => {
    if (!channelId) {
      setMessages([]);
      return [];
    }
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: "80" });
      params.set("channel", channelId);
      const result = await listMessages(params);
      setMessages(result.data);
      return result.data;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      throw err;
    } finally {
      setLoading(false);
    }
  }, []);

  // BUG 5 FIX: reanalyze returns Promise<void> so callers can await it
  const reanalyze = useCallback(async (id: string): Promise<void> => {
    setMessages((prev) =>
      prev.map((message) =>
        message.id === id
          ? { ...message, ai_status: "pending" as const, ai_error: null, ai_analysis: null }
          : message,
      ),
    );
    await reanalyzeMessage(id);
  }, []);

  return { messages, setMessages, loading, error, fetchMessages, reanalyze };
}
