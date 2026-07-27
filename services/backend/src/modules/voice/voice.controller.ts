import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response } from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { publishCommandNoReply } from "../../shared/redis/index.js";
import type { ConnectVoiceInput, VoiceCommandInput } from "./voice.schema.js";
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

export const handleConnectVoice = asyncHandler(
  async (req: Request, res: Response) => {
    const { guildId, channelId } = req.body as ConnectVoiceInput;
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
    const { command } = req.body as VoiceCommandInput;
    logger.debug({ command }, "Publishing voice command");
    await publishCommandNoReply(command);
    res.json({ success: true, command });
  },
);
