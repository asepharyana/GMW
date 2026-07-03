import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { publishCommandNoReply } from "../../shared/redis/index.js";
import {
  connectVoice,
  disconnectVoice,
  getVoiceStatus,
} from "./voice.service.js";

const logger = createChildLogger("voice.controller");

export const handleGetVoiceStatus = asyncHandler(
  async (_req: Request, res: Response) => {
    const status = await getVoiceStatus();
    res.json(status);
  },
);

/** Safely extract a string value that may be a single string or string array. */
function asString(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? "");
  return String(val ?? "");
}

export const handleConnectVoice = asyncHandler(
  async (req: Request, res: Response) => {
    const guildId = asString(req.body.guildId);
    const channelId = asString(req.body.channelId);
    if (!guildId || !channelId) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "guildId and channelId are required",
      });
    }
    logger.debug({ guildId, channelId }, "Connecting to voice channel");
    const status = await connectVoice(guildId, channelId);
    res.json(status);
  },
);

export const handleDisconnectVoice = asyncHandler(
  async (_req: Request, res: Response) => {
    logger.debug("Disconnecting from voice");
    const status = await disconnectVoice();
    res.json(status);
  },
);

export const handleVoiceCommand = asyncHandler(
  async (req: Request, res: Response) => {
    const command = asString(req.body.command);

    if (!command) {
      return res.status(400).json({
        error: "VALIDATION_ERROR",
        message: "command is required",
      });
    }

    logger.debug({ command }, "Publishing voice command");
    await publishCommandNoReply(command);
    res.json({ success: true, command });
  },
);
