import { createChildLogger } from "../../infrastructure/logger/index.js"
import type { DashboardRepository } from "../../infrastructure/repositories/dashboard.repository.js"

const logger = createChildLogger("dashboard.service")

export class DashboardService {
	constructor(private readonly repository: DashboardRepository) {}

	async getStats() {
		logger.debug("Fetching dashboard stats")
		return this.repository.getStats()
	}

	async getActivity(days: number) {
		logger.debug({ days }, "Fetching dashboard activity")
		return this.repository.getActivity(days)
	}

	async getLeaderboards(limit: number) {
		logger.debug({ limit }, "Fetching dashboard leaderboards")
		return this.repository.getLeaderboards(limit)
	}

	async getTopReactions(limit: number) {
		logger.debug({ limit }, "Fetching top reactions")
		return this.repository.getTopReactions(limit)
	}

	async getTopReactors(limit: number) {
		logger.debug({ limit }, "Fetching top reactors")
		return this.repository.getTopReactors(limit)
	}

	async getInsights(limit: number) {
		logger.debug({ limit }, "Fetching dashboard insights")
		return this.repository.getInsights(limit)
	}
}
