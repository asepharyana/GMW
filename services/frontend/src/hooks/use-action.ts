import { useCallback, useRef, useState } from "react";

export interface UseActionState {
  isPending: boolean;
  error: Error | null;
}

/**
 * A lightweight mutation hook with a TanStack-compatible surface
 * ({ mutate, mutateAsync, isPending, error }) built on plain state —
 * the SWR replacement for useMutation. Fire-and-forget via `mutate`,
 * await the result via `mutateAsync`.
 *
 * `onSuccess` receives (data, args) and may perform SWR cache updates
 * (e.g. `mutate(key, data, { revalidate: false })`).
 */
export function useAction<TArgs = void, TResult = unknown>(
  fn: (args: TArgs) => Promise<TResult>,
  options?: {
    onSuccess?: (data: TResult, args: TArgs) => void | Promise<void>;
  },
) {
  const [state, setState] = useState<UseActionState>({
    isPending: false,
    error: null,
  });

  const fnRef = useRef(fn);
  fnRef.current = fn;
  const onSuccessRef = useRef(options?.onSuccess);
  onSuccessRef.current = options?.onSuccess;

  const run = useCallback(async (args?: TArgs): Promise<TResult> => {
    setState({ isPending: true, error: null });
    try {
      const data = await fnRef.current(args as TArgs);
      await onSuccessRef.current?.(data, args as TArgs);
      setState({ isPending: false, error: null });
      return data;
    } catch (err) {
      setState({ isPending: false, error: err as Error });
      throw err;
    }
  }, []);

  return {
    mutate: (args?: TArgs) => {
      void run(args);
    },
    mutateAsync: run,
    isPending: state.isPending,
    error: state.error,
    reset: () => setState({ isPending: false, error: null }),
  };
}
