import type { Router } from "express";
import express from "express";
import { getGuilds, getTextChannels } from "./voice.service.js";

export function createGuildsRouter(): Router {
  const router = express.Router();

  // GET /api/guilds
  router.get("/", async (_req, res) => {
    const guilds = await getGuilds();
    res.json(guilds);
  });

  // GET /api/guilds/:guildId/channels
  router.get("/:guildId/channels", async (req, res) => {
    const channels = await getTextChannels(req.params.guildId);
    res.json(channels);
  });

  return router;
}
