import { trpc } from "@/lib/trpc/client";
import type { AppConfig } from "@/lib/types";

export const configApi = {
  get: () => trpc.config.get.query() as unknown as Promise<AppConfig>,
};
