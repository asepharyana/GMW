import { randomUUID } from "node:crypto"
import { createRouterClient } from "@orpc/server"
import { drizzle } from "drizzle-orm/node-postgres"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { MessagesService } from "../src/application/messages/messages.service.js"
import { ModerationService } from "../src/application/moderation/moderation.service.js"
import { decodeCursor } from "../src/domain/utils/pagination.js"
import { claimUnenforced } from "../src/infrastructure/modules-gateway/ai-moderation/autoDeleteEnforcer.js"
import { MessagesCrud } from "../src/infrastructure/modules-gateway/message-capture/messagesCrud.js"
import { MessagesRepository } from "../src/infrastructure/repositories/messages.repository.js"
import { ModerationRepository } from "../src/infrastructure/repositories/moderation.repository.js"
import type { UseCases } from "../src/presentation/composition.js"
import { buildRouter } from "../src/presentation/orpc/router.js"
import {
	type IsolatedPool,
	tryCreateIsolatedPool,
} from "../tests-gateway/isolated-pool.js"

// Exercise the actual Drizzle queries against isolated Postgres tables. A unit
// test duplicating the paging algorithm cannot catch SQL ordering/limit errors.
let iso: IsolatedPool | null
let repo: MessagesRepository
let api: ReturnType<typeof createApi>

function createApi() {
	return createRouterClient(
		buildRouter({
			messages: new MessagesService(repo),
			moderation: new ModerationService(
				new ModerationRepository(drizzle(pool())),
			),
		} as unknown as UseCases),
	)
}
beforeAll(async () => {
	iso = await tryCreateIsolatedPool("repo_paging")
	if (!iso) return
	await iso.pool.query(
		`CREATE TABLE message_edits (LIKE public.message_edits INCLUDING ALL)`,
	)
	await iso.pool.query(
		`CREATE TABLE moderation_actions (LIKE public.moderation_actions INCLUDING ALL)`,
	)
	repo = new MessagesRepository(drizzle(iso.pool))
	api = createApi()
})
afterAll(async () => {
	await iso?.cleanup()
})

function pool() {
	if (!iso) throw new Error("Test database not initialized")
	return iso.pool
}

function requiredCursor(cursor: string | null): string {
	expect(cursor).not.toBeNull()
	if (cursor === null) throw new Error("Expected another page")
	return cursor
}

async function message(
	id: string,
	createdAt: number,
	channel = "c1",
	state = "pending",
) {
	await pool().query(
		`INSERT INTO messages (id, guild_id, channel_id, user_id, username, content, created_at, ai_status)
		 VALUES ($1, 'g1', $2, 'u1', 'user1', 'original', $3, $4)`,
		[id, channel, createdAt, state],
	)
}

async function verdict(id: string, score: number) {
	await pool().query(
		`INSERT INTO verdicts (message_id, status, flags, categories, confidence, score, analysis, evidence, created_at, updated_at, reason)
		 VALUES ($1, 'deleted', '{}', '{}', 1, $2, 'reason', '{}', 1, 1, 'spam')`,
		[id, score],
	)
}

describe("messages repository pagination", () => {
	it("visits review candidates beyond the old scan cap in global priority order", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		// Insert low-priority candidates first: LIMIT-before-sort used to hide the
		// later high-priority verdict and stop permanently after the first window.
		for (let i = 0; i < 205; i++)
			await message(
				`review-${String(i).padStart(3, "0")}`,
				100,
				"review",
				"dead",
			)
		await message("priority", 1, "review", "analyzed")
		await verdict("priority", 0.9)

		const ids: string[] = []
		let cursor: string | undefined
		do {
			const page = await repo.getReviewMessages("review", 7, cursor)
			expect(page.results.length).toBeGreaterThan(0)
			expect(() => JSON.stringify(page.results)).not.toThrow()
			ids.push(...page.results.map((r) => r.id))
			cursor = page.nextCursor ?? undefined
			expect(ids.length).toBeLessThanOrEqual(206)
		} while (cursor)
		expect(ids[0]).toBe("priority")
		expect(ids.slice(1)).toEqual(
			Array.from(
				{ length: 205 },
				(_, i) => `review-${String(204 - i).padStart(3, "0")}`,
			),
		)
		expect(new Set(ids).size).toBe(206)
	})

	it("maps full review context and preserves equal-score ties across pages", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		for (const id of ["tie-a", "tie-b", "tie-c"]) {
			await message(id, 500, "ties", "analyzed")
			await verdict(id, 0.73)
		}
		await iso.pool.query(
			`UPDATE messages SET edited_content = 'edited', metadata = '{"member":{"displayName":"Nick"}}', deleted_at = 600 WHERE id = 'tie-c'`,
		)
		const first = await repo.getReviewMessages("ties", 1)
		expect(first.results[0]).toMatchObject({
			id: "tie-c",
			edited_content: "edited",
			deleted_at: 600,
			server_nick: "Nick",
		})
		const second = await repo.getReviewMessages(
			"ties",
			1,
			requiredCursor(first.nextCursor),
		)
		const third = await repo.getReviewMessages(
			"ties",
			1,
			requiredCursor(second.nextCursor),
		)
		expect([second.results[0].id, third.results[0].id]).toEqual([
			"tie-b",
			"tie-a",
		])
		expect(third.nextCursor).toBeNull()
	})

	it("paginates and streams messages sharing one timestamp without losing rows", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		for (const id of ["msg-a", "msg-b", "msg-c"])
			await message(id, 700, "messages")
		const query = { channelId: "messages", limit: 2, offset: 0 }
		const first = await repo.findMany(query)
		expect(first.data.map((r) => r.id)).toEqual(["msg-c", "msg-b"])
		expect(decodeCursor(requiredCursor(first.nextCursor))).toEqual({
			created_at: 700,
			id: "msg-b",
		})
		const second = await repo.findMany({
			...query,
			cursor: requiredCursor(first.nextCursor),
		})
		expect(second.data.map((r) => r.id)).toEqual(["msg-a"])
		const streamed = []
		for await (const row of repo.streamMany(query, 1)) streamed.push(row.id)
		expect(streamed).toEqual(["msg-c", "msg-b", "msg-a"])
		const legacy = await repo.findMany({ ...query, cursor: "700" })
		expect(legacy.data).toEqual([])
	})

	it("counts image messages once even when one has many attachments", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		for (let i = 0; i < 3; i++) {
			const id = `image-${i}`
			await message(id, 800 + i, "images")
			for (let j = 0; j < (i === 2 ? 20 : 1); j++) {
				await iso.pool.query(
					`INSERT INTO attachments (id, message_id, guild_id, channel_id, user_id, filename, size, type, discord_url, created_at) VALUES ($1, $2, 'g1', 'images', 'u1', 'a.png', 1, 'image/png', 'https://example.test/a.png', $3)`,
					[`${id}-${j}`, id, 800 + i],
				)
			}
		}
		const page = await api.messages.images({ guildId: "g1", limit: 2 })
		expect(page.data.map((r) => r.id)).toEqual(["image-2", "image-1"])
		expect(page.nextCursor).not.toBeNull()
		const olderImages = await api.messages.images({
			guildId: "g1",
			limit: 2,
			cursor: requiredCursor(page.nextCursor),
		})
		expect(olderImages.data.map((r) => r.id)).toEqual(["image-0"])
		expect(olderImages.nextCursor).toBeNull()
		const attachments = await repo.getAttachmentsByChannel("images", {
			limit: 3,
			offset: 0,
		})
		const next = await repo.getAttachmentsByChannel("images", {
			limit: 3,
			offset: 0,
			cursor: requiredCursor(attachments.nextCursor),
		})
		expect(next.data).toHaveLength(3)
		expect(
			next.data.some((r) => attachments.data.some((a) => a.id === r.id)),
		).toBe(false)
	})

	it("keeps channel queries consistent with list filters and cursor pages", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		await message("scope-other-status", 2000, "scope", "analyzed")
		await verdict("scope-other-status", 0.8)
		await message("scope-other-user", 1900, "scope", "dead")
		await message("scope-a", 1800, "scope", "dead")
		await message("scope-b", 1800, "scope", "dead")
		await iso.pool.query(
			`UPDATE messages SET user_id = 'u2' WHERE id = 'scope-other-user'`,
		)
		const query = {
			guildId: "g1",
			userId: "u1",
			status: "dead" as const,
			limit: 1,
			offset: 0,
		}
		const first = await api.messages.byChannel({ channelId: "scope", query })
		expect(first.data.map((r) => r.id)).toEqual(["scope-b"])
		const next = await api.messages.byChannel({
			channelId: "scope",
			query: { ...query, cursor: requiredCursor(first.nextCursor) },
		})
		expect(next.data.map((r) => r.id)).toEqual(["scope-a"])
		expect(next.nextCursor).toBeNull()
		const wrongGuild = await api.messages.byChannel({
			channelId: "scope",
			query: { ...query, guildId: "g2" },
		})
		expect(wrongGuild.data).toEqual([])
		const flagged = await api.messages.byChannel({
			channelId: "scope",
			query: { verdict: "deleted", limit: 10, offset: 0 },
		})
		expect(flagged.data.map((r) => r.id)).toEqual(["scope-other-status"])
	})

	it("accepts moderation resume tokens through the API without losing timestamp ties", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		for (const id of ["action-a", "action-b", "action-c"]) {
			await iso.pool.query(
				`INSERT INTO moderation_actions (id, guild_id, action_type, status, created_at) VALUES ($1, 'g1', 'delete_message', 'executed', 3000)`,
				[id],
			)
		}
		const first = await api.moderation.actions({ limit: 1 })
		expect(first.data.map((r) => r.id)).toEqual(["action-c"])
		const second = await api.moderation.actions({
			limit: 1,
			cursor: requiredCursor(first.nextCursor),
		})
		expect(second.data.map((r) => r.id)).toEqual(["action-b"])
		const third = await api.moderation.actions({
			limit: 1,
			cursor: requiredCursor(second.nextCursor),
		})
		expect(third.data.map((r) => r.id)).toEqual(["action-a"])
		expect(third.nextCursor).toBeNull()
		const legacy = await api.moderation.actions({ limit: 1, cursor: 3000 })
		expect(legacy.data).toEqual([])
	})

	it("does not claim stale verdicts for messages awaiting re-analysis", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		// Keep previous review fixtures out of this claim query.
		await iso.pool.query(`UPDATE verdicts SET auto_delete_state = 'done'`)
		for (const state of [
			"pending",
			"claimed",
			"retry_wait",
			"dead",
			"skipped",
			"analyzed",
		]) {
			await message(`enforce-${state}`, 10, "enforcement", state)
			await verdict(`enforce-${state}`, 0.9)
		}
		const db = drizzle(iso.pool)
		const initial = await claimUnenforced(10, db)
		expect(initial.map((r) => r.message_id)).toEqual(["enforce-analyzed"])
		await iso.pool.query(
			`UPDATE verdicts SET auto_delete_state = NULL WHERE message_id = 'enforce-analyzed'`,
		)
		const crud = new MessagesCrud(db)
		await crud.updateMessageAsEdited(
			"enforce-analyzed",
			"now clean",
			Date.now(),
		)
		expect(await claimUnenforced(10, db)).toEqual([])
		const untouched = await iso.pool.query(
			`SELECT auto_delete_state FROM verdicts WHERE message_id = 'enforce-analyzed'`,
		)
		expect(untouched.rows[0].auto_delete_state).toBeNull()
		// A completed, still actionable judgement can be enforced again.
		await iso.pool.query(
			`UPDATE messages SET ai_status = 'analyzed' WHERE id = 'enforce-analyzed'`,
		)
		const rejudged = await claimUnenforced(10, db)
		expect(rejudged.map((r) => r.message_id)).toEqual(["enforce-analyzed"])
	})

	it("joins edit context before limiting so orphaned edits cannot empty a page", async (ctx) => {
		if (!iso) return ctx.skip("Postgres unavailable")
		await message("edited", 900, "edits")
		for (const [id, time] of [
			["missing", 1000],
			["edited", 950],
			["edited", 940],
		] as const) {
			await iso.pool.query(
				`INSERT INTO message_edits (id, message_id, old_content, edited_at) VALUES ($1, $2, 'old', $3)`,
				[randomUUID(), id, time],
			)
		}
		const first = await repo.getRecentEdits(1)
		expect(first.results).toHaveLength(1)
		expect(first.results[0]).toMatchObject({
			message_id: "edited",
			edited_at: 950,
			new_content: "original",
		})
		const second = await repo.getRecentEdits(
			1,
			undefined,
			requiredCursor(first.nextCursor),
		)
		expect(second.results[0].edited_at).toBe(940)
		expect(second.nextCursor).toBeNull()
	})
})
