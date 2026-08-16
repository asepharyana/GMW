import { trpc } from "@/lib/trpc/client";
import type { ModerationStats, PaginatedModerationActions } from "@/lib/types";

export const moderationApi = {
  getStats: () =>
    trpc.moderation.stats.query() as unknown as Promise<ModerationStats>,

  listActions: (
    limit?: number,
    status?: string,
    actionType?: string,
    cursor?: string,
  ) =>
    trpc.moderation.actions.query({
      limit,
      status,
      actionType,
      cursor,
    }) as unknown as Promise<PaginatedModerationActions>,
};
