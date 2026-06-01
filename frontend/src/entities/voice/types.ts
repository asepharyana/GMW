export interface VoiceStatus {
  connected: boolean;
  activeGuildId?: string | null;
  activeChannelId?: string | null;
  activeChannelName?: string | null;
}

export interface ActiveSpeaker {
  id?: string;
  userId?: string;
  username: string;
  avatar: string;
  speaking: boolean;
}
