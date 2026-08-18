import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { moderationApi } from "@/lib/api";
import type {
  CategoryAction,
  FlaggedChannel,
  FlaggedDomain,
  HourlyModeration,
  ModerationAction,
  ModerationCoverage,
  ModerationStats,
  ModerationTrends,
} from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

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

/**
 * Live moderation feed: merges the initial SWR list with actions pushed over
 * the WebSocket in real time. Returns a capped, newest-first buffer.
 * Read-only / public — no write actions.
 */
export function useLiveModeration(
  initialData: ModerationAction[] = [],
  cap = 50,
) {
  const { on: subscribe } = useWebSocket();
  const [live, setLive] = useState<ModerationAction[]>(initialData);
  const seen = useRef<Set<string>>(new Set(initialData.map((a) => a.id)));

  useEffect(() => {
    setLive(initialData);
    seen.current = new Set(initialData.map((a) => a.id));
  }, [initialData]);

  const handle = useCallback(
    (action: ModerationAction) => {
      if (seen.current.has(action.id)) return;
      seen.current.add(action.id);
      setLive((prev) => [action, ...prev].slice(0, cap));
    },
    [cap],
  );

  useEffect(() => {
    const unsub = subscribe("moderation_action", handle);
    return unsub;
  }, [subscribe, handle]);

  return live;
}

export function useModerationTrends(days = 30, initialData?: ModerationTrends) {
  return useSWR<ModerationTrends>(
    ["moderation-trends", days],
    () => moderationApi.getTrends(days),
    { fallbackData: initialData },
  );
}

export function useTopFlaggedDomains(days = 30) {
  return useSWR<FlaggedDomain[]>(["moderation-domains", days], () =>
    moderationApi.getTopDomains(days),
  );
}

export function useTopFlaggedChannels(days = 30) {
  return useSWR<FlaggedChannel[]>(["moderation-channels", days], () =>
    moderationApi.getTopChannels(days),
  );
}

export function useHourlyModeration(days = 30) {
  return useSWR<HourlyModeration[]>(["moderation-byhour", days], () =>
    moderationApi.getHourlyModeration(days),
  );
}

export function useModerationByCategory(days = 30, category: string | null) {
  return useSWR<CategoryAction[]>(
    category ? ["moderation-bycategory", days, category] : null,
    () => moderationApi.getByCategory(days, category as string),
    { keepPreviousData: true },
  );
}

export function useModerationCoverage(days = 30) {
  return useSWR<ModerationCoverage>(["moderation-coverage", days], () =>
    moderationApi.getCoverage(days),
  );
}
