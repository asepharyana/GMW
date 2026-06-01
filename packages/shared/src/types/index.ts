// Shared types for all services
export interface AppConfig {
  NODE_ENV: "development" | "production" | "test";
  LOG_LEVEL: string;
  VERBOSE: boolean;
}

export interface DatabaseConfig {
  DATABASE_URL: string;
  AUTO_MIGRATE_ON_STARTUP: boolean;
}

export interface DiscordConfig {
  DISCORD_TOKEN: string;
  MONITOR_GUILD_ID: string;
}

export interface AIConfig {
  AI_LLM_API_KEY: string;
}

export interface RedisConfig {
  REDIS_URL: string;
}

export interface WebServerConfig {
  WEBSERVER_PORT: number;
  ADMIN_PASSWORD: string;
}

export interface MessageRecord {
  id: string;
  guildId: string;
  channelId: string;
  userId: string;
  username: string;
  content: string;
  createdAt: Date;
  editedAt?: Date;
  deletedAt?: Date;
}

export interface AttachmentRecord {
  id: string;
  messageId: string;
  filename: string;
  size: number;
  mimeType: string;
  discordUrl: string;
  uploadedUrl?: string;
  uploadStatus: "pending" | "uploaded" | "failed";
  createdAt: Date;
}

export interface VoiceSegment {
  userId: string;
  sessionStart: number;
  segmentIndex: number;
  duration: number;
  filePath: string;
  createdAt: Date;
}

export interface AnalyticsData {
  totalMessages: number;
  totalAttachments: number;
  totalVoiceSegments: number;
  activeUsers: number;
  lastUpdated: Date;
}
