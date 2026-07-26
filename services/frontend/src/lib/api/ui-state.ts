import type { UiState } from "@/lib/types";
import { api } from "./client";

export const uiStateApi = {
  get: () => api.get<UiState>("/api/ui-state"),

  save: (state: UiState) => api.post<{ ok: boolean }>("/api/ui-state", state),
};
