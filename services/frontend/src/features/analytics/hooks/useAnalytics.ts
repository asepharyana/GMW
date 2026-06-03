import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import type {
  AIStats,
  AnalyticsOverview,
  AttachmentStats,
  HeatmapCell,
  HourlyBucket,
  ModerationActionRecord,
  TopicTrend,
  TrendBucket,
  UserStat,
  ViolatorStat,
} from "../../../shared/api/client";
import {
  fetchAIStats,
  fetchAnalyticsOverview,
  fetchAttachmentStats,
  fetchHeatmap,
  fetchModerationActions,
  fetchTrend,
  fetchViolators,
} from "../../../shared/api/client";

function analyticsKeys(
  guildId: string,
  channelId: string | undefined,
  hours: number,
) {
  const base = [guildId, channelId ?? "", hours] as const;
  return {
    overview: ["analytics", "overview", ...base] as const,
    violators: ["analytics", "violators", ...base] as const,
    trend: ["analytics", "trend", ...base] as const,
    heatmap: ["analytics", "heatmap", ...base] as const,
    aiStats: ["analytics", "ai-stats", ...base] as const,
    attachmentStats: ["analytics", "attachment-stats", ...base] as const,
    moderationActions: ["analytics", "moderation-actions", ...base] as const,
  };
}

interface UseAnalyticsOptions {
  guildId: string;
  channelId?: string;
  hours?: number;
}

export function useAnalytics({
  guildId,
  channelId,
  hours = 24,
}: UseAnalyticsOptions) {
  const keys = analyticsKeys(guildId, channelId, hours);

  const overviewQuery = useQuery({
    queryKey: keys.overview,
    queryFn: () => fetchAnalyticsOverview({ guildId, channelId, hours }),
    enabled: !!guildId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const violatorsQuery = useQuery({
    queryKey: keys.violators,
    queryFn: () => fetchViolators({ guildId, channelId, hours, limit: 20 }),
    enabled: !!guildId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const trendQuery = useQuery({
    queryKey: keys.trend,
    queryFn: () => fetchTrend({ guildId, channelId, hours }),
    enabled: !!guildId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const heatmapQuery = useQuery({
    queryKey: keys.heatmap,
    queryFn: () => fetchHeatmap({ guildId, channelId, hours }),
    enabled: !!guildId,
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const aiStatsQuery = useQuery({
    queryKey: keys.aiStats,
    queryFn: () => fetchAIStats({ guildId, channelId, hours }),
    enabled: !!guildId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const attachmentStatsQuery = useQuery({
    queryKey: keys.attachmentStats,
    queryFn: () => fetchAttachmentStats({ guildId, channelId, hours }),
    enabled: !!guildId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const moderationActionsQuery = useQuery({
    queryKey: keys.moderationActions,
    queryFn: () => fetchModerationActions({ guildId, channelId, hours, limit: 50 }),
    enabled: !!guildId,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const refresh = useCallback(() => {
    if (!guildId) return;
    window.dispatchEvent(new CustomEvent("analytics_refresh"));
  }, [guildId]);

  useEffect(() => {
    const handler = () => {
      if (!guildId) return;
      window.dispatchEvent(new CustomEvent("analytics_force_refresh"));
    };
    window.addEventListener("analytics_refresh", handler);
    return () => window.removeEventListener("analytics_refresh", handler);
  }, [refresh]);

  const overview = overviewQuery.data ?? null;
  const isFetching = overviewQuery.isFetching && !overviewQuery.isLoading;
  const isLoading = overviewQuery.isLoading && !overviewQuery.data;

  return {
    overview,
    isLoading,
    isFetching,
    error:
      overviewQuery.error instanceof Error ? overviewQuery.error.message : null,
    refresh,

    violators: violatorsQuery.data ?? [],
    violatorsLoading: violatorsQuery.isLoading && !violatorsQuery.data,
    violatorsFetching: violatorsQuery.isFetching && !violatorsQuery.isLoading,
    refreshViolators: () => {
      if (guildId) window.dispatchEvent(new CustomEvent("analytics_refresh"));
    },

    trend: trendQuery.data ?? [],
    trendLoading: trendQuery.isLoading && !trendQuery.data,
    trendFetching: trendQuery.isFetching && !trendQuery.isLoading,

    heatmap: heatmapQuery.data ?? [],
    heatmapLoading: heatmapQuery.isLoading && !heatmapQuery.data,
    heatmapFetching: heatmapQuery.isFetching && !heatmapQuery.isLoading,

    aiStats: aiStatsQuery.data ?? null,
    aiStatsLoading: aiStatsQuery.isLoading && !aiStatsQuery.data,

    attachmentStats: attachmentStatsQuery.data ?? null,
    attachmentStatsLoading:
      attachmentStatsQuery.isLoading && !attachmentStatsQuery.data,

    moderationActions: moderationActionsQuery.data ?? [],
    moderationActionsLoading:
      moderationActionsQuery.isLoading && !moderationActionsQuery.data,

    hourly: overview?.hourly ?? ([] as HourlyBucket[]),
    topics: overview?.topics ?? ([] as TopicTrend[]),
    topUsers: overview?.top_users ?? ([] as UserStat[]),
    messages: overview?.messages ?? null,
    period: overview?.period ?? null,
    activeUsersCount: overview?.active_users_count ?? 0,
    totalChannels: overview?.total_channels ?? 0,
  };
}

export type {
  AIStats,
  AnalyticsOverview,
  AttachmentStats,
  HeatmapCell,
  HourlyBucket,
  ModerationActionRecord,
  TopicTrend,
  TrendBucket,
  UserStat,
  ViolatorStat,
};
