import { useQuery } from "@tanstack/react-query";

import { voiceApi } from "@/lib/api";
import type { Guild } from "@/lib/types";

/**
 * Fetch the list of available Discord guilds.
 */
export function useGuilds() {
  return useQuery<Guild[]>({
    queryKey: ["guilds"],
    queryFn: () => voiceApi.getGuilds(),
    staleTime: 60_000,
  });
}
