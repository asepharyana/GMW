import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import {
  getGuilds,
  getTextChannels,
  getVoiceChannels,
} from "./voice.service.js";

const logger = createChildLogger("guilds.routes");

export function createGuildsRouter(): Router {
  const router = express.Router();

  // GET /api/guilds
  router.get(
    "/",
    asyncHandler(async (_req: Request, res: Response) => {
      logger.debug("Fetching guilds");
      const guilds = await getGuilds();
      res.json(guilds);
    }),
  );

  // GET /api/guilds/:guildId/channels
  router.get(
    "/:guildId/channels",
    asyncHandler(async (req: Request, res: Response) => {
      const guildId = Array.isArray(req.params.guildId)
        ? req.params.guildId[0]
        : req.params.guildId;
      logger.debug({ guildId }, "Fetching text channels");
      const channels = await getTextChannels(guildId);
      res.json(channels);
    }),
  );

  // GET /api/guilds/:guildId/voice-channels
  router.get(
    "/:guildId/voice-channels",
    asyncHandler(async (req: Request, res: Response) => {
      const guildId = Array.isArray(req.params.guildId)
        ? req.params.guildId[0]
        : req.params.guildId;
      logger.debug({ guildId }, "Fetching voice channels");
      const channels = await getVoiceChannels(guildId);
      res.json(channels);
    }),
  );

  return router;
}
