import type { Request, Response } from "express";
import { createChildLogger } from "@/shared/logger/index";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { messageQuerySchema } from "./messages.schema.js";
import { messagesService } from "./messages.service.js";

const logger = createChildLogger("messages.controller");

export const handleListMessages = asyncHandler(
  async (req: Request, res: Response) => {
    const query = messageQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling list messages request");
    const result = await messagesService.listMessages(query);
    res.json(result);
  },
);

export const handleGetMessagesByChannel = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.params.channelId) {
      res.status(400).json({ error: "Missing route parameter: channelId" });
      return;
    }
    const channelId = req.params.channelId as string;
    const query = messageQuerySchema.parse(req.query);
    logger.debug({ channelId, query }, "Handling get messages by channel");
    const result = await messagesService.getMessagesByChannel(channelId, query);
    res.json(result);
  },
);

export const handleGetMessageById = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.params.id) {
      res.status(400).json({ error: "Missing route parameter: id" });
      return;
    }
    const id = req.params.id as string;
    logger.debug({ id }, "Handling get message by ID");
    const result = await messagesService.getMessageById(id);
    res.json(result);
  },
);

export const handleGetImageMessages = asyncHandler(
  async (req: Request, res: Response) => {
    const guildId = req.query.guildId as string | undefined;
    if (!guildId) {
      res.status(400).json({ error: "Missing query parameter: guildId" });
      return;
    }
    const limit = Number(req.query.limit) || 50;
    logger.debug({ guildId, limit }, "Handling get image messages");
    const result = await messagesService.getImageMessages(guildId, limit);
    res.json(result);
  },
);

export const handleGetAttachmentsByChannel = asyncHandler(
  async (req: Request, res: Response) => {
    if (!req.params.channelId) {
      res.status(400).json({ error: "Missing route parameter: channelId" });
      return;
    }
    const channelId = req.params.channelId as string;
    const query = messageQuerySchema.parse(req.query);
    logger.debug({ channelId, query }, "Handling get attachments by channel");
    const result = await messagesService.getAttachmentsByChannel(
      channelId,
      query,
    );
    res.json(result);
  },
);
