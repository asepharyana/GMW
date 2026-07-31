import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

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
};

// ── Messages list (paginated, cursor-based) ──────

export function useMessages(guildId: string, channelId?: string) {
  return useQuery<MessageRecord[]>({
    queryKey: msgKeys.list(guildId, channelId),
    queryFn: async () => {
      const result = await messagesApi.list(
        guildId,
        50,
        channelId || undefined,
      );
      return result.data;
    },
    enabled: !!guildId,
  });
}

export function useMessagesHasMore(guildId: string, channelId?: string) {
  return useQuery({
    queryKey: [...msgKeys.list(guildId, channelId), "cursor"],
    queryFn: async () => {
      const result = await messagesApi.list(
        guildId,
        50,
        channelId || undefined,
      );
      return { cursor: result.nextCursor, hasMore: result.nextCursor !== null };
    },
    enabled: !!guildId,
  });
}

export function useLoadMore() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
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
      return { data: result.data, cursor: result.nextCursor };
    },
    onSuccess: (data, vars) => {
      const key = msgKeys.list(vars.guildId, vars.channelId);
      qc.setQueryData<MessageRecord[]>(key, (old) =>
        old ? [...old, ...data.data] : data.data,
      );
      qc.setQueryData([...key, "cursor"], {
        cursor: data.cursor,
        hasMore: data.cursor !== null,
      });
    },
  });
}

// ── Channels list ────────────────────────────────

export function useTextChannels(guildId: string) {
  return useQuery<Channel[]>({
    queryKey: ["text-channels", guildId],
    queryFn: () => voiceApi.getTextChannels(guildId),
    enabled: !!guildId,
  });
}

// ── Images ───────────────────────────────────────

export function useImages(guildId: string) {
  return useQuery<MessageRecord[]>({
    queryKey: msgKeys.images(guildId),
    queryFn: async () => {
      const result = await messagesApi.getImages(guildId, 50);
      return result.data;
    },
    enabled: !!guildId,
  });
}

// ── Review ───────────────────────────────────────

export function useReview(channelId?: string) {
  return useQuery<MessageRecord[]>({
    queryKey: msgKeys.review(channelId),
    queryFn: async () => {
      const result = await messagesApi.getReview(50, channelId || undefined);
      return result.results;
    },
  });
}

// ── Detail ───────────────────────────────────────

export function useMessageDetail(id: string | null) {
  const detail = useQuery<MessageRecord>({
    queryKey: msgKeys.detail(id ?? ""),
    queryFn: () => messagesApi.getDetail(id!),
    enabled: !!id,
  });
  const attachments = useQuery<AttachmentRecord[]>({
    queryKey: [...msgKeys.detail(id ?? ""), "attachments"],
    queryFn: async () => {
      if (!id) return [];
      const res = await messagesApi.getAttachments(
        detail.data?.channel_id ?? "",
        10,
      );
      return res.data;
    },
    enabled: !!id && !!detail.data?.channel_id,
  });
  return {
    message: detail.data ?? null,
    attachments: attachments.data ?? [],
    loading: detail.isLoading || attachments.isLoading,
    error: detail.error,
  };
}

// ── Mutations ────────────────────────────────────

export function useReanalyze() {
  const _qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => messagesApi.reanalyze(id),
  });
}

export function useReanalyzeBatch() {
  return useMutation({
    mutationFn: (guildId: string) => messagesApi.reanalyzeBatch(guildId),
  });
}

// ── WS sync helpers ──────────────────────────────

export function useMessagesWsSync(ws: WsHook, guildId: string) {
  const qc = useQueryClient();
  useEffect(() => {
    if (!guildId) return;
    const key = msgKeys.list(guildId);
    const unsub1 = ws.on("message_created", (data) => {
      qc.setQueryData<MessageRecord[]>(key, (old) =>
        old ? [data as MessageRecord, ...old] : [data as MessageRecord],
      );
    });
    const unsub2 = ws.on("message_updated", (data) => {
      qc.setQueryData<MessageRecord[]>(key, (old) =>
        old
          ? old.map((m) =>
              m.id === (data as MessageRecord).id ? (data as MessageRecord) : m,
            )
          : old,
      );
    });
    const unsub3 = ws.on("message_deleted", (data) => {
      qc.setQueryData<MessageRecord[]>(key, (old) =>
        old ? old.filter((m) => m.id !== (data as { id: string }).id) : old,
      );
    });
    const unsub4 = ws.on("message_analyzed", (data) => {
      qc.setQueryData<MessageRecord[]>(key, (old) =>
        old
          ? old.map((m) =>
              m.id === (data as MessageRecord).id ? (data as MessageRecord) : m,
            )
          : old,
      );
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
    };
  }, [ws, guildId, qc]);
}
