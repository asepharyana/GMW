import { trpc } from "@/lib/trpc/client";
import type { AttachmentRecord, MessageRecord } from "@/lib/types";

export const messagesApi = {
  list: (
    guildId: string,
    limit?: number,
    channelId?: string,
    cursor?: string,
  ) =>
    trpc.messages.list.query({
      guildId,
      limit,
      channelId,
      cursor,
    }) as unknown as Promise<{
      data: MessageRecord[];
      nextCursor: string | null;
    }>,

  getByChannel: (channelId: string, limit?: number, cursor?: string) =>
    trpc.messages.byChannel.query({
      channelId,
      query: { channelId, limit, cursor },
    }) as unknown as Promise<{
      data: MessageRecord[];
      nextCursor: string | null;
    }>,

  getDetail: (id: string) =>
    trpc.messages.detail.query({ id }) as unknown as Promise<MessageRecord>,

  getImages: (guildId: string, limit?: number) =>
    trpc.messages.images.query({ guildId, limit }) as unknown as Promise<{
      data: MessageRecord[];
      nextCursor: string | null;
    }>,

  getAttachments: (
    channelId: string,
    limit?: number,
    cursor?: string,
    messageId?: string,
  ) =>
    trpc.messages.attachmentsByChannel.query({
      channelId,
      query: { channelId, limit, cursor, messageId },
    }) as unknown as Promise<{
      data: AttachmentRecord[];
      nextCursor: string | null;
    }>,

  getReview: (limit?: number, channelId?: string) =>
    trpc.messages.review.query({ limit, channelId }) as unknown as Promise<{
      results: MessageRecord[];
      limit: number;
      cursor: null;
    }>,

  // Analysis search (formerly /api/analysis/search → tRPC analysis.search)
  search: (q: string, limit?: number) =>
    trpc.analysis.search.query({ q, limit }) as unknown as Promise<{
      results: MessageRecord[];
    }>,
};
