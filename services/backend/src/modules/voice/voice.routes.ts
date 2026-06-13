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

  // GET /api/voice/status
  router.get("/voice/status", handleGetVoiceStatus);

  // POST /api/voice/connect
  router.post("/voice/connect", handleConnectVoice);

  // POST /api/voice/disconnect
  router.post("/voice/disconnect", handleDisconnectVoice);

  // POST /api/voice/command — send arbitrary voice command (transmit start/stop)
  router.post("/voice/command", handleVoiceCommand);

  return router;
}
