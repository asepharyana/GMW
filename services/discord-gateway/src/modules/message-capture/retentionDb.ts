import { createChildLogger, type Logger } from "@bete/shared/logger";
import { and, eq, isNull, or } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "../../shared/database/schema.js";
import { retentionPoliciesTable } from "../../shared/database/schema.js";
import type { RetentionPolicy } from "../message-capture/types.js";

// ─── RetentionDb Class ──────────────────────────────────────────────────────

export class RetentionDb {
  private logger: Logger;

  constructor(
    private db: NodePgDatabase<typeof schema>,
    _parentLogger?: Logger,
  ) {
    this.logger = createChildLogger("retention-db");
  }

  /**
   * Look up the most specific retention policy for a guild + optional channel.
   *
   * Resolution order (most-specific-first):
   *   1. Channel-level: guild_id + channel_id match
   *   2. Guild default: guild_id match with channel_id IS NULL
   *   3. No policy found → null
   */
  async getRetentionPolicy(
    guildId: string,
    channelId?: string,
  ): Promise<RetentionPolicy | null> {
    this.logger.debug({ guildId, channelId }, "getRetentionPolicy entry");
    try {
      const conditions = [eq(retentionPoliciesTable.guild_id, guildId)];

      // If a channel is specified, look for a channel-specific policy first
      if (channelId) {
        const channelRows = await this.db
          .select()
          .from(retentionPoliciesTable)
          .where(
            and(
              ...conditions,
              eq(retentionPoliciesTable.channel_id, channelId),
            ),
          );

        if (channelRows.length > 0)
          return channelRows[0] as RetentionPolicy;
      }

      // Fall back to the guild default (channel_id IS NULL)
      const guildRows = await this.db
        .select()
        .from(retentionPoliciesTable)
        .where(and(...conditions, isNull(retentionPoliciesTable.channel_id)));

      return (guildRows[0] as RetentionPolicy) || null;
    } catch (error) {
      this.logger.error(
        {
          guildId,
          channelId,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to get retention policy",
      );
      throw error;
    }
  }

  async upsertRetentionPolicy(
    policy: Omit<RetentionPolicy, "created_at" | "updated_at">,
  ): Promise<RetentionPolicy> {
    this.logger.debug(
      { guildId: policy.guild_id, channelId: policy.channel_id },
      "upsertRetentionPolicy entry",
    );
    try {
      const now = Date.now();

      // Find existing policy that matches guild + optional channel
      const conditions = [eq(retentionPoliciesTable.guild_id, policy.guild_id)];
      if (policy.channel_id) {
        conditions.push(
          eq(retentionPoliciesTable.channel_id, policy.channel_id),
        );
      } else {
        conditions.push(isNull(retentionPoliciesTable.channel_id));
      }

      const existing = await this.db
        .select({ id: retentionPoliciesTable.id })
        .from(retentionPoliciesTable)
        .where(and(...conditions))
        .limit(1);

      const existingRow = existing[0];
      if (existingRow) {
        const rows = (await this.db
          .update(retentionPoliciesTable)
          .set({
            ...policy,
            updated_at: now,
          })
          .where(eq(retentionPoliciesTable.id, existingRow.id))
          .returning()) as RetentionPolicy[];

        return rows[0] as RetentionPolicy;
      }

      const id = `policy-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const rows = (await this.db
        .insert(retentionPoliciesTable)
        .values({
          ...policy,
          id,
          created_at: now,
          updated_at: now,
        })
        .returning()) as RetentionPolicy[];

      return rows[0] as RetentionPolicy;
    } catch (error) {
      this.logger.error(
        {
          guildId: policy.guild_id,
          error: error instanceof Error ? error.message : String(error),
        },
        "Failed to upsert retention policy",
      );
      throw error;
    }
  }
}
