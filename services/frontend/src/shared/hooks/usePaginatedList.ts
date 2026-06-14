import { useCallback, useEffect, useRef, useState } from "react";

export interface PaginatedResult<T> {
  data: T[];
  nextCursor: string | null;
}

export interface UsePaginatedListParams {
  limit: number;
  search?: string;
  cursor?: string;
  guildId?: string;
}

/**
 * Generic hook for fetching a paginated list with cursor-based pagination,
 * search support, and automatic refetch when search/guildId changes.
 */
export function usePaginatedList<T>(
  fetchFn: (params: UsePaginatedListParams) => Promise<PaginatedResult<T>>,
  guildId = "",
  initialSearch = "",
) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [search, setSearch] = useState(initialSearch);

  // Stable refs so fetch() can be a stable callback that reads latest values
  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;
  const guildIdRef = useRef(guildId);
  guildIdRef.current = guildId;
  const searchRef = useRef(search);
  searchRef.current = search;
  const fetchIdRef = useRef(0);

  const fetch = useCallback(async (cursor?: string) => {
    const id = ++fetchIdRef.current;

    if (cursor) {
      setLoadingMore(true);
    } else {
      setLoading(true);
      setData([]);
    }
    setError(null);

    try {
      const result = await fetchFnRef.current({
        limit: 20,
        search: searchRef.current || undefined,
        cursor,
        guildId: guildIdRef.current || undefined,
      });
      if (id !== fetchIdRef.current) return;

      if (cursor) {
        setData((prev) => [...prev, ...result.data]);
      } else {
        setData(result.data);
      }
      setNextCursor(result.nextCursor);
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      const msg = e instanceof Error ? e.message : "Failed to load data";
      setError(msg);
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, []);

  // Re-fetch on mount, search change, or guildId change
  useEffect(() => {
    fetch().catch(() => undefined);
  }, [search, guildId, fetch]);

  const loadMore = useCallback(() => {
    if (nextCursor && !loading && !loadingMore) {
      fetch(nextCursor).catch(() => undefined);
    }
  }, [nextCursor, loading, loadingMore, fetch]);

  const refetch = useCallback(() => {
    fetch().catch(() => undefined);
  }, [fetch]);

  return {
    data,
    loading,
    loadingMore,
    error,
    nextCursor,
    search,
    setSearch,
    hasMore: !!nextCursor,
    loadMore,
    refetch,
  };
}
