import type { MediaState } from "@/lib/types";
import { api } from "./client";

export const mediaApi = {
  getStatus: () => api.get<MediaState>("/api/media/status"),
  queue: (source: string, mode: string) =>
    api.post<MediaState>("/api/media/queue", { source, mode }),
  skip: () => api.post<MediaState>("/api/media/skip", {}),
  stop: () => api.post<MediaState>("/api/media/stop", {}),
};
