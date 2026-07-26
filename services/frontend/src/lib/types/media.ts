export type MediaMode = "music" | "screen";

export interface MediaItem {
  id?: string | null;
  source: string;
  title?: string | null;
  mode?: MediaMode | null;
  durationMs?: number | null;
  thumbnailUrl?: string | null;
}

export interface MediaState {
  playing: boolean;
  musicVolume: number;
  current?: MediaItem | null;
  queue: MediaItem[];
}
