-- Remove the user reputation feature entirely (trust scores, infractions).
-- The feature was removed from the codebase; this drops the orphaned table.
DROP TABLE IF EXISTS "user_reputations";
