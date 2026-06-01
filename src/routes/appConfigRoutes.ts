import type { Router } from "express";
import express from "express";
import { config } from "../config.js";

export function createAppConfigRoutes(): Router {
  const router = express.Router();

  router.get("/config", (_req, res) => {
    res.json({
      monitorGuildId: config.MONITOR_GUILD_ID ?? null,
    });
  });

  return router;
}