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
  /**
   * Authoritative shared voice snapshot — who is present / speaking right
   * now, aggregated server-side from the gateway's `voice_active_user`
   * deltas. All browsers converge on this same list.
   */
  activeSpeakers?: ActiveSpeaker[];
}

export interface ActiveSpeaker {
  userId: string;
  username: string;
  avatar?: string | null;
  speaking: boolean;
  /** Epoch ms of most recent activity. Stale speakers are auto-expired. */
  lastActiveAt?: number;
}
