import type { Request, Response, Router } from "express";
import express from "express";
import { getPool } from "../../shared/database/index.js";
import { createChildLogger } from "@bete/shared/logger";
import { asyncHandler } from "../../shared/middlewares/index.js";
import {
  handleGetAttachmentsByChannel,
  handleGetMessageById,
  handleGetMessagesByChannel,
  handleListMessages,
} from "./messages.controller.js";
import { messagesService } from "./messages.service.js";

const logger = createChildLogger("messages.routes");

export function createMessagesRouter(): Router {
  const router = express.Router();

  // GET /api/messages - List messages
  router.get("/messages", handleListMessages);

  // GET /api/messages/:channelId - Get messages by channel
  router.get("/messages/:channelId", handleGetMessagesByChannel);

  // GET /api/messages/:channelId/attachments - Get attachments by channel
  router.get("/messages/:channelId/attachments", handleGetAttachmentsByChannel);

  // GET /api/messages/detail/:id - Get single message by ID
  // (uses /detail/ prefix to avoid collision with :channelId route above)
  router.get("/messages/detail/:id", handleGetMessageById);

  // POST /api/messages/reanalyze-batch — Bulk retry all errored messages
  // MUST be registered BEFORE /messages/:id/reanalyze so "reanalyze-batch"
  // is not captured as an :id param.
  router.post(
    "/messages/reanalyze-batch",
    asyncHandler(async (req: Request, res: Response) => {
      const { guildId, channelId, messageIds } = (req.body ?? {}) as {
        guildId?: string;
        channelId?: string;
        messageIds?: string[];
      };

      const count = await messagesService.reanalyzeErrorBatch({
        guildId,
        channelId,
        messageIds,
      });

      logger.info({ count, guildId, channelId }, "Batch reanalyze completed");
      res.status(200).json({ ok: true, count });
    }),
  );

  // POST /api/messages/:id/reanalyze - Mark single message for re-analysis
  router.post(
    "/messages/:id/reanalyze",
    asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "MISSING_ID" });
        return;
      }

      const pool = getPool();
      await pool.query(
        `UPDATE messages SET ai_status = 'pending' WHERE id = $1`,
        [id],
      );

      logger.debug({ id }, "Message marked for re-analysis");
      res.status(200).json({ ok: true });
    }),
  );

  // GET /api/review - Get flagged/warned messages for review
  router.get(
    "/review",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const channelId = (req.query.channelId as string) || undefined;

      const pool = getPool();

      let sqlQuery: string;
      let params: (string | number)[];
      if (channelId) {
        sqlQuery = `
          SELECT id, guild_id, channel_id, user_id, username, avatar_url,
                 content, type, created_at, ai_status, ai_severity,
                 ai_confidence, ai_analysis
          FROM messages
          WHERE ai_status IN ('warn', 'flagged')
            AND channel_id = $1
          ORDER BY created_at DESC
          LIMIT $2
        `;
        params = [channelId, limit];
      } else {
        sqlQuery = `
          SELECT id, guild_id, channel_id, user_id, username, avatar_url,
                 content, type, created_at, ai_status, ai_severity,
                 ai_confidence, ai_analysis
          FROM messages
          WHERE ai_status IN ('warn', 'flagged')
          ORDER BY created_at DESC
          LIMIT $1
        `;
        params = [limit];
      }

      const { rows } = await pool.query(sqlQuery, params);
      logger.debug({ limit, channelId }, "Review query executed");
      res.json({ results: rows, limit, cursor: null });
    }),
  );

  // POST /api/messages/:id/moderate — Trigger moderation action via DG
  router.post(
    "/messages/:id/moderate",
    asyncHandler(async (req: Request, res: Response) => {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "MISSING_ID" });
        return;
      }

      const { actionType, reason } = (req.body ?? {}) as {
        actionType?: string;
        reason?: string;
      };

      const allowedActions = [
        "delete_message",
        "warn_user",
        "kick_user",
        "ban_user",
        "mute_user",
      ];

      if (!actionType || !allowedActions.includes(actionType)) {
        res.status(400).json({
          error: "INVALID_ACTION",
          message: `actionType must be one of: ${allowedActions.join(", ")}`,
        });
        return;
      }

      // Fetch the message to get guild/user context
      const pool = getPool();
      const { rows } = await pool.query(
        `SELECT id, guild_id, channel_id, thread_id, user_id, content
         FROM messages WHERE id = $1`,
        [id],
      );

      if (rows.length === 0) {
        res.status(404).json({ error: "MESSAGE_NOT_FOUND" });
        return;
      }

      const msg = rows[0] as Record<string, unknown>;

      // Publish command to DG via Redis
      const { publishCommand } = await import("../../ws/redis-bridge.js");
      await publishCommand({
        id: crypto.randomUUID(),
        type: "moderation:action",
        payload: {
          messageId: id,
          guildId: String(msg.guild_id ?? ""),
          channelId: (msg.thread_id as string) || String(msg.channel_id ?? ""),
          userId: String(msg.user_id ?? ""),
          actionType,
          reason: reason ?? "Manual moderation from dashboard",
          requestedAt: Date.now(),
        },
      });

      logger.info({ id, actionType, reason }, "Moderation action dispatched");
      res.json({ ok: true, actionType, messageId: id });
    }),
  );

  return router;
}
