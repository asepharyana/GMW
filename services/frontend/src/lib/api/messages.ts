import { orpc } from "@/lib/orpc/client";
import type {
  AttachmentRecord,
  EditHistoryRow,
  MessageActivityBucket,
  MessageRecord,
  SemanticSearchResult,
} from "@/lib/types";

export const messagesApi = {
  list: (
    guildId: string,
    limit?: number,
    channelId?: string,
    cursor?: string,
  ) =>
    orpc.messages.list({
      guildId,
      limit,
      channelId,
      cursor,
    }) as unknown as Promise<{
      data: MessageRecord[];
      nextCursor: string | null;
    }>,

  getByChannel: (channelId: string, limit?: number, cursor?: string) =>
    orpc.messages.byChannel({
      channelId,
      query: { channelId, limit, cursor },
    }) as unknown as Promise<{
      data: MessageRecord[];
      nextCursor: string | null;
    }>,

  getDetail: (id: string) =>
    orpc.messages.detail({ id }) as unknown as Promise<MessageRecord>,

  getImages: (guildId: string, limit?: number) =>
    orpc.messages.images({ guildId, limit }) as unknown as Promise<{
      data: MessageRecord[];
      nextCursor: string | null;
    }>,

  getAttachments: (
    channelId: string,
    limit?: number,
    cursor?: string,
    messageId?: string,
  ) =>
    orpc.messages.attachmentsByChannel({
      channelId,
      query: { channelId, limit, cursor, messageId },
    }) as unknown as Promise<{
      data: AttachmentRecord[];
      nextCursor: string | null;
    }>,

  getReview: (limit?: number, channelId?: string) =>
    orpc.messages.review({ limit, channelId }) as unknown as Promise<{
      results: MessageRecord[];
      limit: number;
      cursor: null;
    }>,

  // Analysis search (formerly /api/analysis/search → oRPC analysis.search)
  search: (q: string, limit?: number) =>
    orpc.analysis.search({ q, limit }) as unknown as Promise<{
      results: MessageRecord[];
    }>,

  // Public semantic search over the persistent message archive (Qdrant).
  semanticSearch: (query: string, limit?: number, guildId?: string) =>
    orpc.messages.semanticSearch({
      query,
      limit,
      ...(guildId ? { guildId } : {}),
    }) as unknown as Promise<{
      results: SemanticSearchResult[];
      nextCursor: null;
    }>,

  // Public, read-only activity heatmap data (per-hour volume by channel).
  getActivity: (days = 30) =>
    orpc.messages.activity({ days }) as unknown as Promise<
      MessageActivityBucket[]
    >,

  // Public, read-only recent message edits (evasion tracker).
  getRecentEdits: (limit = 50, channelId?: string) =>
    orpc.messages.editHistory({ limit, channelId }) as unknown as Promise<
      EditHistoryRow[]
    >,
};
