import { useCallback, useEffect, useRef, useState } from "react";
import useSWR from "swr";
import { moderationApi } from "@/lib/api";
import type {
  ModerationAction,
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
