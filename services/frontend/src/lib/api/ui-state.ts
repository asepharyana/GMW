import { trpc } from "@/lib/trpc/client";
import type { UiState } from "@/lib/types";

export const uiStateApi = {
  get: () => trpc.uiState.get.query() as unknown as Promise<UiState>,

  save: (state: UiState) =>
    trpc.uiState.update.mutate(state) as unknown as Promise<{ ok: boolean }>,
};
