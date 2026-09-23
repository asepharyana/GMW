import useSWR from "swr";

import { messagesApi } from "@/lib/api";
import type { Guild } from "@/lib/types";

/**
 * Fetch the list of available Discord guilds (derived from the message
 * archive by the backend).
 */
export function useGuilds(initialData?: Guild[]) {
  return useSWR<Guild[]>(["guilds"], () => messagesApi.getGuilds(), {
    dedupingInterval: 60_000,
    fallbackData: initialData,
  });
}
