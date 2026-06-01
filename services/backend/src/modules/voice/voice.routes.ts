import type { Router } from "express";
import express from "express";
import {
  handleConnectVoice,
  handleDisconnectVoice,
  handleGetVoiceChannels,
  handleGetVoiceStatus,
} from "./voice.controller.js";

export function createVoiceRouter(): Router {
  const router = express.Router();

  // GET /api/status
  router.get("/status", handleGetVoiceStatus);

  // POST /api/connect
  router.post("/connect", handleConnectVoice);

  // POST /api/disconnect
  router.post("/disconnect", handleDisconnectVoice);

  // GET /api/guilds/:guildId/voice-channels
  router.get("/guilds/:guildId/voice-channels", handleGetVoiceChannels);

  return router;
}
