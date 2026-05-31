import type { Router } from "express";
import express from "express";
import { AppError } from "../errors.js";
import {
  getAnalysisQueueStatus,
  queueMessageAnalysis,
} from "../moderation/aiAnalyzer.js";
import {
  searchMessages,
  updateMessageAIAnalysis,
} from "../moderation/messageStore.js";
import type { MessageRecord } from "../moderation/types.js";

export function createAnalysisRoutes(): Router {
  const router = express.Router();

  // GET /api/analysis/status - Get current analysis queue status
  router.get("/analysis/status", (_req, res, next) => {
    try {
      const status = getAnalysisQueueStatus();
      res.json(status);
    } catch (error) {
      next(error);
    }
  });

  // GET /api/analysis/search - Search for message IDs by query
  router.get("/analysis/search", async (req, res, next) => {
    try {
      const {
        q,
        channelId,
        limit = "20",
      } = req.query as {
        q?: string;
        channelId?: string;
        limit?: string;
      };

      if (!q) {
        throw new AppError(
          "Query parameter 'q' is required",
          "MISSING_QUERY",
          400,
        );
      }

      const limitNum = Math.min(parseInt(limit) || 20, 100);

      const results = await searchMessages({
        query: q,
        channelId,
        limit: limitNum,
      });

      res.json({
        query: q,
        count: results.length,
        results: results.map((msg: MessageRecord) => ({
          id: msg.id,
          content: msg.edited_content ?? msg.content,
          username: msg.username,
          created_at: msg.created_at,
          ai_status: msg.ai_status,
        })),
      });
    } catch (error) {
      next(error);
    }
  });

  // POST /api/messages/:id/reanalyze - Queue a message for re-analysis
  router.post("/messages/:id/reanalyze", async (req, res, next) => {
    try {
      const { id } = req.params;

      if (!id) {
        throw new AppError("Message ID is required", "MISSING_MESSAGE_ID", 400);
      }

      // P3: Single UPDATE + RETURNING instead of GET + UPDATE + GET
      const updated = await updateMessageAIAnalysis(id, {
        status: "pending",
        flags: null,
        score: null,
        analysis: null,
        analyzedAt: null,
        error: null,
      });

      if (!updated) {
        throw new AppError("Message not found", "MESSAGE_NOT_FOUND", 404);
      }

      // Queue for analysis
      await queueMessageAnalysis(id);

      res.json({
        success: true,
        messageId: id,
        queued: true,
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
