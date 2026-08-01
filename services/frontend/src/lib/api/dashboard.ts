import type {
  DashboardActivity,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUserDetail,
  PaginatedChannels,
  PaginatedUsers,
} from "@/lib/types";
import { api } from "./client";

export const dashboardApi = {
  getStats: () => api.get<DashboardStats>("/api/dashboard/stats"),

  getActivity: (days = 14) =>
    api.get<DashboardActivity>(`/api/dashboard/activity?days=${days}`),

  listUsers: (limit?: number, cursor?: string, search?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (cursor) params.set("cursor", cursor);
    if (search) params.set("search", search);
    const qs = params.toString();
    return api.get<PaginatedUsers>(`/api/dashboard/users${qs ? `?${qs}` : ""}`);
  },

  getUserDetail: (userId: string) =>
    api.get<DashboardUserDetail>(`/api/dashboard/users/${userId}`),

  listChannels: (limit?: number, search?: string, guildId?: string) => {
    const params = new URLSearchParams();
    if (limit) params.set("limit", String(limit));
    if (search) params.set("search", search);
    // Backend reads req.query.guild_id (snake_case) — see createDashboardRouter in dashboard.routes.ts
    if (guildId) params.set("guild_id", guildId);
    const qs = params.toString();
    return api.get<PaginatedChannels>(
      `/api/dashboard/channels${qs ? `?${qs}` : ""}`,
    );
  },

  getChannelDetail: (channelId: string) =>
    api.get<DashboardChannelDetail>(`/api/dashboard/channels/${channelId}`),
};
