import type { Router } from "express";
import express from "express";
import {
  handleConnectVoice,
  handleDisconnectVoice,
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

  // POST /api/voice/command — send arbitrary voice command (transmit start/stop)
  router.post("/voice/command", handleVoiceCommand);

  return router;
}
