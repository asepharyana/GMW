export interface GuildVoiceEntry {
  guildId: string;
  channelId: string;
  channelName: string;
  connectedAt: number;
}

export interface VoiceStatus {
  connected: boolean;
  activeGuildId?: string | null;
  activeChannelId?: string | null;
  activeChannelName?: string | null;
  connections: GuildVoiceEntry[];
}

export interface ActiveSpeaker {
  id?: string | null;
  user_id: string;
  username: string;
  avatar?: string | null;
  speaking: boolean;
}
