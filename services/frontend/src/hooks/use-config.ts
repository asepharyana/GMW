import { configApi } from "@/lib/api";
import type { AppConfig } from "@/lib/types";
import { useAsync } from "./use-async";

interface UseConfigReturn {
  config: AppConfig | null;
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Fetch the app configuration from the backend.
 */
export function useConfig(): UseConfigReturn {
  const { data, loading, error, refetch } = useAsync<AppConfig>(
    () => configApi.get(),
    [],
  );
  return { config: data, loading, error, refetch };
}
