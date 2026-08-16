import { orpc } from "@/lib/orpc/client";
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
  getStats: () => orpc.dashboard.stats() as unknown as Promise<DashboardStats>,

  getActivity: (days = 14) =>
    orpc.dashboard.activity({ days }) as unknown as Promise<DashboardActivity>,

  listUsers: (limit?: number, cursor?: string, search?: string) =>
    orpc.dashboard.users({
      limit,
      cursor,
      search,
    }) as unknown as Promise<PaginatedUsers>,

  getUserDetail: (userId: string) =>
    orpc.dashboard.userDetail({
      userId,
    }) as unknown as Promise<DashboardUserDetail>,

  listChannels: (limit?: number, search?: string, guildId?: string) =>
    orpc.dashboard.channels({
      limit,
      search,
      guildId,
    }) as unknown as Promise<PaginatedChannels>,

  getChannelDetail: (channelId: string) =>
    orpc.dashboard.channelDetail({
      channelId,
    }) as unknown as Promise<DashboardChannelDetail>,

  getTopReactions: (limit = 20) =>
    orpc.dashboard.reactions({ limit }) as unknown as Promise<
      TopReactedMessage[]
    >,

  getTopReactors: (limit = 20) =>
    orpc.dashboard.reactors({ limit }) as unknown as Promise<TopReactor[]>,
};
