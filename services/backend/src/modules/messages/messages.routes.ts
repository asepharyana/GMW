import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import {
  handleGetAttachmentsByChannel,
  handleGetMessageById,
  handleGetMessagesByChannel,
  handleListMessages,
} from "./messages.controller.js";
import { messagesService } from "./messages.service.js";

const logger = createChildLogger("messages.routes");

/**
 * Per-message in-flight guard for the single reanalyze endpoint.
 * Prevents concurrent spam-clicks from issuing duplicate UPDATE + recovery
 * worker triggers for the same message.
 */
const reanalyzeInFlight = new Set<string>();

/**
 * Per-scope in-flight guard for the batch reanalyze endpoint.
 * Scope key = "guildId:channelId" (empty string used for undefined parts).
 * Two concurrent batch-reanalyze requests for the same scope are rejected
 * with 409 so the recovery worker is not triggered multiple times for the
 * same set of error messages.
 */
const reanalyzeBatchInFlight = new Set<string>();

export function createMessagesRouter(): Router {
  const router = express.Router();

  // GET /api/messages - List messages
  router.get("/messages", handleListMessages);

  // GET /api/messages/:channelId - Get messages by channel
  router.get("/messages/:channelId", handleGetMessagesByChannel);

  // GET /api/messages/:channelId/attachments - Get attachments by channel
  router.get("/messages/:channelId/attachments", handleGetAttachmentsByChannel);

  // GET /api/messages/detail/:id - Get single message by ID
  // (uses /detail/ prefix to avoid collision with :channelId route above)
  router.get("/messages/detail/:id", handleGetMessageById);

  // POST /api/messages/reanalyze-batch — Bulk retry all errored messages
  // MUST be registered BEFORE /messages/:id/reanalyze so "reanalyze-batch"
  // is not captured as an :id param.
  router.post(
    "/messages/reanalyze-batch",
    asyncHandler(async (req: Request, res: Response) => {
      const { guildId, channelId, messageIds } = (req.body ?? {}) as {
        guildId?: string;
        channelId?: string;
        messageIds?: string[];
      };

      // Idempotency guard: one concurrent batch-reanalyze per scope.
      // Prevents two admin sessions clicking simultaneously from each
      // triggering the recovery worker for the same set of messages.
      const scopeKey = `${guildId ?? ""}:${channelId ?? ""}`;
      if (reanalyzeBatchInFlight.has(scopeKey)) {
        res
          .status(409)
          .json({ error: "REANALYZE_BATCH_IN_PROGRESS", scope: scopeKey });
        return;
      }

      reanalyzeBatchInFlight.add(scopeKey);
      let count = 0;
      try {
        count = await messagesService.reanalyzeErrorBatch({
          guildId,
          channelId,
          messageIds,
        });
      } finally {
        reanalyzeBatchInFlight.delete(scopeKey);
      }

      logger.info({ count, guildId, channelId }, "Batch reanalyze completed");
      res.status(200).json({ ok: true, count });
    }),
  );

  // POST /api/messages/:id/reanalyze - Mark single message for re-analysis
  router.post(
    "/messages/:id/reanalyze",
    asyncHandler(async (req: Request, res: Response) => {
      const id = String(req.params.id ?? "");
      if (!id) {
        res.status(400).json({ error: "MISSING_ID" });
        return;
      }

      // Idempotency guard: reject concurrent duplicate requests for the same ID.
      if (reanalyzeInFlight.has(id)) {
        res.status(409).json({ error: "REANALYZE_IN_PROGRESS", messageId: id });
        return;
      }

      reanalyzeInFlight.add(id);
      try {
        await messagesService.markForReanalysis(id);
      } finally {
        reanalyzeInFlight.delete(id);
      }

      res.status(200).json({ ok: true });
    }),
  );

  // GET /api/review - Get flagged/warned messages for review
  router.get(
    "/review",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const channelId = (req.query.channelId as string) || undefined;

      const rows = await messagesService.getReviewMessages(channelId, limit);
      logger.debug({ limit, channelId }, "Review query executed");
      res.json({ results: rows, limit, cursor: null });
    }),
  );

  return router;
}
