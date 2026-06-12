import { createChildLogger } from "@bete/shared/logger";
import {
  pgCorrectedModerationsTable,
  type CorrectedModeration,
  type CorrectedModerationInsert,
} from "@bete/shared";
import { and, desc, lt, eq, sql } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import type { CorrectionCreate, CorrectionQuery } from "./corrections.schema.js";

const logger = createChildLogger("corrections.repository");

export interface CorrectionStatsResult {
  total_corrections: number;
  recent_count_7d: number;
  by_flag: Array<{ flag: string; count: number }>;
}

export class CorrectionsRepository {
  async getStats(): Promise<CorrectionStatsResult> {
    const db = getDatabase();
    const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;

    // Total count
    const [totalRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pgCorrectedModerationsTable);

    // Recent 7 days count
    const [recentRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(pgCorrectedModerationsTable)
      .where(lt(pgCorrectedModerationsTable.created_at, sevenDaysAgo));

    // Count by original_flag using JSON array unnest
    const byFlagRows = await db.execute(sql`
      SELECT flag, count(*)::int as count
      FROM corrected_moderations,
      json_array_elements_text(original_flags::json) AS flag
      GROUP BY flag
      ORDER BY count DESC
      LIMIT 20
    `);

    const byFlag = (byFlagRows.rows ?? []).map(
      (r: Record<string, unknown>) => ({
        flag: String(r.flag),
        count: Number(r.count),
      }),
    );

    return {
      total_corrections: totalRow?.count ?? 0,
      recent_count_7d: recentRow?.count ?? 0,
      by_flag: byFlag,
    };
  }

  async list(
    query: CorrectionQuery,
  ): Promise<{ data: CorrectedModeration[]; nextCursor: string | null }> {
    const db = getDatabase();
    const limit = query.limit ?? 20;
    const conditions = [];

    if (query.cursor) {
      conditions.push(
        lt(pgCorrectedModerationsTable.created_at, Number(query.cursor)),
      );
    }

    const where = conditions.length > 0 ? and(...conditions) : undefined;

    const rows = await db
      .select()
      .from(pgCorrectedModerationsTable)
      .where(where)
      .orderBy(desc(pgCorrectedModerationsTable.created_at))
      .limit(limit + 1);

    const data = rows.slice(0, limit);
    const nextCursor =
      rows.length > limit ? String(rows[limit].created_at) : null;

    return { data, nextCursor };
  }

  async create(data: CorrectionCreate): Promise<CorrectedModeration> {
    const db = getDatabase();
    const id = `corr-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

    const insert: CorrectedModerationInsert = {
      id,
      message_id: data.message_id,
      original_flags: JSON.stringify(data.original_flags),
      corrected_flags: JSON.stringify(data.corrected_flags),
      correction_notes: data.correction_notes ?? null,
      content_snippet: data.content_snippet,
      created_at: Date.now(),
    };

    const [row] = await db
      .insert(pgCorrectedModerationsTable)
      .values(insert)
      .returning();

    logger.info(
      { id, messageId: data.message_id },
      "Correction recorded",
    );

    return row;
  }
}

export const correctionsRepository = new CorrectionsRepository();
