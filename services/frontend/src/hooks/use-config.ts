import useSWR from "swr";

import { configApi } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

/**
 * Fetch the app configuration from the backend.
 */
export function useConfig() {
  return useSWR<AppConfig>(["config"], () => configApi.get(), {
    dedupingInterval: 120_000,
  });
}
