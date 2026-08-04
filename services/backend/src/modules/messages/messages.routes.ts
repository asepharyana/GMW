import type { Request, Response, Router } from "express";
import express from "express";
import { createChildLogger } from "@/shared/logger/index";
import { asyncHandler } from "../../shared/middlewares/index.js";
import {
  handleGetAttachmentsByChannel,
  handleGetImageMessages,
  handleGetMessageById,
  handleGetMessagesByChannel,
  handleListMessages,
} from "./messages.controller.js";
import { messagesService } from "./messages.service.js";

const logger = createChildLogger("messages.routes");

export function createMessagesRouter(): Router {
  const router = express.Router();

  // GET /api/messages/images - Get messages with image attachments
  // MUST be registered BEFORE /messages/:channelId so "images" is not
  // captured as a channelId param.
  router.get("/messages/images", handleGetImageMessages);

  // GET /api/messages - List messages
  router.get("/messages", handleListMessages);

  // GET /api/messages/:channelId - Get messages by channel
  router.get("/messages/:channelId", handleGetMessagesByChannel);

  // GET /api/messages/:channelId/attachments - Get attachments by channel
  router.get("/messages/:channelId/attachments", handleGetAttachmentsByChannel);

  // GET /api/messages/detail/:id - Get single message by ID
  // (uses /detail/ prefix to avoid collision with :channelId route above)
  router.get("/messages/detail/:id", handleGetMessageById);

  // GET /api/review - Get flagged/warned messages for review
  router.get(
    "/review",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const channelId = (req.query.channelId as string) || undefined;

      const rows = await messagesService.getReviewMessages(channelId, limit);
      logger.debug({ limit, channelId }, "Review query executed");
      res.json({ results: rows, limit, cursor: null });
    }),
  );

  return router;
}
