import type { NextFunction, Request, Response } from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { healthService } from "./health.service.js";

export function handleHealthCheck(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const verbose = req.query.verbose === "true";
    const result = await healthService.getHealth(verbose);
    const status = result.status === "healthy" ? 200 : 503;
    res.status(status).json(result);
  })(req, res, next);
}
