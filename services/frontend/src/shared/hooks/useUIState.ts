import { useCallback } from "react";
import type { UIState } from "../api/client";
import { uiStateValidator, useLocalStorage } from "./useLocalStorage";

export function useUIState() {
  const { value: uiState, setValue: setUIState } = useLocalStorage<UIState>(
    "bete-dashboard-ui-state",
    uiStateValidator(),
  );

  const patchUIState = useCallback(
    (patch: Partial<UIState>) => {
      setUIState((prev) => ({ ...prev, ...patch }));
    },
    [setUIState],
  );

  return { uiState, setUIState, patchUIState, loading: false, error: null };
}
