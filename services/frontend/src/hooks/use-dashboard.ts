import useSWR from "swr";

import { dashboardApi } from "@/lib/api";
import type {
  DashboardActivity,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUserDetail,
  TopReactedMessage,
  TopReactor,
} from "@/lib/types";

/**
 * Server-seeded SWR hooks.
 *
 * SSR pages fetch the initial payload on the server and hand it here as
 * `initialData` — the first render is server data, and SWR takes over for
 * revalidation from then on (no blank-spinner-first-load).
 */
export function useStats(initialData?: DashboardStats) {
  return useSWR<DashboardStats>(
    ["dashboard-stats"],
    () => dashboardApi.getStats(),
    { fallbackData: initialData },
  );
}

export function useActivity(days = 14, initialData?: DashboardActivity) {
  return useSWR<DashboardActivity>(
    ["dashboard-activity", days],
    () => dashboardApi.getActivity(days),
    { fallbackData: initialData },
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
    userId ? (["dashboard-user", userId] as const) : null,
    () => dashboardApi.getUserDetail(userId ?? ""),
  );
}

export function useChannelDetail(channelId: string | null) {
  return useSWR<DashboardChannelDetail>(
    channelId ? (["dashboard-channel", channelId] as const) : null,
    () => dashboardApi.getChannelDetail(channelId ?? ""),
  );
}

export function useTopReactions() {
  return useSWR<TopReactedMessage[]>(["dashboard-reactions"], () =>
    dashboardApi.getTopReactions(20),
  );
}

export function useTopReactors() {
  return useSWR<TopReactor[]>(["dashboard-reactors"], () =>
    dashboardApi.getTopReactors(20),
  );
}
