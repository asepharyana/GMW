import { orpc } from "@/lib/orpc/client";
import type { PaginatedRecordings } from "@/lib/types";

export const recordingsApi = {
  list: (
    limit?: number,
    channelId?: string,
    userId?: string,
    cursor?: string,
  ) =>
    orpc.recordings.list({
      limit,
      channelId,
      userId,
      cursor,
    }) as unknown as Promise<PaginatedRecordings>,

  delete: (id: string) =>
    orpc.recordings.delete({ id }) as unknown as Promise<{ ok: boolean }>,
};
