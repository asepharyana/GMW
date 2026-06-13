import { useCallback, useEffect, useState } from "react";
import {
  type DashboardStats,
  type DashboardUser,
  type DashboardUserDetail,
  getDashboardStats,
  getDashboardUserDetail,
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
