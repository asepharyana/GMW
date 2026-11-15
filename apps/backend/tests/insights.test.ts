import { describe, expect, it } from "vitest"
import {
	buildConfidence,
	buildEditActivity,
	buildEnforcement,
	buildFlagCategories,
	buildFreshness,
	buildInsights,
	buildMediaArchive,
	type EditInsightRow,
	type VerdictInsightRow,
} from "../src/domain/dashboard/insights.js"

/**
 * The insight panels are read as facts about the guild — "we delete for scam
 * most", "the model was sure", "it was enforced" — so each case here is a way
 * the reduction can be wrong while still rendering plausibly.
 */

const verdict = (over: Partial<VerdictInsightRow> = {}): VerdictInsightRow => ({
	status: "clean",
	confidence: 0.9,
	categories: [],
	auto_delete_state: null,
	updated_at: 1,
	...over,
})

const edit = (over: Partial<EditInsightRow> = {}): EditInsightRow => ({
	message_id: "m1",
	edited_at: 0,
	user_id: "u1",
	username: "u1",
	created_at: 0,
	...over,
})

describe("buildFlagCategories", () => {
	it("counts only the categories the model acted on", () => {
		const ranked = buildFlagCategories([
			verdict({ status: "deleted", categories: ["scam", "spam"] }),
			verdict({ status: "deleted", categories: ["scam"] }),
			// A clean verdict can still name a category; it is not a finding.
			verdict({ status: "clean", categories: ["scam"] }),
		])

		expect(ranked).toEqual([
			{ name: "scam", count: 2 },
			{ name: "spam", count: 1 },
		])
	})

	it("counts a repeated category once per verdict", () => {
		const ranked = buildFlagCategories([
			verdict({ status: "deleted", categories: ["scam", "scam"] }),
		])

		expect(ranked).toEqual([{ name: "scam", count: 1 }])
	})

	it("drops blank entries and breaks ties by name", () => {
		const ranked = buildFlagCategories([
			verdict({ status: "deleted", categories: ["", "  ", "spam"] }),
			verdict({ status: "deleted", categories: ["scam"] }),
		])

		expect(ranked.map((c) => c.name)).toEqual(["scam", "spam"])
	})

	it("applies the limit after ranking", () => {
		const ranked = buildFlagCategories(
			[
				verdict({ status: "deleted", categories: ["a"] }),
				verdict({ status: "deleted", categories: ["b"] }),
				verdict({ status: "deleted", categories: ["b"] }),
			],
			1,
		)

		expect(ranked).toEqual([{ name: "b", count: 2 }])
	})
})

describe("buildConfidence", () => {
	it("buckets judged verdicts and folds 100% into the top bucket", () => {
		const summary = buildConfidence([
			verdict({ confidence: 0.05 }),
			verdict({ confidence: 0.2 }),
			verdict({ confidence: 1 }),
		])

		expect(summary.buckets.map((b) => b.count)).toEqual([1, 1, 0, 0, 1])
		expect(summary.judged).toBe(3)
	})

	it("excludes error verdicts from the histogram and the mean", () => {
		const summary = buildConfidence([
			verdict({ confidence: 0.8 }),
			verdict({ status: "error", confidence: 0 }),
		])

		expect(summary.judged).toBe(1)
		expect(summary.mean).toBeCloseTo(0.8, 5)
	})

	it("reports the share of deletions made below 0.6", () => {
		const summary = buildConfidence([
			verdict({ status: "deleted", confidence: 0.5 }),
			verdict({ status: "deleted", confidence: 0.55 }),
			verdict({ status: "deleted", confidence: 0.95 }),
			// A low-confidence CLEAN verdict is not a weak enforcement.
			verdict({ status: "clean", confidence: 0.1 }),
		])

		expect(summary.low_share).toBeCloseTo((2 / 3) * 100, 5)
	})

	it("has no mean and no low share when nothing was judged", () => {
		const summary = buildConfidence([])

		expect(summary.mean).toBeNull()
		expect(summary.low_share).toBeNull()
		expect(summary.buckets).toHaveLength(5)
	})

	it("clamps a confidence outside 0..1 instead of dropping the row", () => {
		const summary = buildConfidence([
			verdict({ confidence: 1.4 }),
			verdict({ confidence: -0.2 }),
		])

		expect(summary.judged).toBe(2)
		expect(summary.buckets[4].count).toBe(1)
		expect(summary.buckets[0].count).toBe(1)
	})
})

describe("buildEnforcement", () => {
	it("splits deletions by what the enforcer did with them", () => {
		const summary = buildEnforcement([
			verdict({ status: "deleted", auto_delete_state: "done" }),
			verdict({ status: "deleted", auto_delete_state: "failed" }),
			verdict({ status: "deleted", auto_delete_state: "claimed" }),
			verdict({ status: "deleted", auto_delete_state: "pending" }),
			// Never claimed and queued are the same situation for a reader.
			verdict({ status: "deleted", auto_delete_state: null }),
		])

		expect(summary).toMatchObject({
			enforced: 1,
			failed: 1,
			in_flight: 1,
			queued: 2,
			deleted_total: 5,
		})
	})

	it("counts clean and error verdicts apart from the deletion buckets", () => {
		const summary = buildEnforcement([
			verdict({ status: "clean" }),
			verdict({ status: "error" }),
		])

		expect(summary).toMatchObject({ clean: 1, error: 1, deleted_total: 0 })
	})
})

describe("buildEditActivity", () => {
	const now = 10 * 24 * 60 * 60 * 1000
	const DAY = 24 * 60 * 60 * 1000

	it("merges a rename into one editor and shows their newest name", () => {
		const activity = buildEditActivity(
			[
				edit({ user_id: "u1", username: "old", created_at: 1 }),
				edit({ user_id: "u1", username: "new", created_at: 5 }),
				edit({ user_id: "u1", username: "new", created_at: 3 }),
			],
			10,
			now,
		)

		expect(activity.top_editors).toEqual([
			{ user_id: "u1", username: "new", edits: 3 },
		])
		expect(activity.total).toBe(3)
		expect(activity.messages).toBe(1)
	})

	it("counts an edit whose message is gone, but attributes it to nobody", () => {
		const activity = buildEditActivity(
			[
				edit({ message_id: "m1", user_id: "u1" }),
				edit({ message_id: "gone", user_id: null, username: null }),
			],
			10,
			now,
		)

		expect(activity.total).toBe(2)
		expect(activity.orphaned).toBe(1)
		expect(activity.messages).toBe(2)
		expect(activity.top_editors.map((e) => e.user_id)).toEqual(["u1"])
	})

	it("counts only the last seven days as recent", () => {
		const activity = buildEditActivity(
			[edit({ edited_at: now - 1 * DAY }), edit({ edited_at: now - 8 * DAY })],
			10,
			now,
		)

		expect(activity.last_7d).toBe(1)
	})

	it("ranks by edits and applies the limit", () => {
		const activity = buildEditActivity(
			[
				edit({ user_id: "a", username: "a" }),
				edit({ user_id: "b", username: "b" }),
				edit({ user_id: "b", username: "b" }),
			],
			1,
			now,
		)

		expect(activity.top_editors).toEqual([
			{ user_id: "b", username: "b", edits: 2 },
		])
	})

	it("labels an editor with no stored name by id", () => {
		const activity = buildEditActivity(
			[edit({ user_id: "u9", username: null })],
			10,
			now,
		)

		expect(activity.top_editors[0]).toMatchObject({
			user_id: "u9",
			username: "u9",
		})
	})
})

describe("buildMediaArchive", () => {
	it("sums every status and separates the bytes that landed", () => {
		const media = buildMediaArchive([
			{ status: "uploaded", count: 2, bytes: 100 },
			{ status: "pending", count: 1, bytes: 10 },
			{ status: "failed", count: 3, bytes: 30 },
		])

		expect(media).toEqual({
			total: 6,
			uploaded: 2,
			pending: 1,
			failed: 3,
			bytes: 140,
			uploaded_bytes: 100,
		})
	})

	it("counts an unknown status in the total but in no bucket", () => {
		const media = buildMediaArchive([{ status: "mystery", count: 4, bytes: 7 }])

		expect(media).toMatchObject({
			total: 4,
			uploaded: 0,
			pending: 0,
			failed: 0,
		})
	})

	it("coerces string aggregates, which is what pg returns for SUM()", () => {
		const media = buildMediaArchive([
			{
				status: "uploaded",
				count: "2" as unknown as number,
				bytes: "100" as unknown as number,
			},
		])

		expect(media.uploaded).toBe(2)
		expect(media.bytes).toBe(100)
	})
})

describe("buildFreshness", () => {
	it("takes the newest verdict time and keeps a null as null", () => {
		const freshness = buildFreshness(
			[verdict({ updated_at: 5 }), verdict({ updated_at: 9 })],
			{ last_message_at: 12, last_deletion_at: null, oldest_waiting_at: 3 },
		)

		expect(freshness).toEqual({
			last_message_at: 12,
			last_verdict_at: 9,
			last_deletion_at: null,
			oldest_waiting_at: 3,
		})
	})

	it("coerces bigint aggregates that arrive as strings", () => {
		const freshness = buildFreshness([], {
			last_message_at: "12" as unknown as number,
			last_deletion_at: null,
			oldest_waiting_at: null,
		})

		expect(freshness.last_message_at).toBe(12)
		expect(freshness.last_verdict_at).toBeNull()
	})
})

describe("buildInsights", () => {
	it("assembles every panel from the same rows", () => {
		const insights = buildInsights(
			{
				verdicts: [
					verdict({
						status: "deleted",
						confidence: 0.4,
						categories: ["scam"],
						auto_delete_state: "done",
						updated_at: 7,
					}),
				],
				edits: [edit({ edited_at: Date.now() })],
				media: [{ status: "uploaded", count: 1, bytes: 5 }],
				messages: {
					last_message_at: 8,
					last_deletion_at: 6,
					oldest_waiting_at: null,
				},
			},
			8,
			Date.now(),
		)

		expect(insights.categories).toEqual([{ name: "scam", count: 1 }])
		expect(insights.enforcement.enforced).toBe(1)
		expect(insights.confidence.low_share).toBe(100)
		expect(insights.edits.last_7d).toBe(1)
		expect(insights.media.uploaded).toBe(1)
		expect(insights.freshness.last_verdict_at).toBe(7)
	})
})
