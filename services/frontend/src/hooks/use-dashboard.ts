import { useCallback, useState } from "react";

import { dashboardApi } from "@/lib/api";
import type {
  DashboardChannel,
  DashboardChannelDetail,
  DashboardStats,
  DashboardUser,
  DashboardUserDetail,
} from "@/lib/types";

// ── Stats ───────────────────────────────────────

interface UseStatsReturn {
  stats: DashboardStats | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useStats(): UseStatsReturn {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await dashboardApi.getStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load stats");
    } finally {
      setLoading(false);
    }
  }, []);

  return { stats, loading, error, refetch: fetch };
}

// ── Users ───────────────────────────────────────

interface UseUsersReturn {
  users: DashboardUser[];
  loading: boolean;
  search: string;
  setSearch: (q: string) => void;
  refetch: () => void;
}

export function useUsers(): UseUsersReturn {
  const [users, setUsers] = useState<DashboardUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetch = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const result = await dashboardApi.listUsers(20, undefined, q);
      setUsers(result.data);
    } catch (err) {
      console.error("useUsers:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchWithSearch = useCallback(() => {
    fetch(search || undefined);
  }, [fetch, search]);

  return {
    users,
    loading,
    search,
    setSearch,
    refetch: fetchWithSearch,
  };
}

// ── Channels ────────────────────────────────────

interface UseChannelsReturn {
  channels: DashboardChannel[];
  loading: boolean;
  search: string;
  setSearch: (q: string) => void;
  refetch: () => void;
}

export function useChannels(guildId: string): UseChannelsReturn {
  const [channels, setChannels] = useState<DashboardChannel[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  const fetch = useCallback(
    async (q?: string) => {
      setLoading(true);
      try {
        const result = await dashboardApi.listChannels(
          20,
          q,
          guildId || undefined,
        );
        setChannels(result.data);
      } catch (err) {
        console.error("useChannels:", err);
      } finally {
        setLoading(false);
      }
    },
    [guildId],
  );

  const fetchWithSearch = useCallback(() => {
    fetch(search || undefined);
  }, [fetch, search]);

  return {
    channels,
    loading,
    search,
    setSearch,
    refetch: fetchWithSearch,
  };
}

// ── User Detail ─────────────────────────────────

export function useUserDetail() {
  const [user, setUser] = useState<DashboardUserDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (userId: string) => {
    setLoading(true);
    try {
      const detail = await dashboardApi.getUserDetail(userId);
      setUser(detail);
    } catch (err) {
      console.error("useUserDetail:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { user, loading, fetch };
}

// ── Channel Detail ──────────────────────────────

export function useChannelDetail() {
  const [channel, setChannel] = useState<DashboardChannelDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const fetch = useCallback(async (channelId: string) => {
    setLoading(true);
    try {
      const detail = await dashboardApi.getChannelDetail(channelId);
      setChannel(detail);
    } catch (err) {
      console.error("useChannelDetail:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  return { channel, loading, fetch };
}
