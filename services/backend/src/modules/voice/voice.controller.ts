import type { Request, Response } from "express";
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

export async function handleConnectVoice(req: Request, res: Response) {
  const guildId = Array.isArray(req.body.guildId)
    ? req.body.guildId[0]
    : req.body.guildId;
  const channelId = Array.isArray(req.body.channelId)
    ? req.body.channelId[0]
    : req.body.channelId;
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
  const guildId = Array.isArray(req.params.guildId)
    ? req.params.guildId[0]
    : req.params.guildId;
  const channels = await getVoiceChannels(guildId);
  res.json(channels);
}
