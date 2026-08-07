import useSWR from "swr";
import { moderationApi } from "@/lib/api";
import type { ModerationAction, ModerationStats } from "@/lib/types";

export function useModerationStats(initialData?: ModerationStats) {
  return useSWR<ModerationStats>(
    ["moderation-stats"],
    () => moderationApi.getStats(),
    { fallbackData: initialData },
  );
}

export function useModerationActions(
  status?: string,
  actionType?: string,
  initialData?: ModerationAction[],
) {
  const key = [
    "moderation-actions",
    status ?? "__all__",
    actionType ?? "__all__",
  ];
  return useSWR(
    key,
    async () => {
      const res = await moderationApi.listActions(100, status, actionType);
      return res.data;
    },
    {
      keepPreviousData: true,
      fallbackData:
        !status && !actionType && initialData ? initialData : undefined,
    },
  );
}
