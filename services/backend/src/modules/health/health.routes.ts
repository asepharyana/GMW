import type { Router } from "express";
import express from "express";
import { handleHealthCheck } from "./health.controller.js";

export function createHealthRouter(): Router {
  const router = express.Router();

  // GET /api/health
  router.get("/health", handleHealthCheck);

  return router;
}
