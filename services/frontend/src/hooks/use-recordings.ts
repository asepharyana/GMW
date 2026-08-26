import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { recordingsApi } from "@/lib/api";
import type { PaginatedRecordings, VoiceRecording } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

const RECORDINGS_KEY = ["recordings"] as const;

export function useRecordingsPage(initialPage?: PaginatedRecordings) {
  return useSWR<PaginatedRecordings>(
    RECORDINGS_KEY,
    () => recordingsApi.list(50),
    { fallbackData: initialPage },
  );
}

export function useRecordings(initialPage?: PaginatedRecordings) {
  const page = useRecordingsPage(initialPage);
  return {
    ...page,
    data: page.data?.items,
    nextCursor: page.data?.nextCursor ?? null,
    hasMore: page.data?.hasMore ?? false,
    refetch: () => page.mutate(),
  };
}

export function useLoadMoreRecordings() {
  const { mutate } = useSWRConfig();
  return useAction(
    async ({
      channelId,
      userId,
      cursor,
    }: {
      channelId?: string;
      userId?: string;
      cursor: string;
    }) => {
      const result = await recordingsApi.list(50, channelId, userId, cursor);
      await mutate(
        RECORDINGS_KEY,
        (old: PaginatedRecordings | undefined): PaginatedRecordings => {
          if (!old) return result;
          const existingIds = new Set(old.items.map((r) => r.id));
          const newUnique = result.items.filter((r) => !existingIds.has(r.id));
          return {
            items: [...old.items, ...newUnique],
            nextCursor: result.nextCursor,
            hasMore: result.hasMore,
          };
        },
        { revalidate: false },
      );
      return result;
    },
  );
}

export function useDeleteRecording() {
  const { mutate } = useSWRConfig();
  return useAction((id: string) => recordingsApi.delete(id), {
    onSuccess: (_, id) => {
      void mutate(
        RECORDINGS_KEY,
        (
          old: PaginatedRecordings | undefined,
        ): PaginatedRecordings | undefined => {
          if (!old) return old;
          return {
            ...old,
            items: old.items.filter((r) => r.id !== id),
          };
        },
        { revalidate: false },
      );
    },
  });
}

export function useRecordingsWsSync(ws: WsHook) {
  const { mutate } = useSWRConfig();
  useEffect(() => {
    const unsub = ws.on("voice_recording_uploaded", (data) => {
      const rec = data as VoiceRecording;
      void mutate(
        RECORDINGS_KEY,
        (old: PaginatedRecordings | undefined): PaginatedRecordings => {
          if (!old) return { items: [rec], nextCursor: null, hasMore: false };
          if (old.items.some((r) => r.id === rec.id)) return old;
          return {
            ...old,
            items: [rec, ...old.items],
          };
        },
        { revalidate: false },
      );
    });
    return unsub;
  }, [ws, mutate]);
}
