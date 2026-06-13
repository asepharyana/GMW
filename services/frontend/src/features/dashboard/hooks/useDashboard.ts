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
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchUsers = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listDashboardUsers({
          limit: 20,
          cursor,
          search: search || undefined,
        });
        if (cursor) {
          setUsers((prev) => [...prev, ...result.data]);
        } else {
          setUsers(result.data);
        }
        setNextCursor(result.nextCursor);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load users";
        setError(msg);
        logger.error("[useDashboardUsers]", msg);
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    fetchUsers().catch(() => undefined);
  }, [fetchUsers]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) {
      fetchUsers(nextCursor).catch(() => undefined);
    }
  }, [nextCursor, loading, fetchUsers]);

  return {
    users,
    loading,
    error,
    search,
    setSearch,
    loadMore,
    hasMore: !!nextCursor,
    refetch: () => fetchUsers().catch(() => undefined),
  };
}

/**
 * Fetch a single user detail by userId.
 */
export function useDashboardUserDetail(userId: string | null) {
  const [detail, setDetail] = useState<DashboardUserDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardUserDetail(userId);
      if (!data) {
        setError("User not found");
        return;
      }
      setDetail(data);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load user detail";
      setError(msg);
      logger.error("[useDashboardUserDetail]", msg);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    fetch().catch(() => undefined);
  }, [fetch]);

  return { detail, loading, error, refetch: fetch };
}

/**
 * Fetch paginated channel list with optional search.
 */
export function useDashboardChannels() {
  const [channels, setChannels] = useState<DashboardChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const fetchChannels = useCallback(
    async (cursor?: string) => {
      setLoading(true);
      setError(null);
      try {
        const result = await listDashboardChannels({
          limit: 20,
          search: search || undefined,
        });
        if (cursor) {
          setChannels((prev) => [...prev, ...result.data]);
        } else {
          setChannels(result.data);
        }
        setNextCursor(result.nextCursor);
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Failed to load channels";
        setError(msg);
        logger.error("[useDashboardChannels]", msg);
      } finally {
        setLoading(false);
      }
    },
    [search],
  );

  useEffect(() => {
    fetchChannels().catch(() => undefined);
  }, [fetchChannels]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading) {
      fetchChannels(nextCursor).catch(() => undefined);
    }
  }, [nextCursor, loading, fetchChannels]);

  return {
    channels,
    loading,
    error,
    search,
    setSearch,
    loadMore,
    hasMore: !!nextCursor,
    refetch: () => fetchChannels().catch(() => undefined),
  };
}

/**
 * Fetch a single channel detail by channelId.
 */
export function useDashboardChannelDetail(channelId: string | null) {
  const [detail, setDetail] = useState<DashboardChannelDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getDashboardChannelDetail(channelId);
      if (!data) {
        setError("Channel not found");
        return;
      }
      setDetail(data);
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "Failed to load channel detail";
      setError(msg);
      logger.error("[useDashboardChannelDetail]", msg);
    } finally {
      setLoading(false);
    }
  }, [channelId]);

  useEffect(() => {
    fetch().catch(() => undefined);
  }, [fetch]);

  return { detail, loading, error, refetch: fetch };
}
