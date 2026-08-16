import { trpc } from "@/lib/trpc/client";
import type { PaginatedRecordings } from "@/lib/types";

export const recordingsApi = {
  list: (
    limit?: number,
    channelId?: string,
    userId?: string,
    cursor?: string,
  ) =>
    trpc.recordings.list.query({
      limit,
      channelId,
      userId,
      cursor,
    }) as unknown as Promise<PaginatedRecordings>,

  delete: (id: string) =>
    trpc.recordings.delete.mutate({ id }) as unknown as Promise<{
      ok: boolean;
    }>,
};
