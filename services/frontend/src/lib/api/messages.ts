import type { AttachmentRecord, MessageRecord } from "@/lib/types";
import { api } from "./client";

export const messagesApi = {
  list: (
    guildId: string,
    limit?: number,
    channelId?: string,
    cursor?: string,
  ) => {
    // Backend messageQuerySchema expects camelCase guildId (see messages.schema.ts)
    const params = new URLSearchParams({ guildId });
    if (limit) params.set("limit", String(limit));
    if (channelId) params.set("channelId", channelId);
    if (cursor) params.set("cursor", cursor);
    return api.get<{ data: MessageRecord[]; nextCursor: string | null }>(
      `/api/messages?${params}`,
    );
  },

  getByChannel: (channelId: string, limit?: number, cursor?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return api.get<{ data: MessageRecord[]; nextCursor: string | null }>(
      `/api/messages/${channelId}${qs ? `?${qs}` : ""}`,
    );
  },

  getDetail: (id: string) =>
    api.get<MessageRecord>(`/api/messages/detail/${id}`),

  getImages: (guildId: string, limit?: number) => {
    // Backend reads req.query.guildId (camelCase) — see handleGetImageMessages in messages.controller.ts
    const params = new URLSearchParams({ guildId });
    if (limit) params.set("limit", String(limit));
    return api.get<{ data: MessageRecord[]; nextCursor: string | null }>(
      `/api/messages/images?${params}`,
    );
  },

  getAttachments: (
    channelId: string,
    limit?: number,
    cursor?: string,
    messageId?: string,
  ) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    if (messageId) params.set("messageId", messageId);
    const qs = params.toString();
    return api.get<{ data: AttachmentRecord[]; nextCursor: string | null }>(
      `/api/messages/${channelId}/attachments${qs ? `?${qs}` : ""}`,
    );
  },

  getReview: (limit?: number, channelId?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (channelId) params.set("channelId", channelId);
    return api.get<{ results: MessageRecord[]; limit: number; cursor: null }>(
      `/api/review?${params}`,
    );
  },

  reanalyze: (id: string) =>
    api.post<{ ok: boolean }>(`/api/messages/${id}/reanalyze`, {}),

  reanalyzeBatch: (guildId?: string, channelId?: string) =>
    api.post<{ ok: boolean; count: number }>("/api/messages/reanalyze-batch", {
      guildId,
      channelId,
    }),

  search: (query: string, limit?: number) => {
    const params = new URLSearchParams({ q: query });
    if (limit) params.set("limit", String(limit));
    return api.get<{ results: MessageRecord[] }>(
      `/api/analysis/search?${params}`,
    );
  },
};
