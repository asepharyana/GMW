import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { recordingsApi } from "@/lib/api";
import type { PaginatedRecordings, VoiceRecording } from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

const RECORDINGS_PREFIX = "recordings";

function recordingsKey(userId?: string): [string, string] {
  return [RECORDINGS_PREFIX, userId ?? "all"];
}

/** Revalidate/mutate every recording cache (all filters + global list). */
function isRecordingsKey(key: unknown): boolean {
  return (
    Array.isArray(key) &&
    key.length === 2 &&
    key[0] === RECORDINGS_PREFIX &&
    typeof key[1] === "string"
  );
}

export function useRecordingsPage(
  initialPage?: PaginatedRecordings,
  userId?: string,
) {
  return useSWR<PaginatedRecordings>(
    recordingsKey(userId),
    () => recordingsApi.list(50, undefined, userId),
    // fallbackData only applies to the unfiltered "all" view; a filtered cache
    // must not be pre-seeded with unfiltered rows (would flash wrong data).
    { fallbackData: userId ? undefined : initialPage },
  );
}

export function useRecordings(
  initialPage?: PaginatedRecordings,
  userId?: string,
) {
  const page = useRecordingsPage(initialPage, userId);
  return {
    ...page,
    data: page.data?.items,
    nextCursor: page.data?.nextCursor ?? null,
    hasMore: page.data?.hasMore ?? false,
    refetch: () => page.mutate(),
  };
}

export function useLoadMoreRecordings(userId?: string) {
  const { mutate } = useSWRConfig();
  return useAction(
    async ({ channelId, cursor }: { channelId?: string; cursor: string }) => {
      const result = await recordingsApi.list(50, channelId, userId, cursor);
      await mutate(
        recordingsKey(userId),
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
      // A deleted recording disappears from every filter view.
      void mutate(
        (key: unknown) => isRecordingsKey(key),
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
      // A fresh recording should appear in every filter view it belongs to.
      void mutate(
        (key: unknown) => isRecordingsKey(key),
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
