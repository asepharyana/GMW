import { orpc } from "@/lib/orpc/client";
import type { UiState } from "@/lib/types";

export const uiStateApi = {
  get: () => orpc.uiState.get() as unknown as Promise<UiState>,

  save: (state: UiState) =>
    orpc.uiState.update(state) as unknown as Promise<{ ok: boolean }>,
};
