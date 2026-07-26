import { useCallback, useEffect, useRef, useState } from "react";

interface UseAsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

type UseAsyncReturn<T> = UseAsyncState<T> & { refetch: () => void };

/**
 * Generic async data-fetching hook.
 *
 * - Cancels requests on unmount
 * - Provides loading / error / data states
 * - Returns a refetch trigger
 */
export function useAsync<T>(
  fetcher: () => Promise<T>,
  deps: unknown[] = [],
): UseAsyncReturn<T> {
  const [state, setState] = useState<UseAsyncState<T>>({
    data: null,
    loading: true,
    error: null,
  });
  const cancelledRef = useRef(false);

  const execute = useCallback(() => {
    cancelledRef.current = false;
    setState((prev) => ({ ...prev, loading: true, error: null }));
    fetcher()
      .then((data) => {
        if (!cancelledRef.current) {
          setState({ data, loading: false, error: null });
        }
      })
      .catch((err: unknown) => {
        if (!cancelledRef.current) {
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : "An error occurred",
          });
        }
      });
    // biome-ignore lint/correctness/useExhaustiveDependencies: deps is intentionally dynamic
  }, deps);

  useEffect(() => {
    execute();
    return () => {
      cancelledRef.current = true;
    };
  }, [execute]);

  return { ...state, refetch: execute };
}
