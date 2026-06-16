import type { GuildVoiceEntry } from "../guild/types";

export interface VoiceStatus {
  connected: boolean;
  activeGuildId: string | null;
  activeChannelId: string | null;
  activeChannelName: string | null;
  connections: GuildVoiceEntry[];
}

export interface ActiveSpeaker {
  id?: string;
  userId?: string;
  username: string;
  avatar: string;
  speaking: boolean;
}
