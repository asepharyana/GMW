/**
 * A reasoning model must not have its thoughts parsed as its answer.
 *
 * The gateway used to accumulate `content` and `reasoning_content` into ONE
 * string. A model that thinks before answering streams `content: null` while it
 * reasons, so the parser received "…m1 looks like spam…{…}" and the JSON
 * scanner latched onto the first brace in the THINKING. The answer is the
 * `content` channel; reasoning is only a fallback for a model that puts
 * everything there.
 */
import { describe, expect, test } from "vitest"
import { splitChunkText } from "../src/infrastructure/modules-gateway/ai-moderation/llmGateway.js"

describe("splitChunkText", () => {
	test("content and reasoning are separated", () => {
		const part = splitChunkText({
			choices: [
				{ delta: { content: '{"results":', reasoning_content: "thinking…" } },
			],
		})
		expect(part.content).toBe('{"results":')
		expect(part.reasoning).toBe("thinking…")
	})

	test("a reasoning-only frame yields no content", () => {
		const part = splitChunkText({
			choices: [{ delta: { content: null, reasoning_content: "step 1" } }],
		})
		expect(part.content).toBe("")
		expect(part.reasoning).toBe("step 1")
	})

	test("the `reasoning` alias is read too", () => {
		const part = splitChunkText({ choices: [{ delta: { reasoning: "step" } }] })
		expect(part.reasoning).toBe("step")
	})

	test("a non-stream message body is read", () => {
		const part = splitChunkText({
			choices: [{ message: { content: "halo" } }],
		})
		expect(part.content).toBe("halo")
	})

	test("an empty or missing chunk yields nothing", () => {
		expect(splitChunkText(undefined)).toEqual({ content: "", reasoning: "" })
		expect(splitChunkText({})).toEqual({ content: "", reasoning: "" })
		expect(splitChunkText({ choices: [] })).toEqual({
			content: "",
			reasoning: "",
		})
	})
})
