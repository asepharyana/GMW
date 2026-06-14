import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Generic hook for fetching a single item by ID.
 * Automatically refetches when guildId or entityId changes.
 */
export function useItemDetail<T>(
  fetchFn: (guildId: string, entityId: string) => Promise<T>,
  guildId: string,
  entityId: string | null,
  entityName = "item",
) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchFnRef = useRef(fetchFn);
  fetchFnRef.current = fetchFn;
  const guildIdRef = useRef(guildId);
  guildIdRef.current = guildId;
  const fetchIdRef = useRef(0);

  const fetch = useCallback(async () => {
    if (!entityId) return;
    const id = ++fetchIdRef.current;

    setLoading(true);
    setError(null);
    try {
      const result = await fetchFnRef.current(guildIdRef.current, entityId);
      if (id !== fetchIdRef.current) return;
      if (!result) {
        setError(`${entityName} not found`);
        return;
      }
      setData(result);
    } catch (e) {
      if (id !== fetchIdRef.current) return;
      const msg =
        e instanceof Error ? e.message : `Failed to load ${entityName}`;
      setError(msg);
    } finally {
      if (id === fetchIdRef.current) {
        setLoading(false);
      }
    }
  }, [entityId, entityName]);

  useEffect(() => {
    fetch().catch(() => undefined);
  }, [fetch]);

  const refetch = useCallback(() => {
    fetch().catch(() => undefined);
  }, [fetch]);

  return { data, loading, error, refetch };
}
