import { useCallback, useEffect, useState } from "react";
import {
  type DashboardChannel,
  type DashboardChannelDetail,
  type DashboardStats,
  type DashboardUser,
  type DashboardUserDetail,
  getDashboardChannelDetail,
  getDashboardStats,
  getDashboardUserDetail,
  listDashboardChannels,
  listDashboardUsers,
} from "../../../shared/api/client";
import { useItemDetail } from "../../../shared/hooks/useItemDetail";
import { usePaginatedList } from "../../../shared/hooks/usePaginatedList";

const logger = console;

/**
 * Fetch dashboard aggregate stats.
 */
export function useDashboardStats() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardStats();
      setStats(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load stats";
      setError(msg);
      logger.error("[useDashboardStats]", msg);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch().catch(() => undefined);
  }, [fetch]);

  return { stats, loading, error, refetch: fetch };
}

/**
 * Fetch paginated user list with optional search.
 */
export function useDashboardUsers() {
  const paginated = usePaginatedList(
    (params) =>
      listDashboardUsers({
        limit: params.limit,
        search: params.search,
        cursor: params.cursor,
      }).then((r) => ({ data: r.data, nextCursor: r.nextCursor })),
    "",
  );

  return {
    users: paginated.data,
    loading: paginated.loading,
    error: paginated.error,
    search: paginated.search,
    setSearch: paginated.setSearch,
    loadMore: paginated.loadMore,
    hasMore: paginated.hasMore,
    refetch: paginated.refetch,
  };
}

/**
 * Fetch a single user detail by userId.
 */
export function useDashboardUserDetail(userId: string | null) {
  const { data, loading, error, refetch } = useItemDetail(
    (_guildId, entityId) => getDashboardUserDetail(entityId),
    "",
    userId,
    "user",
  );

  return { detail: data, loading, error, refetch };
}

/**
 * Fetch paginated channel list with optional search.
 */
export function useDashboardChannels() {
  const paginated = usePaginatedList(
    (params) =>
      listDashboardChannels({
        limit: params.limit,
        search: params.search,
        guild_id: params.guildId,
        cursor: params.cursor,
      }).then((r) => ({ data: r.data, nextCursor: r.nextCursor })),
    "",
  );

  return {
    channels: paginated.data,
    loading: paginated.loading,
    error: paginated.error,
    search: paginated.search,
    setSearch: paginated.setSearch,
    loadMore: paginated.loadMore,
    hasMore: paginated.hasMore,
    refetch: paginated.refetch,
  };
}

/**
 * Fetch a single channel detail by channelId.
 */
export function useDashboardChannelDetail(channelId: string | null) {
  const { data, loading, error, refetch } = useItemDetail(
    (_guildId, entityId) => getDashboardChannelDetail(entityId),
    "",
    channelId,
    "channel",
  );

  return { detail: data, loading, error, refetch };
}
