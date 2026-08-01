import useSWR from "swr";

import { dashboardApi } from "@/lib/api";
import type {
  DashboardChannelDetail,
  DashboardStats,
  DashboardUserDetail,
} from "@/lib/types";

export function useStats() {
  return useSWR<DashboardStats>(["dashboard-stats"], () =>
    dashboardApi.getStats(),
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
