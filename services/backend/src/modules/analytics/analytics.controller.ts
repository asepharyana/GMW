import { createChildLogger } from "@bete/shared/logger";
import type { NextFunction, Request, Response } from "express";
import { asyncHandler, requireParam } from "../../shared/middlewares/index.js";
import { analyticsQuerySchema } from "./analytics.schema.js";
import { analyticsService } from "./analytics.service.js";

const logger = createChildLogger("analytics.controller");

export function handleGetOverview(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get overview");
    const result = await analyticsService.getOverview(query);
    res.json(result);
  })(req, res, next);
}

export function handleGetDailyTrend(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const guildId = requireParam(
      req.query.guildId,
      "query parameter",
      "guildId",
    );
    const hours = req.query.hours ? Number(req.query.hours) : 24;
    logger.debug({ guildId, hours }, "Handling get daily trend");
    const result = await analyticsService.getDailyTrend(guildId, hours);
    res.json(result);
  })(req, res, next);
}

export function handleGetHourlyStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get hourly stats");
    const result = await analyticsService.getHourlyStats(
      query.guildId,
      query.channelId,
      query.hours,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetTopViolators(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    logger.debug({ query, limit }, "Handling get top violators");
    const result = await analyticsService.getTopViolators(
      query.guildId,
      query.channelId,
      query.hours,
      limit,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetUserLeaderboard(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    const limit = req.query.limit ? Number(req.query.limit) : 10;
    logger.debug({ query, limit }, "Handling get user leaderboard");
    const result = await analyticsService.getUserLeaderboard(
      query.guildId,
      query.channelId,
      query.hours,
      limit,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetModerationStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get moderation stats");
    const result = await analyticsService.getModerationStats(
      query.guildId,
      query.channelId,
      query.hours,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetHeatmap(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get heatmap");
    const result = await analyticsService.getHeatmap(
      query.guildId,
      query.channelId,
      query.hours,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetTopics(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get topics");
    const result = await analyticsService.getTopics(
      query.guildId,
      query.channelId,
      query.hours,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetModerationActions(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    const limit = req.query.limit ? Number(req.query.limit) : 20;
    logger.debug({ query, limit }, "Handling get moderation actions");
    const result = await analyticsService.getModerationActions(
      query.guildId,
      query.channelId,
      query.hours,
      limit,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetAIStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get AI stats");
    const result = await analyticsService.getAIStats(
      query.guildId,
      query.channelId,
      query.hours,
    );
    res.json(result);
  })(req, res, next);
}

export function handleGetAttachmentStats(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  return asyncHandler(async (req: Request, res: Response) => {
    const query = analyticsQuerySchema.parse(req.query);
    logger.debug({ query }, "Handling get attachment stats");
    const result = await analyticsService.getAttachmentStats(
      query.guildId,
      query.channelId,
      query.hours,
    );
    res.json(result);
  })(req, res, next);
}
