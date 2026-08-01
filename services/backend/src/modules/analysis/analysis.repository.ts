import { and, desc, eq, ilike, type SQL } from "drizzle-orm";
import { getDatabase } from "../../shared/database/index.js";
import { pgMessagesTable } from "../../shared/index.js";
import { createChildLogger } from "../../shared/logger/index.js";
import {
  type MappedMessage,
  mapMessageRow,
} from "../../shared/utils/messageMapper.js";

const logger = createChildLogger("analysis.repository");

export interface AnalysisSearchQuery {
  q?: string;
  channelId?: string;
  guildId?: string;
  limit?: number;
}

// AnalysisSearchResult is identical to MappedMessage — reuse the shared mapper
export type AnalysisSearchResult = MappedMessage;

export class AnalysisRepository {
  async search(query: AnalysisSearchQuery): Promise<AnalysisSearchResult[]> {
    const db = getDatabase();
    const { q = "", channelId, guildId, limit = 20 } = query;

    logger.debug({ q, channelId, guildId, limit }, "Searching analysis");

    const conditions: SQL[] = [ilike(pgMessagesTable.content, `%${q}%`)];

    if (guildId) {
      conditions.push(eq(pgMessagesTable.guild_id, guildId));
    }

    if (channelId) {
      conditions.push(eq(pgMessagesTable.channel_id, channelId));
    }

    const rows = await db
      .select()
      .from(pgMessagesTable)
      .where(and(...conditions))
      .orderBy(desc(pgMessagesTable.created_at))
      .limit(limit);

    return rows.map((r) => mapMessageRow(r as Record<string, unknown>));
  }
}

export const analysisRepository = new AnalysisRepository();
