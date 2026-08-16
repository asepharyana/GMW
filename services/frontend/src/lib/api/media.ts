import { orpc } from "@/lib/orpc/client";
import type { MediaState } from "@/lib/types";

export const mediaApi = {
  getStatus: () => orpc.media.status() as unknown as Promise<MediaState>,
  queue: (source: string, mode: string) =>
    orpc.media.queue({ source, mode }) as unknown as Promise<MediaState>,
  skip: () => orpc.media.skip() as unknown as Promise<MediaState>,
  stop: () => orpc.media.stop() as unknown as Promise<MediaState>,
  loop: (loop: boolean) =>
    orpc.media.loop({ loop }) as unknown as Promise<MediaState>,
};
