import { UnauthorizedError } from "@bete/shared/errors";
import type { Router } from "express";
import express from "express";
import { config } from "../../shared/config/index.js";
import { isDashboardPublic } from "../../shared/config/runtime.js";
import { sessionAuth } from "../../shared/middlewares/index.js";

export function createConfigRouter(): Router {
  const router = express.Router();

  // GET /api/config — protected by runtime public/private mode
  // Public mode: no auth needed (frontend needs config to determine auth state)
  // Private mode: requires session-based auth
  router.get("/config", (req, res, next) => {
    if (isDashboardPublic()) {
      // Public mode — return config without auth
      return sendConfig(res);
    } else {
      // Private mode — require auth, then return config
      sessionAuth(config.ADMIN_PASSWORD)(req, res, () => sendConfig(res));
    }
  });

  return router;
}

function sendConfig(res: express.Response): void {
  if (isDashboardPublic()) {
    // Public mode — only expose safe, non-sensitive fields
    res.json({
      monitorGuildId: config.MONITOR_GUILD_ID || null,
      webserverPort: config.WEBSERVER_PORT,
      nodeEnv: config.NODE_ENV,
      dashboardIsPublic: config.DASHBOARD_IS_PUBLIC,
    });
    return;
  }
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
    dashboardIsPublic: config.DASHBOARD_IS_PUBLIC,
  });
}
