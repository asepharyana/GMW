import type { Router } from "express";
import express from "express";
import { config } from "../../shared/config/index.js";

export function createConfigRouter(): Router {
  const router = express.Router();

  // GET /api/config
  router.get("/config", (_req, res) => {
    res.json({
      monitorGuildId: config.MONITOR_GUILD_ID || null,
      webserverPort: config.WEBSERVER_PORT,
      nodeEnv: config.NODE_ENV,
      backlogSyncHours: config.BACKLOG_SYNC_HOURS,
      backlogSyncBatchSize: config.BACKLOG_SYNC_BATCH_SIZE,
      retentionMessagesDays: config.RETENTION_MESSAGES_DAYS,
      retentionAttachmentsDays: config.RETENTION_ATTACHMENTS_DAYS,
      retentionVoiceDays: config.RETENTION_VOICE_DAYS,
      autoDeleteFlaggedEnabled: config.AUTO_DELETE_FLAGGED_ENABLED,
      aiAnalysisEnabled: config.AI_ANALYSIS_ENABLED,
      voiceGuildId: config.VOICE_GUILD_ID || null,
      voiceChannelId: config.VOICE_CHANNEL_ID || null,
      logLevel: config.LOG_LEVEL,
    });
  });

  return router;
}
