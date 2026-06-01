import type { Router } from "express";
import express from "express";
import {
  handleGetAttachmentsByChannel,
  handleGetMessageById,
  handleGetMessagesByChannel,
  handleListMessages,
} from "../messages.controller.js";

export function createMessagesRouter(): Router {
  const router = express.Router();

  // GET /api/messages - List messages
  router.get("/messages", handleListMessages);

  // GET /api/messages/:channelId - Get messages by channel
  router.get("/messages/:channelId", handleGetMessagesByChannel);

  // GET /api/messages/:channelId/attachments - Get attachments by channel
  router.get("/messages/:channelId/attachments", handleGetAttachmentsByChannel);

  // GET /api/messages/:id - Get single message by ID
  router.get("/messages/:id", handleGetMessageById);

  return router;
}
