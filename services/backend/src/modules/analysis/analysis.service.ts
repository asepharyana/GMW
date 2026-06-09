import { createChildLogger } from "@bete/shared/logger";
import { config } from "../../shared/config/index.js";
import type { AnalysisSearchQuery } from "./analysis.repository.js";
import { analysisRepository } from "./analysis.repository.js";

const logger = createChildLogger("analysis.service");

export type { AnalysisSearchQuery };

export class AnalysisService {
  async search(query: AnalysisSearchQuery) {
    const { q = "", channelId, limit = 20 } = query;
    const guildId = config.MONITOR_GUILD_ID;

    logger.debug({ q, channelId, limit, guildId }, "Searching analysis");

    const rows = await analysisRepository.search({
      q,
      channelId,
      guildId,
      limit,
    });

    return { results: rows };
  }
}

export const analysisService = new AnalysisService();
