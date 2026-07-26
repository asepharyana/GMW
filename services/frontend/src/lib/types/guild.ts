export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: "voice" | "text";
}

/** Shape of the /api/config response (camelCase keys from backend). */
export interface AppConfig {
  monitorGuildId: string | null;
  webserverPort?: number;
  nodeEnv?: string;
  backlogSyncHours?: number;
  backlogSyncBatchSize?: number;
  retentionMessagesDays?: number;
  retentionAttachmentsDays?: number;
  retentionVoiceDays?: number;
  autoDeleteFlaggedEnabled?: boolean;
  aiAnalysisEnabled?: boolean;
  voiceGuildId?: string | null;
  voiceChannelId?: string | null;
  logLevel?: string;
}
