import { createChildLogger } from "@/shared/logger/index";
import { and, desc, eq } from "drizzle-orm";
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  messagesTable,
  type UserReputation,
  userReputationsTable,
} from "../../shared/database/schema.js";

const logger = createChildLogger("userReputationStore");

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
      trust_score: 50,
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
 * Increment the clean message streak and update trust score if threshold is met.
 */
export async function recordCleanMessage(
  userId: string,
  guildId: string,
): Promise<void> {
  const rep = await initializeUserReputation(userId, guildId);
  const db = getDatabase();
  let newStreak = rep.clean_message_streak + 1;
  let newScore = rep.trust_score;

  // Every 100 clean messages, give +2 trust score up to 100
  if (newStreak >= 100) {
    newScore = Math.min(100, newScore + 2);
    newStreak = 0;
  }

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
 */
export async function recordInfraction(
  userId: string,
  guildId: string,
  severity: "low" | "medium" | "high" | "critical",
): Promise<void> {
  const rep = await initializeUserReputation(userId, guildId);
  const db = getDatabase();
  let penalty = 0;
  switch (severity) {
    case "low":
      penalty = 2;
      break;
    case "medium":
      penalty = 5;
      break;
    case "high":
      penalty = 15;
      break;
    case "critical":
      penalty = 30;
      break;
  }

  const newScore = Math.max(0, rep.trust_score - penalty);

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
      penalty,
      newScore,
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
