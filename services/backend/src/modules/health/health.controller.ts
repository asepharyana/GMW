import type { Request, Response } from "express";
import { register } from "prom-client";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { healthService } from "./health.service.js";

export const handleHealthCheck = asyncHandler(
  async (req: Request, res: Response) => {
    const verbose = req.query.verbose === "true";
    const result = await healthService.getHealth(verbose);
    const status = result.status === "healthy" ? 200 : 503;
    res.status(status).json(result);
  },
);

export const handleMetrics = asyncHandler(
  async (_req: Request, res: Response) => {
    res.set("Content-Type", register.contentType);
    res.end(await register.metrics());
  },
);
