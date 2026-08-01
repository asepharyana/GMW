import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { messagesApi, voiceApi } from "@/lib/api";
import type { AttachmentRecord, Channel, MessageRecord } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

// ── Query keys factory ───────────────────────────

const msgKeys = {
  list: (guildId: string, channelId?: string) =>
    ["messages", guildId, channelId ?? "__all__"] as const,
  images: (guildId: string) => ["messages-images", guildId] as const,
  review: (channelId?: string) =>
    ["messages-review", channelId ?? "__all__"] as const,
  detail: (id: string) => ["message-detail", id] as const,
  search: (query: string) => ["messages-search", query] as const,
};

type MessagePage = { data: MessageRecord[]; nextCursor: string | null };

/**
 * Single source of truth for the paginated message list. Both useMessages and
 * useMessagesHasMore derive from this one SWR key, so the cursor probe no
 * longer triggers a duplicate API call.
 */
function useMessagesPage(guildId: string, channelId?: string) {
  const key = guildId ? msgKeys.list(guildId, channelId) : null;
  return useSWR<MessagePage>(key, () =>
    messagesApi.list(guildId, 50, channelId || undefined),
  );
}

// ── Messages list (paginated, cursor-based) ──────

export function useMessages(guildId: string, channelId?: string) {
  const page = useMessagesPage(guildId, channelId);
  return {
    ...page,
    data: page.data?.data,
    refetch: () => page.mutate(),
  };
}

export function useMessagesHasMore(guildId: string, channelId?: string) {
  const page = useMessagesPage(guildId, channelId);
  return {
    data: {
      cursor: page.data?.nextCursor ?? null,
      hasMore: page.data ? page.data.nextCursor !== null : undefined,
    },
  };
}

export function useLoadMore() {
  const { mutate } = useSWRConfig();
  return useAction(
    async ({
      guildId,
      channelId,
      cursor,
    }: {
      guildId: string;
      channelId?: string;
      cursor: string;
    }) => {
      const result = await messagesApi.list(
        guildId,
        50,
        channelId || undefined,
        cursor,
      );
      const key = msgKeys.list(guildId, channelId);
      await mutate(
        key,
        (old: MessagePage | undefined): MessagePage | undefined =>
          old
            ? {
                data: [...old.data, ...result.data],
                nextCursor: result.nextCursor,
              }
            : result,
        { revalidate: false },
      );
      return result;
    },
  );
}

// ── Channels list ────────────────────────────────

export function useTextChannels(guildId: string) {
  return useSWR<Channel[]>(guildId ? ["text-channels", guildId] : null, () =>
    voiceApi.getTextChannels(guildId),
  );
}

// ── Images ───────────────────────────────────────

export function useImages(guildId: string) {
  return useSWR<MessageRecord[]>(
    guildId ? msgKeys.images(guildId) : null,
    async () => {
      const result = await messagesApi.getImages(guildId, 50);
      return result.data;
    },
  );
}

// ── Review ───────────────────────────────────────

export function useReview(channelId?: string) {
  return useSWR<MessageRecord[]>(
    msgKeys.review(channelId),
    async () => {
      const result = await messagesApi.getReview(50, channelId || undefined);
      return result.results;
    },
    {
      refreshInterval: 15_000,
    },
  );
}

// ── Detail ───────────────────────────────────────

export function useMessageDetail(id: string | null) {
  const detail = useSWR<MessageRecord>(id ? msgKeys.detail(id) : null, () =>
    messagesApi.getDetail(id!),
  );
  const attachments = useSWR<AttachmentRecord[]>(
    id && detail.data?.channel_id
      ? [...msgKeys.detail(id), "attachments"]
      : null,
    async () => {
      const res = await messagesApi.getAttachments(detail.data!.channel_id, 10);
      return res.data;
    },
  );
  return {
    message: detail.data ?? null,
    attachments: attachments.data ?? [],
    loading: detail.isLoading || attachments.isLoading,
    error: detail.error,
  };
}

// ── Mutations ────────────────────────────────────

export function useReanalyze() {
  return useAction((id: string) => messagesApi.reanalyze(id));
}

export function useReanalyzeBatch() {
  return useAction((guildId: string) => messagesApi.reanalyzeBatch(guildId));
}

// ── Search ───────────────────────────────────────

export function useMessageSearch(query: string, enabled: boolean) {
  return useSWR<MessageRecord[]>(
    enabled && query.trim().length >= 2 ? msgKeys.search(query) : null,
    async () => {
      const res = await messagesApi.search(query, 50);
      return res.results;
    },
  );
}

// ── WS sync helpers ──────────────────────────────

export function useMessagesWsSync(ws: WsHook, guildId: string) {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    if (!guildId) return;
    // Patch every message-list key for this guild (all channels + "__all__")
    const patchLists = (
      updater: (old: MessagePage | undefined) => MessagePage | undefined,
    ) => {
      void mutate(
        (key) =>
          Array.isArray(key) && key[0] === "messages" && key[1] === guildId,
        updater,
        { revalidate: false },
      );
    };

    const unsub1 = ws.on("message_created", (data) => {
      const msg = data as MessageRecord;
      patchLists((old) => (old ? { ...old, data: [msg, ...old.data] } : old));
    });
    const unsub2 = ws.on("message_updated", (data) => {
      const msg = data as MessageRecord;
      patchLists((old) =>
        old
          ? { ...old, data: old.data.map((m) => (m.id === msg.id ? msg : m)) }
          : old,
      );
      void mutate(msgKeys.detail(msg.id), msg, { revalidate: false });
    });
    const unsub3 = ws.on("message_deleted", (data) => {
      const { id } = data as { id: string };
      patchLists((old) =>
        old ? { ...old, data: old.data.filter((m) => m.id !== id) } : old,
      );
    });
    const unsub4 = ws.on("message_analyzed", (data) => {
      const msg = data as MessageRecord;
      patchLists((old) =>
        old
          ? { ...old, data: old.data.map((m) => (m.id === msg.id ? msg : m)) }
          : old,
      );
      void mutate(msgKeys.detail(msg.id), msg, { revalidate: false });
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [ws, guildId, mutate]);
}
