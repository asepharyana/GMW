import useSWR from "swr";

import { dashboardApi } from "@/lib/api";
import type {
  DashboardActivity,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUserDetail,
  TopReactedMessage,
} from "@/lib/types";

export function useStats() {
  return useSWR<DashboardStats>(["dashboard-stats"], () =>
    dashboardApi.getStats(),
  );
}

export function useActivity(days = 14) {
  return useSWR<DashboardActivity>(["dashboard-activity", days], () =>
    dashboardApi.getActivity(days),
  );
}

export function useUsers(search?: string) {
  return useSWR(
    ["dashboard-users", search ?? ""],
    async () => {
      const res = await dashboardApi.listUsers(20, undefined, search);
      return res.data;
    },
    {
      keepPreviousData: true,
    },
  );
}

export function useChannels(guildId?: string, search?: string) {
  return useSWR(
    ["dashboard-channels", guildId ?? "__all__", search ?? ""],
    async () => {
      const res = await dashboardApi.listChannels(
        20,
        search,
        guildId || undefined,
      );
      return res.data;
    },
    {
      keepPreviousData: true,
    },
  );
}

export function useUserDetail(userId: string | null) {
  return useSWR<DashboardUserDetail>(
    userId ? ["dashboard-user", userId] : null,
    () => dashboardApi.getUserDetail(userId!),
  );
}

export function useChannelDetail(channelId: string | null) {
  return useSWR<DashboardChannelDetail>(
    channelId ? ["dashboard-channel", channelId] : null,
    () => dashboardApi.getChannelDetail(channelId!),
  );
}

export function useTopReactions(limit = 20) {
  return useSWR<TopReactedMessage[]>(["dashboard-reactions", limit], () =>
    dashboardApi.getTopReactions(limit),
  );
}
