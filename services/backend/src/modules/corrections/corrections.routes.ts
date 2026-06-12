import { createChildLogger } from "@bete/shared/logger";
import type { Request, Response, Router } from "express";
import express from "express";
import { asyncHandler } from "../../shared/middlewares/index.js";
import { correctionsService } from "./corrections.service.js";

const logger = createChildLogger("corrections.routes");

/**
 * Prevents concurrent duplicate correction submissions
 * for the same message_id within a short window.
 */
const createInFlight = new Set<string>();

export function createCorrectionsRouter(): Router {
  const router = express.Router();

  // GET /api/corrections/stats — aggregated correction statistics
  router.get(
    "/corrections/stats",
    asyncHandler(async (_req: Request, res: Response) => {
      const stats = await correctionsService.getStats();
      res.json(stats);
    }),
  );

  // GET /api/corrections — paginated correction history
  router.get(
    "/corrections",
    asyncHandler(async (req: Request, res: Response) => {
      const limit = Number(req.query.limit) || 20;
      const cursor = (req.query.cursor as string) || undefined;

      const result = await correctionsService.list({ limit, cursor });
      res.json(result);
    }),
  );

  // POST /api/corrections — submit a new correction
  router.post(
    "/corrections",
    asyncHandler(async (req: Request, res: Response) => {
      const { message_id, original_flags, corrected_flags, correction_notes, content_snippet } = (req.body ?? {}) as {
        message_id?: string;
        original_flags?: string[];
        corrected_flags?: string[];
        correction_notes?: string;
        content_snippet?: string;
      };

      // Validation
      if (!message_id) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "message_id is required" });
        return;
      }
      if (!Array.isArray(original_flags) || original_flags.length === 0) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "original_flags must be a non-empty array" });
        return;
      }
      if (!Array.isArray(corrected_flags)) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "corrected_flags must be an array" });
        return;
      }
      if (!content_snippet) {
        res.status(400).json({ error: "VALIDATION_ERROR", message: "content_snippet is required" });
        return;
      }

      // Idempotency guard: prevent duplicate submissions for same message_id
      if (createInFlight.has(message_id)) {
        res.status(409).json({ error: "CORRECTION_IN_PROGRESS", messageId: message_id });
        return;
      }

      createInFlight.add(message_id);
      let entry;
      try {
        entry = await correctionsService.create({
          message_id,
          original_flags,
          corrected_flags,
          correction_notes,
          content_snippet,
        });
      } finally {
        // Clean up after a delay to still prevent rapid duplicates
        setTimeout(() => createInFlight.delete(message_id), 5_000);
      }

      logger.info(
        { messageId: message_id, id: entry.id },
        "Correction submitted",
      );
      res.status(201).json(entry);
    }),
  );

  return router;
}
