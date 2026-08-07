import type { Readable } from "node:stream";
import type { StreamType } from "@discordjs/voice";

export type MediaMode = "music" | "screen";
export type MediaSourceKind =
  | "url"
  | "local"
  | "youtube"
  | "spotify"
  | "search";
export type MediaQueueItemStatus = "queued" | "playing" | "failed";

export interface ResolvedMediaSource {
  source: string;
  title: string;
  kind: MediaSourceKind;
}

export interface MediaQueueItem extends ResolvedMediaSource {
  id: string;
  mode: MediaMode;
  requestedBy: string;
  addedAt: number;
  status: MediaQueueItemStatus;
  /** Duration in seconds, if known. */
  duration?: number;
  /** Thumbnail/preview URL, if available. */
  thumbnailUrl?: string;
}

export interface MediaState {
  playing: boolean;
  activeMode: MediaMode | null;
  musicVolume: number;
  loop: boolean;
  current: MediaQueueItem | null;
  queue: MediaQueueItem[];
}

export interface QueueMediaOptions {
  mode?: MediaMode;
  requestedBy?: string;
}

export interface MusicPlayback {
  done: Promise<void>;
  stop(): void;
}

export interface MusicPlayer {
  play(source: ResolvedMediaSource): MusicPlayback;
}

export interface ScreenSharePlayback {
  done: Promise<void>;
  stop(): void;
}

export interface ScreenShareVoiceStatus {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
}

export interface ScreenShareController {
  isActive(): boolean;
  start(source: string): Promise<ScreenSharePlayback>;
}

export type DiscordPlayerOwner = "none" | "browser-bridge" | "music" | "screen";

export interface DiscordPlayOptions {
  inputType?: StreamType;
  /** Enable volume control via resource.volume (required for setMusicVolume to work). */
  inlineVolume?: boolean;
  volume?: number;
}

export interface DiscordAudioPlayer {
  getOwner(): DiscordPlayerOwner;
  isConnected(): boolean;
  playStream(
    stream: Readable,
    owner: DiscordPlayerOwner,
    options?: DiscordPlayOptions,
  ): void;
  pause(owner?: DiscordPlayerOwner): void;
  unpause(owner?: DiscordPlayerOwner): boolean;
  stop(owner?: DiscordPlayerOwner): void;
  getMusicVolume(): number;
  setMusicVolume(volume: number): void;
}
