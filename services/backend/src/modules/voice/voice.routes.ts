import type { Router } from "express";
import express from "express";

export function createVoiceRouter(): Router {
  const router = express.Router();

  // TODO: Implement voice routes
  // GET /api/voice/recordings
  // GET /api/voice/recordings/:userId
  // POST /api/voice/connect
  // POST /api/voice/disconnect

  return router;
}
