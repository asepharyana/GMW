import { trpc } from "@/lib/trpc/client";
import type {
  DashboardActivity,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUserDetail,
  PaginatedChannels,
  PaginatedUsers,
  TopReactedMessage,
  TopReactor,
} from "@/lib/types";

export const dashboardApi = {
  getStats: () =>
    trpc.dashboard.stats.query() as unknown as Promise<DashboardStats>,

  getActivity: (days = 14) =>
    trpc.dashboard.activity.query({
      days,
    }) as unknown as Promise<DashboardActivity>,

  listUsers: (limit?: number, cursor?: string, search?: string) =>
    trpc.dashboard.users.query({
      limit,
      cursor,
      search,
    }) as unknown as Promise<PaginatedUsers>,

  getUserDetail: (userId: string) =>
    trpc.dashboard.userDetail.query({
      userId,
    }) as unknown as Promise<DashboardUserDetail>,

  listChannels: (limit?: number, search?: string, guildId?: string) =>
    trpc.dashboard.channels.query({
      limit,
      search,
      guildId,
    }) as unknown as Promise<PaginatedChannels>,

  getChannelDetail: (channelId: string) =>
    trpc.dashboard.channelDetail.query({
      channelId,
    }) as unknown as Promise<DashboardChannelDetail>,

  getTopReactions: (limit = 20) =>
    trpc.dashboard.reactions.query({ limit }) as unknown as Promise<
      TopReactedMessage[]
    >,

  getTopReactors: (limit = 20) =>
    trpc.dashboard.reactors.query({ limit }) as unknown as Promise<
      TopReactor[]
    >,
};
