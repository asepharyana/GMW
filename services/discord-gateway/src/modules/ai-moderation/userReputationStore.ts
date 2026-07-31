import { and, desc, eq } from "drizzle-orm";
import { createChildLogger } from "@/shared/logger/index";
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  messagesTable,
  type UserReputation,
  userReputationsTable,
} from "../../shared/database/schema.js";

const logger = createChildLogger("userReputationStore");

// ---------------------------------------------------------------------------
// Trust model v2 — fair, recoverable, escalation-aware
// ---------------------------------------------------------------------------
//
// Problems with v1 that this fixes:
//  1. Trust practically could NOT rise: +2 per 100 clean messages meant a
//     single -15 "high" penalty required 750 clean messages to repay.
//  2. Flat penalties regardless of history: first-timers and repeat
//     offenders were punished identically.
//  3. Minor infractions could zero out a user (low=-2 at score 2 → 0),
//     which is disproportionate.
//
// v2 model:
//  - GAIN:  +1 trust per 15 consecutive clean messages (cap 100). Recovery
//    is real but earned — consistent good behavior rebuilds trust.
//  - PENALTY: severity table low=3 / medium=6 / high=12 / critical=25.
//  - FIRST OFFENSE: penalty halved (leniency for a single slip).
//  - REPEAT OFFENDER: infraction within the last 7 days → ×1.5 (escalation).
//  - FLOOR: low/medium infractions cannot push trust below 10/5 — minor
//    offenses never permanently cripple a user; high/critical can still
//    zero out (severe behavior has severe consequences).
//  - Streak resets on infraction; time-based recovery still happens through
//    the clean-message gain (no arbitrary idle-decay).
// ---------------------------------------------------------------------------

export const TRUST_DEFAULTS = {
  DEFAULT_TRUST: 50,
  MAX_TRUST: 100,
  MIN_TRUST: 0,
  CLEAN_MESSAGES_PER_POINT: 15,
  REPEAT_OFFENSE_WINDOW_MS: 7 * 24 * 60 * 60 * 1000, // 7 days
  REPEAT_OFFENSE_MULTIPLIER: 1.5,
} as const;

export const INFRACTION_PENALTIES: Record<
  "low" | "medium" | "high" | "critical",
  number
> = {
  low: 3,
  medium: 6,
  high: 12,
  critical: 25,
};

/** Trust floors per severity — minor offenses can't tank a user to zero. */
export const INFRACTION_FLOORS: Record<
  "low" | "medium" | "high" | "critical",
  number
> = {
  low: 10,
  medium: 5,
  high: 0,
  critical: 0,
};

function clampTrust(score: number): number {
  return Math.min(
    TRUST_DEFAULTS.MAX_TRUST,
    Math.max(TRUST_DEFAULTS.MIN_TRUST, Math.round(score)),
  );
}

export interface InfractionContext {
  totalInfractions: number;
  lastInfractionAt: number | null;
  severity: "low" | "medium" | "high" | "critical";
  now?: number;
}

export interface InfractionOutcome {
  penalty: number;
  appliedRules: {
    firstOffense: boolean;
    repeatEscalation: boolean;
  };
}

/**
 * Pure penalty computation for the trust model (unit-testable, no DB).
 * - First offense ever → halved (leniency for a single slip).
 * - Repeat offense within the 7-day window → ×1.5 (escalation).
 */
export function computeInfractionPenalty(
  ctx: InfractionContext,
): InfractionOutcome {
  const basePenalty = INFRACTION_PENALTIES[ctx.severity];
  let penalty = basePenalty;
  const isFirstOffense = ctx.totalInfractions === 0;

  if (isFirstOffense) {
    penalty = Math.ceil(basePenalty / 2);
  } else if (
    ctx.lastInfractionAt &&
    (ctx.now ?? Date.now()) - ctx.lastInfractionAt <=
      TRUST_DEFAULTS.REPEAT_OFFENSE_WINDOW_MS
  ) {
    penalty = Math.ceil(basePenalty * TRUST_DEFAULTS.REPEAT_OFFENSE_MULTIPLIER);
  }

  return {
    penalty,
    appliedRules: {
      firstOffense: isFirstOffense,
      repeatEscalation: !isFirstOffense && penalty > basePenalty,
    },
  };
}

export interface CleanGainOutcome {
  newStreak: number;
  trustGain: number;
}

/**
 * Pure clean-message gain computation (unit-testable, no DB).
 * +1 trust every CLEAN_MESSAGES_PER_POINT consecutive clean messages;
 * the streak keeps counting past the threshold (gains compound).
 */
export function computeCleanTrustGain(currentStreak: number): CleanGainOutcome {
  const newStreak = currentStreak + 1;
  const trustGain =
    newStreak % TRUST_DEFAULTS.CLEAN_MESSAGES_PER_POINT === 0 ? 1 : 0;
  return { newStreak, trustGain };
}

/**
 * Ensures a user reputation record exists.
 */
export async function initializeUserReputation(
  userId: string,
  guildId: string,
): Promise<UserReputation> {
  const db = getDatabase();
  const existing = await db
    .select()
    .from(userReputationsTable)
    .where(eq(userReputationsTable.user_id, userId))
    .limit(1);

  if (existing.length > 0) {
    logger.debug({ userId }, "Reputation record already exists");
    return existing[0];
  }

  const [inserted] = await db
    .insert(userReputationsTable)
    .values({
      user_id: userId,
      guild_id: guildId,
      trust_score: TRUST_DEFAULTS.DEFAULT_TRUST,
      clean_message_streak: 0,
      total_infractions: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    })
    .onConflictDoNothing()
    .returning();

  if (!inserted) {
    // If concurrent insert happened
    logger.debug({ userId }, "Concurrent reputation insert detected, retrying");
    const retry = await db
      .select()
      .from(userReputationsTable)
      .where(eq(userReputationsTable.user_id, userId))
      .limit(1);
    return retry[0];
  }

  logger.debug(
    { userId, trustScore: inserted.trust_score },
    "Initialized user reputation",
  );
  return inserted;
}

/**
 * Fetch a user's reputation score. Returns default 50 if none exists.
 */
export async function getUserReputation(
  userId: string,
): Promise<UserReputation | null> {
  const db = getDatabase();
  const existing = await db
    .select()
    .from(userReputationsTable)
    .where(eq(userReputationsTable.user_id, userId))
    .limit(1);

  if (existing[0]) {
    logger.debug(
      { userId, trustScore: existing[0].trust_score },
      "Fetched user reputation",
    );
  } else {
    logger.debug({ userId }, "No reputation record found, returning null");
  }
  return existing[0] || null;
}

/**
 * Increment the clean message streak and grow trust — +1 per
 * CLEAN_MESSAGES_PER_POINT consecutive clean messages (cap 100). The streak
 * keeps counting past the threshold so gains compound with continued good
 * behavior (no more wasted progress at 100, and recovery is genuinely
 * reachable after an infraction).
 */
export async function recordCleanMessage(
  userId: string,
  guildId: string,
): Promise<void> {
  const rep = await initializeUserReputation(userId, guildId);
  const db = getDatabase();
  const { newStreak, trustGain } = computeCleanTrustGain(
    rep.clean_message_streak,
  );
  const newScore =
    trustGain > 0 ? clampTrust(rep.trust_score + trustGain) : rep.trust_score;

  await db
    .update(userReputationsTable)
    .set({
      clean_message_streak: newStreak,
      trust_score: newScore,
      updated_at: Date.now(),
    })
    .where(eq(userReputationsTable.user_id, userId));

  logger.debug(
    { userId, previousScore: rep.trust_score, newScore, newStreak },
    "Clean message recorded, reputation updated",
  );
}

/**
 * Apply an infraction penalty to a user.
 *
 * Fairness rules:
 * - First offense ever → penalty halved (leniency, rounded up).
 * - Repeat offense within the 7-day window → ×1.5 (escalation).
 * - Severity floor prevents minor infractions from zeroing a user.
 * - Streak resets — trust must be re-earned through clean behavior.
 */
export async function recordInfraction(
  userId: string,
  guildId: string,
  severity: "low" | "medium" | "high" | "critical",
): Promise<void> {
  const rep = await initializeUserReputation(userId, guildId);
  const db = getDatabase();

  const outcome = computeInfractionPenalty({
    totalInfractions: rep.total_infractions,
    lastInfractionAt: rep.last_infraction_at,
    severity,
  });
  const { penalty } = outcome;

  const floor = INFRACTION_FLOORS[severity];
  const newScore = Math.max(floor, clampTrust(rep.trust_score - penalty));

  await db
    .update(userReputationsTable)
    .set({
      trust_score: newScore,
      clean_message_streak: 0, // Reset streak on infraction
      total_infractions: rep.total_infractions + 1,
      last_infraction_at: Date.now(),
      updated_at: Date.now(),
    })
    .where(eq(userReputationsTable.user_id, userId));

  logger.info(
    {
      userId,
      severity,
      basePenalty: INFRACTION_PENALTIES[severity],
      penalty,
      appliedRules: outcome.appliedRules,
      previousScore: rep.trust_score,
      newScore,
      floor,
      totalInfractions: rep.total_infractions + 1,
    },
    "Infraction recorded",
  );
}

/**
 * Fetch a user's past N flagged messages for context injection.
 */
export async function getUserRecentInfractions(
  userId: string,
  limit: number = 3,
) {
  const db = getDatabase();
  return await db
    .select({
      content: messagesTable.content,
      flags: messagesTable.ai_moderation_flags,
      severity: messagesTable.ai_severity,
      created_at: messagesTable.created_at,
    })
    .from(messagesTable)
    .where(
      and(
        eq(messagesTable.user_id, userId),
        eq(messagesTable.ai_status, "flagged"),
      ),
    )
    .orderBy(desc(messagesTable.created_at))
    .limit(limit);
}
