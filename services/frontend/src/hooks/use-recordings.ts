import { useEffect } from "react";
import useSWR, { useSWRConfig } from "swr";
import { useAction } from "@/hooks/use-action";
import { type RecordingListParams, recordingsApi } from "@/lib/api/recordings";
import type {
  PaginatedRecordings,
  SpeakerSummary,
  VoiceRecording,
} from "@/lib/types";
import type { WsHook } from "@/lib/ws-hook";

const RECORDINGS_PREFIX = "recordings";
const RECORDINGS_SUMMARY_KEY = ["recordings", "summary"] as const;

export interface RecordingsFilter {
  channelId?: string;
  userId?: string;
  /** keyword search */
  q?: string;
  startDate?: number;
  endDate?: number;
}

function recordingsKey(filter: RecordingsFilter = {}): unknown[] {
  return [
    RECORDINGS_PREFIX,
    "list",
    filter.channelId ?? "",
    filter.userId ?? "",
    filter.q ?? "",
    filter.startDate ?? "",
    filter.endDate ?? "",
  ];
}

/** Match every recordings-list cache key so mutation/sync hits all filters. */
function isRecordingsListKey(key: unknown): boolean {
  return (
    Array.isArray(key) &&
    key.length === 7 &&
    key[0] === RECORDINGS_PREFIX &&
    key[1] === "list"
  );
}

function baseParams(filter: RecordingsFilter = {}): RecordingListParams {
  return {
    channelId: filter.channelId,
    userId: filter.userId,
    q: filter.q,
    startDate: filter.startDate,
    endDate: filter.endDate,
  };
}

export function useRecordingsPage(
  initialPage?: PaginatedRecordings,
  filter: RecordingsFilter = {},
) {
  return useSWR<PaginatedRecordings>(
    recordingsKey(filter),
    () => recordingsApi.list({ ...baseParams(filter), limit: 50 }),
    // fallbackData only applies to the unfiltered "all" view; a filtered cache
    // must not be pre-seeded with unfiltered rows (would flash wrong data).
    {
      fallbackData:
        filter.channelId ||
        filter.userId ||
        filter.q ||
        filter.startDate ||
        filter.endDate
          ? undefined
          : initialPage,
    },
  );
}

export function useRecordings(
  initialPage?: PaginatedRecordings,
  filter: RecordingsFilter = {},
) {
  const page = useRecordingsPage(initialPage, filter);
  return {
    ...page,
    data: page.data?.items,
    nextCursor: page.data?.nextCursor ?? null,
    hasMore: page.data?.hasMore ?? false,
    refetch: () => page.mutate(),
  };
}

export function useLoadMoreRecordings(filter: RecordingsFilter = {}) {
  const { mutate } = useSWRConfig();
  return useAction(async ({ cursor }: { cursor: string }) => {
    const result = await recordingsApi.list({
      ...baseParams(filter),
      limit: 50,
      cursor,
    });
    await mutate(
      recordingsKey(filter),
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
  });
}

export function useDeleteRecording() {
  const { mutate } = useSWRConfig();
  return useAction((id: string) => recordingsApi.delete(id), {
    onSuccess: (_, id) => {
      // A deleted recording disappears from every filter view.
      void mutate(
        (key: unknown) => isRecordingsListKey(key),
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
      // Leaderboard totals shifted — refresh.
      void mutate(RECORDINGS_SUMMARY_KEY);
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
        (key: unknown) => isRecordingsListKey(key),
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
      void mutate(RECORDINGS_SUMMARY_KEY);
    });
    return unsub;
  }, [ws, mutate]);
}

export function useRecordingsSummary() {
  return useSWR<SpeakerSummary[]>(RECORDINGS_SUMMARY_KEY, () =>
    recordingsApi.summary(),
  );
}
