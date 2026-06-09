import { eq } from "drizzle-orm";
import { getDatabase } from "../../shared/database/drizzle.js";
import {
  ChannelCulture,
  channelCulturesTable,
} from "../../shared/database/schema.js";

/**
 * Fetch the AI-generated culture summary for a channel.
 */
export async function getChannelCulture(
  channelId: string,
): Promise<ChannelCulture | null> {
  const db = getDatabase();
  const existing = await db
    .select()
    .from(channelCulturesTable)
    .where(eq(channelCulturesTable.channel_id, channelId))
    .limit(1);

  return existing[0] || null;
}

/**
 * Update the AI-generated culture summary for a channel.
 */
export async function updateChannelCulture(
  channelId: string,
  guildId: string,
  cultureSummary: string,
): Promise<void> {
  const db = getDatabase();

  await db
    .insert(channelCulturesTable)
    .values({
      channel_id: channelId,
      guild_id: guildId,
      culture_summary: cultureSummary,
      last_analyzed_at: Date.now(),
    })
    .onConflictDoUpdate({
      target: channelCulturesTable.channel_id,
      set: {
        culture_summary: cultureSummary,
        last_analyzed_at: Date.now(),
      },
    });
}
