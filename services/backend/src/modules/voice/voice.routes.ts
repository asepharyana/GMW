import type { Router } from "express";
import express from "express";
import {
  handleConnectVoice,
  handleDisconnectVoice,
  handleGetVoiceChannels,
  handleGetVoiceStatus,
  handleVoiceCommand,
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

  // POST /api/command — send arbitrary voice command (transmit start/stop)
  router.post("/command", handleVoiceCommand);

  return router;
}
