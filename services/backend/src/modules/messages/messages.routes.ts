import type { Request, Response, Router } from "express";
import express from "express";
import { getPool } from "../../shared/database/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import { asyncHandler } from "../../shared/middlewares/index.js";
import {
  handleGetAttachmentsByChannel,
  handleGetMessageById,
  handleGetMessagesByChannel,
  handleListMessages,
} from "./messages.controller.js";

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

  // POST /api/messages/:id/reanalyze - Mark message for re-analysis
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

  return router;
}
