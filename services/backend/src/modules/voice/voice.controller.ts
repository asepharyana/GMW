import type { Request, Response } from "express";
import { publishCommandNoReply } from "../../shared/redis/index.js";
import {
  connectVoice,
  disconnectVoice,
  getVoiceChannels,
  getVoiceStatus,
} from "./voice.service.js";

export async function handleGetVoiceStatus(_req: Request, res: Response) {
  const status = await getVoiceStatus();
  res.json(status);
}

/** Safely extract a string value that may be a single string or string array. */
function asString(val: unknown): string {
  if (Array.isArray(val)) return String(val[0] ?? "");
  return String(val ?? "");
}

export async function handleConnectVoice(req: Request, res: Response) {
  const guildId = asString(req.body.guildId);
  const channelId = asString(req.body.channelId);
  if (!guildId || !channelId) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "guildId and channelId are required",
    });
  }
  const status = await connectVoice(guildId, channelId);
  res.json(status);
}

export async function handleDisconnectVoice(_req: Request, res: Response) {
  const status = await disconnectVoice();
  res.json(status);
}

export async function handleGetVoiceChannels(req: Request, res: Response) {
  const guildId = asString(req.params.guildId);
  const channels = await getVoiceChannels(guildId);
  res.json(channels);
}

export async function handleVoiceCommand(req: Request, res: Response) {
  const command = asString(req.body.command);

  if (!command) {
    return res.status(400).json({
      error: "VALIDATION_ERROR",
      message: "command is required",
    });
  }

  try {
    await publishCommandNoReply(command);
    res.json({ success: true, command });
  } catch (err) {
    res.status(500).json({
      error: "COMMAND_FAILED",
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
}
