// ─── Generic async action state hook ──────────────────────────────────────

import { useCallback, useState } from "react";

interface AsyncActionState {
  loading: boolean;
  error: string | null;
}

export function useAsyncAction() {
  const [state, setState] = useState<AsyncActionState>({
    loading: false,
    error: null,
  });

  const execute = useCallback(
    async <T>(fn: () => Promise<T>): Promise<T | null> => {
      setState({ loading: true, error: null });
      try {
        const result = await fn();
        setState({ loading: false, error: null });
        return result;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setState({ loading: false, error: message });
        return null;
      }
    },
    [],
  );

  const clearError = useCallback(() => {
    setState((prev) => ({ ...prev, error: null }));
  }, []);

  return { ...state, execute, clearError };
}
