import type { NextFunction, Request, Response } from "express";
import { createChildLogger } from "../../shared/logger/index.js";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { messageQuerySchema } from "./messages.schema.js";
import { messagesService } from "./messages.service.js";

const logger = createChildLogger("messages.controller");

function requireRouteParam(
  value: string | string[] | undefined,
  name: string,
): string {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`Missing route parameter: ${name}`);
  }
  return value;
}

export function handleListMessages(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = messageQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling list messages request");
    const result = await messagesService.listMessages(query);
    res.json(result);
  })(req, res, next);
}

export function handleGetMessagesByChannel(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const channelId = requireRouteParam(req.params.channelId, "channelId");
    const query = messageQuerySchema.parse(req.query);
    logger.debug({ channelId, query }, "Handling get messages by channel");
    const result = await messagesService.getMessagesByChannel(channelId, query);
    res.json(result);
  })(req, res, next);
}

export function handleGetMessageById(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const id = requireRouteParam(req.params.id, "id");
    logger.debug({ id }, "Handling get message by ID");
    const result = await messagesService.getMessageById(id);
    res.json(result);
  })(req, res, next);
}

export function handleGetAttachmentsByChannel(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const channelId = requireRouteParam(req.params.channelId, "channelId");
    const query = messageQuerySchema.parse(req.query);
    logger.debug({ channelId, query }, "Handling get attachments by channel");
    const result = await messagesService.getAttachmentsByChannel(
      channelId,
      query,
    );
    res.json(result);
  })(req, res, next);
}
