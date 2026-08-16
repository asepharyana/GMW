import { orpc } from "@/lib/orpc/client";
import type { ModerationStats, PaginatedModerationActions } from "@/lib/types";

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
};
