import { useCallback, useEffect, useState } from "react";

import { voiceApi } from "@/lib/api";
import type { Guild } from "@/lib/types";

interface UseGuildsReturn {
  guilds: Guild[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch the list of available Discord guilds.
 */
export function useGuilds(): UseGuildsReturn {
  const [guilds, setGuilds] = useState<Guild[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchGuilds = useCallback(() => {
    setLoading(true);
    setError(null);
    voiceApi
      .getGuilds()
      .then(setGuilds)
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Failed to load guilds"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    fetchGuilds();
  }, [fetchGuilds]);

  return { guilds, loading, error, refetch: fetchGuilds };
}
