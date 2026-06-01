import type { Router } from "express";
import express from "express";
import { config } from "../../shared/config/index.js";

export function createConfigRouter(): Router {
  const router = express.Router();

  // GET /api/config
  router.get("/config", (_req, res) => {
    res.json({
      monitorGuildId: config.MONITOR_GUILD_ID || null,
    });
  });

  return router;
}
