import { createChildLogger } from "@/shared/logger/index";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler, validateBody } from "../../shared/middlewares/index.js";
import {
  handleConnectVoice,
  handleDisconnectVoice,
  handleGetVoiceStatus,
  handleVoiceCommand,
} from "./voice.controller.js";
import { connectVoiceSchema, voiceCommandSchema } from "./voice.schema.js";
import {
  getGuilds,
  getTextChannels,
  getVoiceChannels,
} from "./voice.service.js";

const logger = createChildLogger("voice.routes");

export function createVoiceRouter(): Router {
  const router = express.Router();

  // ── Guilds ──────────────────────────────────────────────────────────────

  // GET /api/guilds
  router.get(
    "/guilds",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Fetching guilds");
      const guilds = await getGuilds();
      res.json(guilds);
    }),
  );

  // GET /api/guilds/:guildId/channels
  router.get(
    "/guilds/:guildId/channels",
    asyncHandler(async (req: Request, res: Response) => {
      const guildId = req.params.guildId as string;
      logger.debug({ guildId }, "Fetching text channels");
      const channels = await getTextChannels(guildId);
      res.json(channels);
    }),
  );

  // GET /api/guilds/:guildId/voice-channels
  router.get(
    "/guilds/:guildId/voice-channels",
    asyncHandler(async (req: Request, res: Response) => {
      const guildId = req.params.guildId as string;
      logger.debug({ guildId }, "Fetching voice channels");
      const channels = await getVoiceChannels(guildId);
      res.json(channels);
    }),
  );

  // ── Voice connection ────────────────────────────────────────────────────

  // GET /api/voice/status
  router.get("/voice/status", handleGetVoiceStatus);

  // POST /api/voice/connect
  router.post(
    "/voice/connect",
    validateBody(connectVoiceSchema),
    handleConnectVoice,
  );

  // POST /api/voice/disconnect
  router.post("/voice/disconnect", handleDisconnectVoice);

  // POST /api/voice/command — send arbitrary voice command (transmit start/stop)
  router.post(
    "/voice/command",
    validateBody(voiceCommandSchema),
    handleVoiceCommand,
  );

  return router;
}
