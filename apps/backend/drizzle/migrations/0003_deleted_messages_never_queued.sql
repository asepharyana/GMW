-- A deleted message can be put back into the queue by anything that writes
-- `ai_status`, and nothing stopped it.
--
-- Migration 0002 covered the one path it could see: `deleted_at` being SET on a
-- row that was already queued. It did that with `BEFORE UPDATE OF deleted_at`,
-- which fires only when the deletion column itself is written. Every other
-- writer of `ai_status` was left free to re-queue a deleted row, and three of
-- them do exactly that:
--
--   * the worker's retry path (`persist` -> `retry_wait`, and
--     `handleLlmFailure` -> `retry_wait`), when a moderator deletes a message
--     while its batch is in flight. The trigger had already run (or never
--     fired), the worker then wrote `retry_wait` over the deletion, and the row
--     became invisible to `claim_messages()` — which selects only
--     `deleted_at IS NULL` — and invisible to every counter, forever;
--   * `reclaim_expired_claims()`, which resets any expired `claimed` row to
--     `pending` without looking at `deleted_at`. A message deleted while
--     claimed is left `claimed` by 0002 on purpose (a live lease must not be
--     flipped), so it reaches this function on every worker restart;
--   * an edit arriving after a dashboard deletion, which sets `ai_status`
--     back to `pending` in `updateMessageAsEdited`.
--
-- Measured on production 2026-11-27: 9 of 9 `retry_wait` rows had
-- `deleted_at IS NOT NULL` and 0 of them were claimable. That is the same
-- phantom-queue state 0002 exists to prevent — `Queued` + `Deleted by
-- moderator` on one card, permanently — reached from the other direction.
--
-- So the invariant moves into the database, where every current and future
-- writer inherits it: a row may not be both deleted and queued. The WHEN clause
-- keeps the trigger off the hot path — `claim_messages()` writes 25 rows a
-- cycle with `deleted_at` NULL, so the executor never invokes the function.
--
-- This is not `dead` (nothing failed) and not `analyzed` (no verdict exists, and
-- the model never saw text that is gone from Discord). `skipped` already means
-- exactly this: captured, on the dashboard, deliberately not judged, never
-- offered to a worker again.

-- Sweep the backlog the three paths above already produced.
UPDATE messages
   SET ai_status   = 'skipped',
       worker_id   = NULL,
       lease_until = NULL
 WHERE deleted_at IS NOT NULL
   AND ai_status IN ('pending', 'retry_wait');--> statement-breakpoint

CREATE OR REPLACE FUNCTION public.dequeue_deleted_message_any_write() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  NEW.ai_status   := 'skipped';
  NEW.worker_id   := NULL;
  NEW.lease_until := NULL;
  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS messages_deleted_never_queued ON public.messages;--> statement-breakpoint
CREATE TRIGGER messages_deleted_never_queued
    BEFORE INSERT OR UPDATE ON public.messages
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NOT NULL AND NEW.ai_status IN ('pending', 'retry_wait'))
    EXECUTE FUNCTION public.dequeue_deleted_message_any_write();
