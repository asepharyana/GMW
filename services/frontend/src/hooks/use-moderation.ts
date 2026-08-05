import useSWR from "swr";
import { moderationApi } from "@/lib/api";
import type { ModerationStats } from "@/lib/types";

export function useModerationStats() {
  return useSWR<ModerationStats>(["moderation-stats"], () =>
    moderationApi.getStats(),
  );
}

export function useModerationActions(status?: string, actionType?: string) {
  return useSWR(
    ["moderation-actions", status ?? "__all__", actionType ?? "__all__"],
    async () => {
      const res = await moderationApi.listActions(100, status, actionType);
      return res.data;
    },
    { keepPreviousData: true },
  );
}
