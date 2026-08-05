import type { ModerationStats, PaginatedModerationActions } from "@/lib/types";
import { api } from "./client";

export const moderationApi = {
  getStats: () => api.get<ModerationStats>("/api/moderation/stats"),

  listActions: (
    limit?: number,
    status?: string,
    actionType?: string,
    cursor?: string,
  ) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (status) params.set("status", status);
    if (actionType) params.set("actionType", actionType);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return api.get<PaginatedModerationActions>(
      `/api/moderation/actions${qs ? `?${qs}` : ""}`,
    );
  },
};
