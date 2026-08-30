import { eq } from "drizzle-orm";
import { getDatabase } from "./drizzle.js";
import {
  type VoiceAutoReconnect,
  type VoiceAutoReconnectInsert,
  voiceAutoReconnectTable,
} from "./schema.js";

/**
 * Upsert a guild's desired voice state.
 * Called after a successful connect so the gateway can rejoin after a
 * restart/reboot or unexpected drop.
 */
export async function upsertVoiceAutoReconnect(
  record: VoiceAutoReconnectInsert,
): Promise<VoiceAutoReconnect | undefined> {
  const db = getDatabase();
  const [row] = await db
    .insert(voiceAutoReconnectTable)
    .values(record)
    .onConflictDoUpdate({
      target: voiceAutoReconnectTable.guild_id,
      set: {
        channel_id: record.channel_id,
        channel_name: record.channel_name ?? null,
        connected_at: record.connected_at,
        updated_at: record.updated_at,
      },
    })
    .returning();
  return row;
}

/** List all persisted desired voice states (for startup auto-reconnect). */
export async function listVoiceAutoReconnects(): Promise<VoiceAutoReconnect[]> {
  const db = getDatabase();
  return db.select().from(voiceAutoReconnectTable);
}

/** Clear a guild's persisted voice state (explicit manual leave). */
export async function deleteVoiceAutoReconnect(guildId: string): Promise<void> {
  const db = getDatabase();
  await db
    .delete(voiceAutoReconnectTable)
    .where(eq(voiceAutoReconnectTable.guild_id, guildId));
}

/** Fetch a single guild's persisted state, if any. */
export async function getVoiceAutoReconnect(
  guildId: string,
): Promise<VoiceAutoReconnect | undefined> {
  const db = getDatabase();
  const rows = await db
    .select()
    .from(voiceAutoReconnectTable)
    .where(eq(voiceAutoReconnectTable.guild_id, guildId))
    .limit(1);
  return rows[0];
}
