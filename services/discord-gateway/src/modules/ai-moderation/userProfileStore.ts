import { createChildLogger } from "@bete/shared/logger";
import { eq } from "drizzle-orm";
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  UserProfile,
  userProfilesTable,
} from "../../shared/database/schema.js";

const logger = createChildLogger("userProfileStore");

/**
 * Fetch the AI-generated profile summary for a user.
 */
export async function getUserProfile(
  userId: string,
): Promise<UserProfile | null> {
  const db = getDatabase();
  const existing = await db
    .select()
    .from(userProfilesTable)
    .where(eq(userProfilesTable.user_id, userId))
    .limit(1);

  if (existing[0]) {
    logger.debug({ userId }, "User profile lookup: found");
  } else {
    logger.debug({ userId }, "User profile lookup: not found");
  }
  return existing[0] || null;
}

/**
 * Update the AI-generated profile summary for a user.
 */
export async function updateUserProfile(
  userId: string,
  guildId: string,
  profileSummary: string,
): Promise<void> {
  const db = getDatabase();

  await db
    .insert(userProfilesTable)
    .values({
      user_id: userId,
      guild_id: guildId,
      profile_summary: profileSummary,
      last_analyzed_at: Date.now(),
    })
    .onConflictDoUpdate({
      target: userProfilesTable.user_id,
      set: {
        profile_summary: profileSummary,
        last_analyzed_at: Date.now(),
      },
    });

  logger.debug(
    { userId, guildId, profileSummary },
    "User profile updated",
  );
}
