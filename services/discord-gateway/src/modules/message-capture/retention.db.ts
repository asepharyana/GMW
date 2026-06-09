import { createChildLogger, type Logger } from "@bete/shared/logger";
import { eq } from "drizzle-orm";
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

  async getRetentionPolicy(guildId: string): Promise<RetentionPolicy | null> {
    this.logger.debug({ guildId }, "getRetentionPolicy entry");
    try {
      const rows = await this.db
        .select()
        .from(retentionPoliciesTable)
        .where(eq(retentionPoliciesTable.guild_id, guildId));

      return (rows[0] as RetentionPolicy) || null;
    } catch (error) {
      this.logger.error(
        {
          guildId,
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
      { guildId: policy.guild_id },
      "upsertRetentionPolicy entry",
    );
    try {
      const now = Date.now();
      const existing = await this.getRetentionPolicy(policy.guild_id);

      if (existing) {
        const rows = (await this.db
          .update(retentionPoliciesTable)
          .set({
            ...policy,
            updated_at: now,
          })
          .where(eq(retentionPoliciesTable.id, existing.id))
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
