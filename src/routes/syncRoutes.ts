import { Client } from "discord.js-selfbot-v13";
import type { Router } from "express";
import express from "express";
import { AppError } from "../errors.js";
import { createChildLogger } from "../logger.js";
import { syncSelectedChannelBacklog } from "../moderation/backlogSync.js";

const logger = createChildLogger("sync-routes");
const BACKLOG_SYNC_COOLDOWN_MS = 0;
const MAX_CONCURRENT_SYNCS = 3; // P3: cap concurrent backlogs

const recentBacklogSyncs = new Map<string, number>();
let activeSyncCount = 0;

export function shouldSkipRecentBacklogSync(
  guildId: string,
  channelId: string,
  now = Date.now(),
): boolean {
  const key = `${guildId}:${channelId}`;
  const lastSync = recentBacklogSyncs.get(key);
  if (lastSync && now - lastSync < BACKLOG_SYNC_COOLDOWN_MS) return true;
  recentBacklogSyncs.set(key, now);
  return false;
}

export function clearRecentBacklogSyncs(): void {
  recentBacklogSyncs.clear();
}

export function createSyncRoutes(client: Client): Router {
  const router = express.Router();

  // POST /api/backlog-sync - Sync message backlog for a channel
  router.post("/backlog-sync", async (req, res, next) => {
    try {
      const { guildId, channelId } = req.body as {
        guildId?: string;
        channelId?: string;
      };

      if (!guildId || !channelId) {
        throw new AppError(
          "guildId and channelId are required",
          "MISSING_BACKLOG_PARAMS",
          400,
        );
      }

      if (shouldSkipRecentBacklogSync(guildId, channelId)) {
        res.json({
          success: true,
          channelId,
          messagesSync: 0,
          queued: false,
          skipped: true,
        });
        return;
      }

      // P3: backpressure - reject if too many concurrent syncs
      if (activeSyncCount >= MAX_CONCURRENT_SYNCS) {
        res.status(429).json({
          success: false,
          error: "TOO_MANY_SYNCS",
          message: `Too many backlog syncs in progress (${activeSyncCount}/${MAX_CONCURRENT_SYNCS}). Try again later.`,
          activeSyncCount,
          maxConcurrentSyncs: MAX_CONCURRENT_SYNCS,
        });
        return;
      }

      activeSyncCount++;
      syncSelectedChannelBacklog(client, guildId, channelId)
        .then(() => {})
        .catch((error) => {
          logger.warn(
            {
              guildId,
              channelId,
              error: error instanceof Error ? error.message : String(error),
            },
            "Backlog sync failed",
          );
        })
        .finally(() => {
          activeSyncCount--;
        });

      res.json({
        success: true,
        channelId,
        messagesSync: 0,
        queued: true,
        skipped: false,
      });
    } catch (error) {
      next(error);
    }
  });

  // GET /api/backlog-sync/status - Get current backlog sync status
  router.get("/backlog-sync/status", (_req, res) => {
    res.json({
      activeSyncCount,
      maxConcurrentSyncs: MAX_CONCURRENT_SYNCS,
    });
  });

  return router;
}
