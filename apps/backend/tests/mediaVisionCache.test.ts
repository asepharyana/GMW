import type { Pool } from "pg"
import { describe, expect, it, vi } from "vitest"
import { MediaVisionCacheService } from "../src/infrastructure/modules-gateway/ai-moderation/mediaVisionCache.js"

describe("MediaVisionCacheService", () => {
	it("stores and retrieves from in-memory cache", async () => {
		const service = new MediaVisionCacheService(undefined, 10)
		await service.setMany([
			{ fingerprint: "fp1", description: "desc1" },
			{ fingerprint: "fp2", description: "desc2" },
		])

		const result = await service.getMany(["fp1", "fp2", "fp3"])
		expect(result.get("fp1")).toBe("desc1")
		expect(result.get("fp2")).toBe("desc2")
		expect(result.has("fp3")).toBe(false)
	})

	it("coalesces concurrent requests for the exact same fingerprint (singleflight)", async () => {
		const service = new MediaVisionCacheService()
		let callCount = 0

		const longTask = async () => {
			callCount += 1
			await new Promise((resolve) => setTimeout(resolve, 50))
			return "description from vision"
		}

		// 5 concurrent requests arrive at once for the same fingerprint
		const results = await Promise.all([
			service.coalesce("fp-shared", longTask),
			service.coalesce("fp-shared", longTask),
			service.coalesce("fp-shared", longTask),
			service.coalesce("fp-shared", longTask),
			service.coalesce("fp-shared", longTask),
		])

		// Exactly ONE task was executed
		expect(callCount).toBe(1)
		for (const res of results) {
			expect(res).toBe("description from vision")
		}
	})

	it("queries the database on in-memory cache miss when pool is provided", async () => {
		let queryCalled = false
		const fakePool = {
			query: vi.fn(async (sql: string, _params: unknown[]) => {
				queryCalled = true
				if (sql.includes("SELECT")) {
					return {
						rows: [
							{
								fingerprint: "fp-db",
								description: "desc from postgres",
							},
						],
					}
				}
				return { rows: [] }
			}),
		} as unknown as Pool

		const service = new MediaVisionCacheService(fakePool)
		const res = await service.getMany(["fp-db"])

		expect(queryCalled).toBe(true)
		expect(res.get("fp-db")).toBe("desc from postgres")

		// Subsequent call hits in-memory cache without querying DB
		queryCalled = false
		const res2 = await service.getMany(["fp-db"])
		expect(res2.get("fp-db")).toBe("desc from postgres")
		expect(queryCalled).toBe(false)
	})
})
