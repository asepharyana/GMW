import type { Router } from "express";
import express from "express";
import { collectDefaultMetrics, register } from "prom-client";
import { handleHealthCheck, handleMetrics } from "./health.controller.js";

// Initialize default Node.js runtime metrics (event loop lag, memory, GC, etc.)
// Called once at module load, not per-request.
collectDefaultMetrics();

export function createHealthRouter(): Router {
  const router = express.Router();

  // GET /api/health
  router.get("/health", handleHealthCheck);

  // GET /api/metrics — Prometheus scrape endpoint
  router.get("/metrics", handleMetrics);

  return router;
}
