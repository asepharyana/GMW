import useSWR from "swr";

import { voiceApi } from "@/lib/api";
import type { Guild } from "@/lib/types";

/**
 * Fetch the list of available Discord guilds.
 */
export function useGuilds() {
  return useSWR<Guild[]>(["guilds"], () => voiceApi.getGuilds(), {
    dedupingInterval: 60_000,
  });
}
