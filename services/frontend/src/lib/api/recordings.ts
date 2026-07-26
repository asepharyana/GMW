import type { PaginatedRecordings } from "@/lib/types";
import { api } from "./client";

export const recordingsApi = {
  list: (
    limit?: number,
    channelId?: string,
    userId?: string,
    cursor?: string,
  ) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (channelId) params.set("channelId", channelId);
    if (userId) params.set("userId", userId);
    if (cursor) params.set("cursor", cursor);
    const qs = params.toString();
    return api.get<PaginatedRecordings>(`/api/recordings${qs ? `?${qs}` : ""}`);
  },

  delete: (id: string) => api.delete<{ ok: boolean }>(`/api/recordings/${id}`),
};
