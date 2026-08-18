import { orpc } from "@/lib/orpc/client";
import type {
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
};
