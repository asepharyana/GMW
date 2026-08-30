import { orpc } from "@/lib/orpc/client";
import type { PaginatedRecordings, SpeakerSummary } from "@/lib/types";

export interface RecordingListParams {
  limit?: number;
  channelId?: string;
  userId?: string;
  cursor?: string;
  /** keyword search against transcription + username */
  q?: string;
  /** created_at lower bound (epoch ms) */
  startDate?: number;
  /** created_at upper bound (epoch ms) */
  endDate?: number;
}

export const recordingsApi = {
  list: (params: RecordingListParams = {}) =>
    orpc.recordings.list({
      limit: params.limit,
      channelId: params.channelId,
      userId: params.userId,
      cursor: params.cursor,
      q: params.q,
      startDate: params.startDate,
      endDate: params.endDate,
    }) as unknown as Promise<PaginatedRecordings>,

  delete: (id: string) =>
    orpc.recordings.delete({ id }) as unknown as Promise<{ ok: boolean }>,

  summary: () =>
    orpc.recordings.summary({}) as unknown as Promise<SpeakerSummary[]>,
};
