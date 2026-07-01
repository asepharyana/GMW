export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type?: string;
  parentId?: string | null;
}

export interface GuildVoiceEntry {
  guildId: string;
  channelId: string;
  channelName: string;
  connectedAt: number;
}
