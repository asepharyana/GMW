import { describe, expect, test } from "vitest"
import { pipelineLabel, pipelineLabelFor } from "./ai-status"

/**
 * A deleted message must never be presented as still waiting in the queue.
 *
 * The reported bug: a message was captured while a worker was busy, a moderator
 * deleted it, and the card printed
 *
 *     Queued        Deleted by moderator
 *
 * on the same row, one day later. Both badges were individually honest — the
 * row really was `pending`, and a human really had deleted it — but together
 * they claimed the message was still on its way to being judged, which no
 * worker would ever do, because `claim_messages()` skips `deleted_at IS NOT
 * NULL`. The queue never drained it and nothing else re-pended it.
 *
 * The database fix (migration 0002) moves deleted rows to `skipped` on the way
 * in. This guard covers rows written before it, and the live-feed copy of a
 * message between a deletion event and the next refetch.
 */
describe("pipelineLabelFor", () => {
	test("a queued message that has been deleted is not labelled Queued", () => {
		// `pending` + `deleted_at` is exactly the reported state.
		expect(
			pipelineLabelFor({ ai_status: "pending", deleted_at: 1_700_000_000 }),
		).toBe("Not moderated")
		// And agrees with what the worker would have written for the same row.
		expect(pipelineLabelFor({ ai_status: "skipped", deleted_at: 1 })).toBe(
			pipelineLabel("skipped"),
		)
	})

	test("retry_wait is covered too — it is still a queue state", () => {
		expect(pipelineLabelFor({ ai_status: "retry_wait", deleted_at: 1 })).toBe(
			"Not moderated",
		)
	})

	test("a claimed message keeps Analyzing: a worker really does hold it", () => {
		// Relabelling mid-flight would contradict the verdict that worker is
		// about to publish, and the card would flicker between the two.
		expect(pipelineLabelFor({ ai_status: "claimed", deleted_at: 1 })).toBe(
			"Analyzing",
		)
	})

	test("an undeleted message is labelled exactly as before", () => {
		expect(pipelineLabelFor({ ai_status: "pending", deleted_at: null })).toBe(
			"Queued",
		)
		// Judged, then deleted afterwards: the verdict stands, and the card keeps
		// saying so. Only the queue states are rewritten above.
		expect(pipelineLabelFor({ ai_status: "analyzed", deleted_at: 1 })).toBe(
			"Analyzed",
		)
	})
})
