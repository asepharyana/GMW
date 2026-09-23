export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type: "text";
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
  autoDeleteFlaggedEnabled?: boolean;
  aiAnalysisEnabled?: boolean;
  logLevel?: string;
}
