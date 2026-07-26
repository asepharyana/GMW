import { useQuery } from "@tanstack/react-query";

import { configApi } from "@/lib/api";
import type { AppConfig } from "@/lib/types";

/**
 * Fetch the app configuration from the backend.
 */
export function useConfig() {
  return useQuery<AppConfig>({
    queryKey: ["config"],
    queryFn: () => configApi.get(),
    staleTime: 120_000,
  });
}
