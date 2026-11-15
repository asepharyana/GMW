-- A message deleted while still queued was stuck there forever.
--
-- `claim_messages()` selects on
--     ai_status IN ('pending','retry_wait') AND deleted_at IS NULL
-- and nothing else ever touched `ai_status` when `deleted_at` was set. So a
-- moderator deleting a message that was still `pending` produced a row the
-- worker would never claim, nothing would ever re-pend, and no counter could
-- ever drain. The dashboard rendered exactly that row as
--
--     Queued        Deleted by moderator
--
-- which reads as "this is next in line" — and it was, permanently. Deleted
-- messages silently accumulated in the queue, so the backlog gauge overstated
-- the work outstanding by however many deletions had happened since boot, and
-- an operator chasing the backlog found only rows that could not move.
--
-- `skipped` is the correct terminal state, and it already carries exactly the
-- meaning we need (migration 0023): captured, on the dashboard, deliberately
-- not judged, never offered to a worker again. It is NOT `dead` — nothing
-- failed — and NOT `analyzed` — no verdict exists and the model never saw the
-- text, which is gone from Discord anyway.
--
-- Only UNCLAIMED rows are swept. A `claimed` row has a worker holding a lease
-- and mid-flight; it is visible to that worker, which checks `deleted_at`
-- before acting on the message, so it finishes on its own terms. Sweeping it
-- here would flip a row out from under a live lease and break the invariant
-- that `worker_id` and `ai_status='claimed'` travel together.
UPDATE messages
   SET ai_status   = 'skipped',
       worker_id   = NULL,
       lease_until = NULL
 WHERE deleted_at IS NOT NULL
   AND ai_status IN ('pending', 'retry_wait');--> statement-breakpoint

-- Every future deletion, not just the backlog cleaned up above.
--
-- A trigger rather than a change in the capture path, because both the gateway
-- (Discord's messageDelete) and the backend (a moderator deleting from the app)
-- can set `deleted_at`, and any future writer inherits the rule for free. The
-- condition is deliberately narrow: `UPDATE OF deleted_at` fires on the column
-- being named at all, so the WHEN clause is what keeps a replayed deletion
-- (already set) from touching a row that has since been analysed.
--
-- The trigger runs on the gateway's own connection and takes a row lock on that
-- one message; there is no cross-row scan here, so it cannot deadlock against
-- `claim_messages()`' UPDATE.
CREATE OR REPLACE FUNCTION public.dequeue_deleted_message() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  -- A worker holding the lease finishes on its own terms (see above).
  IF NEW.ai_status IN ('pending', 'retry_wait') THEN
    NEW.ai_status   := 'skipped';
    NEW.worker_id   := NULL;
    NEW.lease_until := NULL;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint

DROP TRIGGER IF EXISTS messages_deleted_dequeue ON public.messages;--> statement-breakpoint
CREATE TRIGGER messages_deleted_dequeue
    BEFORE UPDATE OF deleted_at ON public.messages
    FOR EACH ROW
    WHEN (NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL)
    EXECUTE FUNCTION public.dequeue_deleted_message();
