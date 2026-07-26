import type { AppConfig } from "@/lib/types";
import { api } from "./client";

export const configApi = {
  get: () => api.get<AppConfig>("/api/config"),
};
