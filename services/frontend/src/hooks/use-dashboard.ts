import { useQuery } from "@tanstack/react-query";

import { dashboardApi } from "@/lib/api";
import type {
  DashboardChannelDetail,
  DashboardStats,
  DashboardUserDetail,
} from "@/lib/types";

export function useStats() {
  return useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => dashboardApi.getStats(),
  });
}

export function useUsers(search?: string) {
  return useQuery({
    queryKey: ["dashboard-users", search ?? ""],
    queryFn: () => dashboardApi.listUsers(20, undefined, search),
    select: (data) => data.data,
  });
}

export function useChannels(guildId: string, search?: string) {
  return useQuery({
    queryKey: ["dashboard-channels", guildId, search ?? ""],
    queryFn: () => dashboardApi.listChannels(20, search, guildId || undefined),
    select: (data) => data.data,
    enabled: !!guildId,
  });
}

export function useUserDetail(userId: string | null) {
  return useQuery<DashboardUserDetail>({
    queryKey: ["dashboard-user", userId],
    queryFn: () => dashboardApi.getUserDetail(userId!),
    enabled: !!userId,
  });
}

export function useChannelDetail(channelId: string | null) {
  return useQuery<DashboardChannelDetail>({
    queryKey: ["dashboard-channel", channelId],
    queryFn: () => dashboardApi.getChannelDetail(channelId!),
    enabled: !!channelId,
  });
}
