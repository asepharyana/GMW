import type { Pool } from "pg"
import { describe, expect, it } from "vitest"
import type { LlmRequest } from "../src/infrastructure/modules-gateway/ai-moderation/llmGateway.js"
import {
	DEFAULT_WORKER_CONFIG,
	ModerationWorker,
} from "../src/infrastructure/modules-gateway/ai-moderation/worker.js"

function makeFakePool(
	attachments: Array<{
		message_id: string
		discord_url: string
		filename: string
		size: number
		type: string
	}> = [],
) {
	return {
		connect: async () => ({
			query: async () => ({ rows: [] }),
			release: () => {},
		}),
		query: async (sql: string, _params: unknown[]) => {
			if (sql.includes("FROM attachments")) {
				return { rows: attachments }
			}
			return { rows: [] }
		},
	} as unknown as Pool
}

function makeScriptedGateway(response: string) {
	const g = {
		calls: 0,
		requests: [] as LlmRequest[],
		modelLabel: "test-model",
		async complete(req: LlmRequest) {
			g.calls += 1
			g.requests.push(req)
			return response
		},
	}
	return g
}

describe("Media deduplication in ModerationWorker", () => {
	it("deduplicates identical images across channels in the vision pass", async () => {
		// User sends photo.png to channel A, and the same photo.png to channel B.
		// Note that Discord CDN URLs are different for both channels!
		const attachments = [
			{
				message_id: "m-ch1",
				discord_url:
					"https://cdn.discordapp.com/attachments/111/222/photo.png?ex=1",
				filename: "photo.png",
				size: 50000,
				type: "image/png",
			},
			{
				message_id: "m-ch2",
				discord_url:
					"https://cdn.discordapp.com/attachments/333/444/photo.png?ex=2",
				filename: "photo.png",
				size: 50000,
				type: "image/png",
			},
		]

		const fakePool = makeFakePool(attachments)
		const fakeVision = makeScriptedGateway("Tangkapan layar kasino sabrewin")
		const fakeLlm = makeScriptedGateway(
			JSON.stringify({
				results: [
					{
						message_id: "m-ch1",
						status: "deleted",
						action: "delete_message",
						reason: "Promosi kasino kripto sabrewin.com",
						flags: ["gambling"],
						categories: ["gambling"],
						confidence: 0.99,
						score: 0.99,
						analysis: "Pesan menyertakan promosi kasino",
					},
				],
			}),
		)

		const worker = new ModerationWorker(
			fakePool,
			fakeLlm,
			DEFAULT_WORKER_CONFIG,
			fakeVision,
		)

		// Both messages are processed in the batch
		const messages = [
			{
				id: "m-ch1",
				guildId: "g1",
				channelId: "c1",
				threadId: null,
				authorId: "u-scammer",
				content: "Join sabrewin bonus!",
				createdAt: "1794460000000",
				attempts: 1,
				username: "sam.",
				metadata: null,
				hasMedia: true,
			},
			{
				id: "m-ch2",
				guildId: "g1",
				channelId: "c2",
				threadId: null,
				authorId: "u-scammer",
				content: "Join sabrewin bonus!",
				createdAt: "1794460001000",
				attempts: 1,
				username: "sam.",
				metadata: null,
				hasMedia: true,
			},
		]

		const { result } = await (worker as any).analyze(messages)

		// 1. Vision model should only be called ONCE for the unique image!
		expect(fakeVision.calls).toBe(1)

		// 2. Moderation LLM should only be called ONCE for the representative in-batch duplicate!
		expect(fakeLlm.calls).toBe(1)

		// 3. Both messages receive verdicts
		expect(result.verdicts).toHaveLength(2)
		const v1 = result.verdicts.find((v: any) => v.messageId === "m-ch1")
		const v2 = result.verdicts.find((v: any) => v.messageId === "m-ch2")

		expect(v1?.status).toBe("deleted")
		expect(v2?.status).toBe("deleted")
		expect(v1?.categories).toEqual(["gambling"])
		expect(v2?.categories).toEqual(["gambling"])
	})

	it("short-circuits subsequent spam messages with identical media signatures", async () => {
		const attachments = [
			{
				message_id: "m-later",
				discord_url:
					"https://cdn.discordapp.com/attachments/555/666/photo.png?ex=9",
				filename: "photo.png",
				size: 50000,
				type: "image/png",
			},
		]

		const fakePool = makeFakePool(attachments)
		const fakeVision = makeScriptedGateway("Tangkapan layar kasino sabrewin")
		const fakeLlm = makeScriptedGateway(JSON.stringify({ results: [] }))

		const worker = new ModerationWorker(
			fakePool,
			fakeLlm,
			DEFAULT_WORKER_CONFIG,
			fakeVision,
		)

		// Pre-populate violation cache with the media signature from a previous deletion
		const mediaSig = "meta:photo.png:50000"
		;(worker as any).recentSpamViolations.set(mediaSig, {
			flags: ["gambling"],
			categories: ["gambling"],
			reason: "Promosi kasino kripto sabrewin.com",
			analysis: "Pesan menyertakan promosi kasino",
			action: "delete_message",
			authorId: "u-scammer",
		})

		const messages = [
			{
				id: "m-later",
				guildId: "g1",
				channelId: "c3",
				threadId: null,
				authorId: "u-scammer",
				content: "Join sabrewin bonus!",
				createdAt: "1794460010000",
				attempts: 1,
				username: "sam.",
				metadata: null,
				hasMedia: true,
			},
		]

		const { result } = await (worker as any).analyze(messages)

		// Moderation LLM is NEVER called: short-circuited!
		expect(fakeLlm.calls).toBe(0)

		// Verdict is immediately deleted
		expect(result.verdicts).toHaveLength(1)
		expect(result.verdicts[0].status).toBe("deleted")
		expect(result.verdicts[0].evidence).toContain(`media_signature=${mediaSig}`)
	})
})
