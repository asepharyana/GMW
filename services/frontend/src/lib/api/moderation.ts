import { orpc } from "@/lib/orpc/client";
import type {
  CategoryAction,
  FlaggedChannel,
  FlaggedDomain,
  HourlyModeration,
  ModerationCoverage,
  ModerationStats,
  ModerationTrends,
  PaginatedModerationActions,
} from "@/lib/types";

export const moderationApi = {
  getStats: () =>
    orpc.moderation.stats() as unknown as Promise<ModerationStats>,

  listActions: (
    limit?: number,
    status?: string,
    actionType?: string,
    cursor?: string,
  ) =>
    orpc.moderation.actions({
      limit,
      status,
      actionType,
      cursor,
    }) as unknown as Promise<PaginatedModerationActions>,

  getTrends: (days = 30) =>
    orpc.moderation.trends({ days }) as unknown as Promise<ModerationTrends>,

  getTopDomains: (days = 30) =>
    orpc.moderation.topDomains({ days }) as unknown as Promise<FlaggedDomain[]>,

  getTopChannels: (days = 30) =>
    orpc.moderation.topChannels({ days }) as unknown as Promise<
      FlaggedChannel[]
    >,

  getHourlyModeration: (days = 30) =>
    orpc.moderation.byHour({ days }) as unknown as Promise<HourlyModeration[]>,

  getByCategory: (days = 30, category: string) =>
    orpc.moderation.byCategory({ days, category }) as unknown as Promise<
      CategoryAction[]
    >,

  getCoverage: (days = 30) =>
    orpc.moderation.coverage({
      days,
    }) as unknown as Promise<ModerationCoverage>,
};
