import { orpc } from "@/lib/orpc/client";
import type { AppConfig } from "@/lib/types";

export const configApi = {
  get: () => orpc.config.get() as unknown as Promise<AppConfig>,
};
