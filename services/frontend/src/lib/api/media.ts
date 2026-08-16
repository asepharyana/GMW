import { trpc } from "@/lib/trpc/client";
import type { MediaState } from "@/lib/types";

export const mediaApi = {
  getStatus: () => trpc.media.status.query() as unknown as Promise<MediaState>,
  queue: (source: string, mode: string) =>
    trpc.media.queue.mutate({ source, mode }) as unknown as Promise<MediaState>,
  skip: () => trpc.media.skip.mutate() as unknown as Promise<MediaState>,
  stop: () => trpc.media.stop.mutate() as unknown as Promise<MediaState>,
  loop: (loop: boolean) =>
    trpc.media.loop.mutate({ loop }) as unknown as Promise<MediaState>,
};
