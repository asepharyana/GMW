import { useCallback, useEffect, useState } from "react";

import { messagesApi, voiceApi } from "@/lib/api";
import type { AttachmentRecord, Channel, MessageRecord } from "@/lib/types";
import type { WsEventType } from "@/lib/ws/types";

type WsHook = {
  on: <E extends WsEventType>(
    eventType: E,
    handler: (data: unknown) => void,
  ) => () => void;
};

// ── Messages list ───────────────────────────────

interface UseMessagesReturn {
  messages: MessageRecord[];
  loading: boolean;
  loadingMore: boolean;
  error: string | null;
  hasMore: boolean;
  refetch: () => void;
  loadMore: () => void;
  prepend: (msg: MessageRecord) => void;
  update: (msg: MessageRecord) => void;
  remove: (id: string) => void;
}

export function useMessages(
  guildId: string,
  channelId?: string,
): UseMessagesReturn {
  const [messages, setMessages] = useState<MessageRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);

  const fetch = useCallback(async () => {
    if (!guildId) return;
    setLoading(true);
    setError(null);
    try {
      const result = await messagesApi.list(
        guildId,
        50,
        channelId || undefined,
      );
      setMessages(result.data);
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load messages");
    } finally {
      setLoading(false);
    }
  }, [guildId, channelId]);

  const loadMore = useCallback(async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const result = await messagesApi.list(
        guildId,
        50,
        channelId || undefined,
        cursor,
      );
      setMessages((prev) => [...prev, ...result.data]);
      setCursor(result.nextCursor);
      setHasMore(result.nextCursor !== null);
    } catch (err) {
      console.error("useMessages/loadMore:", err);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, loadingMore, guildId, channelId]);

  // Auto-fetch when guildId/channelId changes
  useEffect(() => {
    fetch();
  }, [fetch]);

  const prepend = useCallback((msg: MessageRecord) => {
    setMessages((prev) => [msg, ...prev]);
  }, []);

  const update = useCallback((msg: MessageRecord) => {
    setMessages((prev) => prev.map((m) => (m.id === msg.id ? msg : m)));
  }, []);

  const remove = useCallback((id: string) => {
    setMessages((prev) => prev.filter((m) => m.id !== id));
  }, []);

  return {
    messages,
    loading,
    loadingMore,
    error,
    hasMore,
    refetch: fetch,
    loadMore,
    prepend,
    update,
    remove,
  };
}

// ── Channels list ───────────────────────────────

interface UseTextChannelsReturn {
  channels: Channel[];
  loading: boolean;
}

export function useTextChannels(guildId: string): UseTextChannelsReturn {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!guildId) return;
    voiceApi
      .getTextChannels(guildId)
      .then(setChannels)
      .catch((err) => console.error("useTextChannels:", err))
      .finally(() => setLoading(false));
  }, [guildId]);

  return { channels, loading };
}

// ── Search ──────────────────────────────────────

interface UseSearchReturn {
  results: MessageRecord[] | null;
  searching: boolean;
  search: (query: string) => void;
}

export function useSearch(): UseSearchReturn {
  const [results, setResults] = useState<MessageRecord[] | null>(null);
  const [searching, setSearching] = useState(false);

  const search = useCallback(async (query: string) => {
    if (!query.trim()) {
      setResults(null);
      return;
    }
    setSearching(true);
    try {
      const result = await messagesApi.search(query, 50);
      setResults(result.results);
    } catch (err) {
      console.error("useSearch:", err);
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, []);

  return { results, searching, search };
}

// ── Images ──────────────────────────────────────

export function useImages(guildId: string) {
  const [images, setImages] = useState<MessageRecord[]>([]);

  const fetch = useCallback(async () => {
    if (!guildId) return;
    try {
      const result = await messagesApi.getImages(guildId, 50);
      setImages(result.data);
    } catch (err) {
      console.error("useImages:", err);
    }
  }, [guildId]);

  return { images, refetch: fetch };
}

// ── Review ──────────────────────────────────────

export function useReview(channelId?: string) {
  const [reviews, setReviews] = useState<MessageRecord[]>([]);

  const fetch = useCallback(async () => {
    try {
      const result = await messagesApi.getReview(50, channelId || undefined);
      setReviews(result.results);
    } catch (err) {
      console.error("useReview:", err);
    }
  }, [channelId]);

  return { reviews, refetch: fetch };
}

// ── Detail ──────────────────────────────────────

interface UseMessageDetailReturn {
  message: MessageRecord | null;
  attachments: AttachmentRecord[];
  loading: boolean;
  open: (id: string) => void;
  close: () => void;
}

export function useMessageDetail(): UseMessageDetailReturn {
  const [message, setMessage] = useState<MessageRecord | null>(null);
  const [attachments, setAttachments] = useState<AttachmentRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const open = useCallback(async (id: string) => {
    setLoading(true);
    setAttachments([]);
    try {
      const detail = await messagesApi.getDetail(id);
      setMessage(detail);
      if (detail.channel_id && id) {
        messagesApi
          .getAttachments(detail.channel_id, 10)
          .then((res) => setAttachments(res.data))
          .catch((err) => console.error("useMessageDetail/attachments:", err));
      }
    } catch (err) {
      console.error("useMessageDetail:", err);
      setMessage(null);
    } finally {
      setLoading(false);
    }
  }, []);

  const close = useCallback(() => setMessage(null), []);

  return { message, attachments, loading, open, close };
}

// ── WS Subscription helper ──────────────────────

export function useMessageWsSubscription(
  ws: WsHook | undefined,
  guildId: string,
  onCreated: (msg: MessageRecord) => void,
  onUpdated: (msg: MessageRecord) => void,
  onDeleted: (id: string) => void,
  onAnalyzed: (msg: MessageRecord) => void,
) {
  useEffect(() => {
    if (!ws || !guildId) return;
    const unsub1 = ws.on("message_created", (data) =>
      onCreated(data as MessageRecord),
    );
    const unsub2 = ws.on("message_updated", (data) =>
      onUpdated(data as MessageRecord),
    );
    const unsub3 = ws.on("message_deleted", (data) =>
      onDeleted(data as unknown as string),
    );
    const unsub4 = ws.on("message_analyzed", (data) =>
      onAnalyzed(data as MessageRecord),
    );
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [ws, guildId, onCreated, onUpdated, onDeleted, onAnalyzed]);
}
