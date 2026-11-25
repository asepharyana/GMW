/**
 * The chatbot must answer from a reply that is 99% well-formed.
 *
 * Two real failures motivated this file:
 *
 *  1. A tool call whose `arguments` arrived as a JSON STRING
 *     (`{"queries":"[\"judi\"]"}`) instead of an array. The tool then ran with
 *     no arguments and the model reported a result it never obtained.
 *  2. A non-stream reply with one trailing comma. `JSON.parse` threw, the
 *     fall-through SSE parser found no `data:` line, and the user got the
 *     canned "lagi ada masalah koneksi" for a complete answer.
 *
 * The service's parsers are private, so they are driven through the instance
 * with a bracket cast — that is deliberate: these are exactly the entry points
 * the HTTP path uses, and a test against a reimplementation would prove
 * nothing.
 */
import { describe, expect, test } from "vitest"
import { ChatbotService } from "../src/application/chatbot/chatbot.service.js"
import type { ChatbotRepository } from "../src/infrastructure/repositories/chatbot.repository.js"

type Parsed = {
	content: string
	toolCalls: Array<{
		id: string
		name: string
		arguments: string
		args: Record<string, unknown>
	}>
}

function service(): ChatbotService {
	// The parsers never touch the repository; an empty object is enough and
	// keeps the test free of Postgres.
	return new ChatbotService({} as ChatbotRepository, {
		baseUrl: "http://127.0.0.1:4014/v1",
		model: "text",
	})
}

function parseBody(body: string): Parsed {
	return (
		service() as unknown as { parseResponse: (b: string) => Parsed }
	).parseResponse(body)
}

describe("non-stream reply bodies", () => {
	test("a well-formed body still parses", () => {
		const out = parseBody(
			JSON.stringify({
				choices: [{ message: { content: "halo" } }],
			}),
		)
		expect(out.content).toBe("halo")
		expect(out.toolCalls).toEqual([])
	})

	test("a trailing comma does not fall through to the fallback", () => {
		const out = parseBody('{"choices":[{"message":{"content":"halo",},}],}')
		expect(out.content).toBe("halo")
	})

	test("single quotes around the whole body", () => {
		const out = parseBody("{'choices':[{'message':{'content':'halo'}}]}")
		expect(out.content).toBe("halo")
	})

	test("a tool call survives a trailing comma", () => {
		const out = parseBody(
			'{"choices":[{"message":{"content":null,"tool_calls":[{"id":"c1","type":"function","function":{"name":"search_messages","arguments":"{\\"query\\":\\"judi\\"}",},},],},}],}',
		)
		expect(out.toolCalls).toHaveLength(1)
		expect(out.toolCalls[0].name).toBe("search_messages")
		expect(out.toolCalls[0].args).toEqual({ query: "judi" })
	})
})

describe("tool-call arguments", () => {
	test("an array value stays an array", () => {
		const out = parseBody(
			JSON.stringify({
				choices: [
					{
						message: {
							tool_calls: [
								{
									id: "c1",
									function: {
										name: "search_messages",
										arguments: '{"queries":["judi","togel"]}',
									},
								},
							],
						},
					},
				],
			}),
		)
		expect(out.toolCalls[0].args).toEqual({ queries: ["judi", "togel"] })
	})

	// The reported failure: the model states an array, but encodes it as a
	// string. The tool must still receive the list, not an empty object.
	test("an array encoded as a JSON string is unwrapped", () => {
		const out = parseBody(
			JSON.stringify({
				choices: [
					{
						message: {
							tool_calls: [
								{
									id: "c1",
									function: {
										name: "search_messages",
										arguments: JSON.stringify({
											queries: '["judi","togel"]',
										}),
									},
								},
							],
						},
					},
				],
			}),
		)
		expect(out.toolCalls[0].args).toEqual({ queries: '["judi","togel"]' })
		// And the raw string is preserved for the replay to the API, which is
		// what the provider's own contract requires.
		expect(out.toolCalls[0].arguments).toContain("queries")
	})

	test("a double-encoded argument object is unwrapped", () => {
		const out = parseBody(
			JSON.stringify({
				choices: [
					{
						message: {
							tool_calls: [
								{
									id: "c1",
									function: {
										name: "search_messages",
										arguments: JSON.stringify(
											JSON.stringify({ query: "judi" }),
										),
									},
								},
							],
						},
					},
				],
			}),
		)
		expect(out.toolCalls[0].args).toEqual({ query: "judi" })
	})

	test("unquoted keys and single quotes in arguments", () => {
		const out = parseBody(
			JSON.stringify({
				choices: [
					{
						message: {
							tool_calls: [
								{
									id: "c1",
									function: {
										name: "get_top_flagged",
										arguments: "{limit: 5, status: 'pending'}",
									},
								},
							],
						},
					},
				],
			}),
		)
		expect(out.toolCalls[0].args).toEqual({ limit: 5, status: "pending" })
	})
})

describe("SSE bodies", () => {
	function sse(...frames: string[]): string {
		return frames.map((f) => `data: ${f}\n\n`).join("") + "data: [DONE]\n\n"
	}

	test("content deltas are concatenated", () => {
		const out = parseBody(
			sse(
				'{"choices":[{"delta":{"content":"ha"}}]}',
				'{"choices":[{"delta":{"content":"lo"}}]}',
			),
		)
		expect(out.content).toBe("halo")
	})

	test("one malformed frame does not drop the others", () => {
		const out = parseBody(
			sse(
				'{"choices":[{"delta":{"content":"ha"}}]}',
				'{"choices":[{"delta":{"content":"lo",}]}',
				'{"choices":[{"delta":{"content":"!"}}]}',
			),
		)
		expect(out.content).toBe("halo!")
	})

	test("tool calls split across frames are reassembled", () => {
		const out = parseBody(
			sse(
				'{"choices":[{"delta":{"tool_calls":[{"index":0,"id":"c1","function":{"name":"search_messages","arguments":"{\\"que"}}]}}]}',
				'{"choices":[{"delta":{"tool_calls":[{"index":0,"function":{"arguments":"ry\\":\\"judi\\"}"}}]}}]}',
			),
		)
		expect(out.toolCalls).toHaveLength(1)
		expect(out.toolCalls[0].name).toBe("search_messages")
		expect(out.toolCalls[0].args).toEqual({ query: "judi" })
	})

	test("keepalive and usage frames are ignored", () => {
		const out = parseBody(
			sse(
				'{"choices":[{"delta":{"content":"ok"}}]}',
				'{"usage":{"total_tokens":5}}',
			),
		)
		expect(out.content).toBe("ok")
	})
})
