export interface DiscordGatewayEvent {
  type: string;
  data: unknown;
  timestamp: number;
  source: string;
}

export const EventChannels = {
  MESSAGE_CREATED: "discord:message:created",
  MESSAGE_UPDATED: "discord:message:updated",
  MESSAGE_DELETED: "discord:message:deleted",
  MESSAGE_ANALYZED: "discord:message:analyzed",
  ATTACHMENT_CREATED: "discord:attachment:created",
  ATTACHMENT_UPLOADED: "discord:attachment:uploaded",
  VOICE_STARTED: "discord:voice:started",
  VOICE_STOPPED: "discord:voice:stopped",
  VOICE_UPLOADED: "discord:voice:uploaded",
  // Real-time voice streaming channels
  VOICE_ACTIVE_USER: "discord:voice:active_user", // Active speaker state updates
  VOICE_PCM: "discord:voice:pcm", // Live PCM audio data stream
  ANALYSIS_QUEUE_STATUS: "discord:analysis:queue_status",
} as const;

export type EventChannelType =
  (typeof EventChannels)[keyof typeof EventChannels];
