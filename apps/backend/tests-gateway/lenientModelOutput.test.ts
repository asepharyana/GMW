/**
 * Near-miss model output: the batch must survive a formatting slip.
 *
 * Every case here is a real shape a model produces while stating the SAME
 * answer the contract asked for. Before the lenient reader, twelve of these
 * eighteen shapes failed outright — `parse_failed` (whole batch retried),
 * `invalid_status` (that message degraded to an error), or verdicts silently
 * dropped — and a rejection costs a full second LLM call for the whole batch.
 *
 * The other half of the contract is pinned here too: what must STILL fail. A
 * lenient reader that also repaired *decisions* would be worse than the strict
 * one, because a guessed `deleted` deletes a real message.
 */
import { describe, expect, test } from "vitest"
import {
	coerceNumber,
	coerceStringArray,
	coerceText,
	extractLenientJson,
	LenientJsonError,
	parseLenientJson,
	parseLenientJsonValue,
} from "../src/domain/utils/lenientJson.js"
import {
	normaliseStatus,
	parseVerdicts,
} from "../src/infrastructure/modules-gateway/ai-moderation/verdictParser.js"

/** Parse one raw reply for the two ids every case in this file uses. */
function parse(raw: string) {
	return parseVerdicts(raw, ["m1", "m2"], 1)
}

describe("syntax slips are read, not rejected", () => {
	test("a trailing comma in the object and in the array", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"clean","analysis":"a",},]}',
		)
		expect(out.batchFailed).toBe(false)
		expect(out.verdicts).toHaveLength(1)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("single-quoted keys and values", () => {
		const out = parse(
			"{'results':[{'message_id':'m1','status':'clean','analysis':'a'}]}",
		)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("unquoted keys and bare-word values", () => {
		const out = parse('{results:[{message_id:"m1",status:clean,analysis:"a"}]}')
		expect(out.verdicts[0].status).toBe("clean")
		expect(out.verdicts[0].analysis).toBe("a")
	})

	test("a // note and a /* */ block inside the JSON", () => {
		const out = parse(
			'{"results":[ // verdicts follow\n {"message_id":"m1","status":"clean",/* ok */"analysis":"a"}]}',
		)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("a URL in a string is not mistaken for a comment", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"deleted","reason":"lihat https://contoh.id/x","analysis":"a"}]}',
		)
		expect(out.verdicts[0].reason).toBe("lihat https://contoh.id/x")
	})

	test("Python spellings: None, True, False", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"clean","analysis":"a","evidence":None,"ok":True}]}',
		)
		expect(out.verdicts[0].status).toBe("clean")
		expect(out.verdicts[0].evidence).toEqual([])
	})

	test("smart quotes and full-width punctuation", () => {
		const out = parse(
			"\u201Cresults\u201D\uFF1A[\u007B\u201Cmessage_id\u201D\uFF1A\u201Cm1\u201D,\u201Cstatus\u201D\uFF1A\u201Cclean\u201D,\u201Canalysis\u201D\uFF1A\u201Ca\u201D\u007D]",
		)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("a YAML-style colon written as =", () => {
		const out = parse(
			'{"results":[{"message_id"="m1","status"="clean","analysis"="a"}]}',
		)
		expect(out.verdicts[0].status).toBe("clean")
	})
})

describe("packaging slips are read", () => {
	test("a fenced block with no language tag", () => {
		const out = parse(
			'```\n{"results":[{"message_id":"m1","status":"clean","analysis":"a"}]}\n```',
		)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("an UNCLOSED fence still yields the JSON inside it", () => {
		const out = parse(
			'```json\n{"results":[{"message_id":"m1","status":"clean","analysis":"a"}]}',
		)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("prose with brackets before the payload does not win", () => {
		const out = parse(
			'Analisis [link] berikut: {"results":[{"message_id":"m1","status":"clean","analysis":"a"}]}',
		)
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("a double-encoded payload", () => {
		const inner = JSON.stringify({
			results: [{ message_id: "m1", status: "clean", analysis: "a" }],
		})
		const out = parse(JSON.stringify(inner))
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("the list wrapped under a different key", () => {
		for (const key of ["verdicts", "data", "items"]) {
			const out = parse(
				JSON.stringify({
					[key]: [{ message_id: "m1", status: "clean", analysis: "a" }],
				}),
			)
			expect(out.verdicts[0].status).toBe("clean")
		}
	})

	test("no wrapper at all", () => {
		const out = parse('[{"message_id":"m1","status":"clean","analysis":"a"}]')
		expect(out.verdicts[0].status).toBe("clean")
	})

	test("results keyed by message id", () => {
		const out = parse('{"results":{"m1":{"status":"clean","analysis":"a"}}}')
		expect(out.verdicts[0].status).toBe("clean")
		expect(out.verdicts[0].messageId).toBe("m1")
	})

	test("one verdict with no wrapper at all", () => {
		const out = parse('{"message_id":"m1","status":"clean","analysis":"a"}')
		expect(out.verdicts[0].status).toBe("clean")
	})
})

describe("field-level slips are read", () => {
	test("status case, padding and stray punctuation", () => {
		for (const raw of ["Clean", "CLEAN", " clean. ", '"clean"', "clean\n"]) {
			expect(normaliseStatus(raw)).toBe("clean")
		}
		expect(normaliseStatus("Deleted")).toBe("deleted")
	})

	test("the imperative spellings of the two decisions", () => {
		expect(normaliseStatus("delete")).toBe("deleted")
		expect(normaliseStatus("remove")).toBe("deleted")
		expect(normaliseStatus("keep")).toBe("clean")
	})

	test("the id field under another name", () => {
		for (const key of ["messageId", "messageID", "msg_id", "id"]) {
			const out = parse(
				JSON.stringify({
					results: [{ [key]: "m1", status: "clean", analysis: "a" }],
				}),
			)
			expect(out.verdicts.map((v) => v.messageId)).toEqual(["m1"])
		}
	})

	test("flags as one string, as CSV, and as a JSON array in a string", () => {
		const single = parse(
			'{"results":[{"message_id":"m1","status":"deleted","reason":"x","flags":"harassment","analysis":"a"}]}',
		)
		expect(single.verdicts[0].categories).toEqual(["harassment"])

		const csv = parse(
			'{"results":[{"message_id":"m1","status":"deleted","reason":"x","flags":"spam, scam","analysis":"a"}]}',
		)
		expect(csv.verdicts[0].categories).toEqual(["spam", "scam"])

		const encoded = parse(
			'{"results":[{"message_id":"m1","status":"deleted","reason":"x","flags":"[\\"spam\\",\\"scam\\"]","analysis":"a"}]}',
		)
		expect(encoded.verdicts[0].categories).toEqual(["spam", "scam"])
	})

	test("a name category written as an object still resets the nickname", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"deleted","categories":[{"name":"offensive_nickname"}],"analysis":"a"}]}',
		)
		expect(out.verdicts[0].categories).toEqual(["offensive_nickname"])
		expect(out.verdicts[0].action).toBe("reset_nickname")
	})

	test("analysis as an array of sentences is joined, not discarded", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"clean","analysis":["Kalimat satu.","Kalimat dua."]}]}',
		)
		expect(out.verdicts[0].analysis).toBe("Kalimat satu. Kalimat dua.")
	})

	test("confidence as a percent and with a decimal comma", () => {
		const percent = parse(
			'{"results":[{"message_id":"m1","status":"deleted","reason":"x","confidence":"85%","analysis":"a"}]}',
		)
		expect(percent.verdicts[0].confidence).toBeCloseTo(0.85, 5)

		const comma = parse(
			'{"results":[{"message_id":"m1","status":"deleted","reason":"x","confidence":"0,9","analysis":"a"}]}',
		)
		expect(comma.verdicts[0].confidence).toBeCloseTo(0.9, 5)
	})
})

describe("truncation keeps the complete answers", () => {
	// A 40-verdict batch overruns max_tokens. Before, the cut reply failed the
	// whole batch; now the finished entries persist and only the cut one is
	// reported missing.
	test("the complete entries survive and the cut one is missing", () => {
		const raw =
			'{"results":[{"message_id":"m1","status":"clean","analysis":"a"},{"message_id":"m2","status":"cle'
		const out = parse(raw)
		expect(out.batchFailed).toBe(false)
		expect(out.verdicts).toHaveLength(1)
		expect(out.verdicts[0].messageId).toBe("m1")
		// The cut entry is NOT persisted as a guess; it is re-queued.
		expect(out.missing).toEqual(["m2"])
	})

	test("a cut inside a string does not corrupt the completed sibling", () => {
		const raw =
			'{"results":[{"message_id":"m1","status":"deleted","reason":"hinaan","analysis":"a"},{"message_id":"m2","status":"deleted","reason":"hina'
		const out = parse(raw)
		expect(out.verdicts).toHaveLength(1)
		expect(out.verdicts[0].status).toBe("deleted")
		expect(out.verdicts[0].reason).toBe("hinaan")
	})
})

describe("what must STILL fail", () => {
	// A lenient reader that repaired decisions would delete real messages.
	test("a status outside the two decisions stays an error", () => {
		for (const status of ["warn", "flagged", "review", "maybe", "error"]) {
			const out = parse(
				JSON.stringify({
					results: [{ message_id: "m1", status, analysis: "a" }],
				}),
			)
			expect(out.verdicts[0].status).toBe("error")
			expect(out.verdicts[0].perMessageError).toBe("invalid_status")
			expect(out.verdicts[0].action).toBe("clean")
			expect(out.verdicts[0].confidence).toBe(0)
		}
	})

	test("a missing status is an error, not a clean", () => {
		const out = parse('{"results":[{"message_id":"m1","analysis":"a"}]}')
		expect(out.verdicts[0].status).toBe("error")
	})

	test("a refusal with no JSON at all fails the batch", () => {
		const out = parse("Saya tidak bisa membantu dengan itu.")
		expect(out.batchFailed).toBe(true)
		expect(out.verdicts.every((v) => v.status === "error")).toBe(true)
	})

	test("JSON with no verdict list fails the batch", () => {
		const out = parse('{"foo":1}')
		expect(out.batchFailed).toBe(true)
	})

	test("a message the model never mentioned is missing, not clean", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"clean","analysis":"a"}]}',
		)
		expect(out.missing).toEqual(["m2"])
		expect(out.verdicts).toHaveLength(1)
	})

	test("an unrequested id is ignored", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"clean","analysis":"a"},{"message_id":"NOPE","status":"deleted","reason":"x","analysis":"x"}]}',
		)
		expect(out.verdicts.map((v) => v.messageId)).toEqual(["m1"])
	})
})

describe("deletion reason is never empty", () => {
	// `verdicts_reason_check` rejects a `deleted` row with no reason, so a
	// decision with no prose must still produce a persistable row.
	test("reason falls back to the analysis", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"deleted","analysis":"memuat tautan judi"}]}',
		)
		expect(out.verdicts[0].reason).toBe("memuat tautan judi")
	})

	test("with no reason and no analysis it states the category", () => {
		const out = parse(
			'{"results":[{"message_id":"m1","status":"deleted","categories":["spam"]}]}',
		)
		expect(out.verdicts[0].reason).toBeTruthy()
		expect(out.verdicts[0].reason).toContain("spam")
		// And the analysis must not claim there was no violation.
		expect(out.verdicts[0].analysis).not.toContain("Tidak ada indikasi")
	})

	test("a clean verdict keeps the boilerplate analysis", () => {
		const out = parse('{"results":[{"message_id":"m1","status":"clean"}]}')
		expect(out.verdicts[0].analysis).toContain("Tidak ada indikasi")
	})
})

describe("the reader itself", () => {
	test("nested braces and an escaped quote inside a string", () => {
		const value = parseLenientJson(
			'noise {"a":{"b":"} not the end"},"c":[1,2]} trailing',
		).value
		expect(value).toEqual({ a: { b: "} not the end" }, c: [1, 2] })
	})

	test("a raw newline inside a string is kept", () => {
		const value = parseLenientJson('{"analysis":"baris satu\nbaris dua"}').value
		expect(value).toEqual({ analysis: "baris satu\nbaris dua" })
	})

	test("truncation is reported, and the closed containers are named", () => {
		const parsed = parseLenientJson('{"results":[{"a":1},{"b":')
		expect(parsed.truncated).toBe(true)
		expect(parsed.incomplete.size).toBeGreaterThan(0)
	})

	test("an unclosed container is not reported when the text is complete", () => {
		const parsed = parseLenientJson('{"results":[]}')
		expect(parsed.truncated).toBe(false)
		expect(parsed.incomplete.size).toBe(0)
	})

	test("no container at all throws", () => {
		expect(() => extractLenientJson("no json here")).toThrow(LenientJsonError)
	})

	test("a sibling key on the payload object is kept", () => {
		// Taking the inner array instead of the object silently dropped `model`.
		const value = parseLenientJson(
			'{"model":"x","results":[{"message_id":"m1","status":"clean"}]}',
		).value
		expect(value).toEqual({
			model: "x",
			results: [{ message_id: "m1", status: "clean" }],
		})
	})

	test("a 19-digit snowflake keeps every digit", () => {
		// `Number()` would change the last digits, filing the verdict against a
		// message id that does not exist.
		const id = "1234567890123456789"
		const parsed = parseLenientJson(`{"message_id":${id}}`)
		expect(parsed.value).toEqual({ message_id: id })
	})

	test("an array of objects is not reduced to its first element", () => {
		// The outermost container is the answer; a scan that considered nested
		// braces would return one verdict out of many.
		const value = parseLenientJson(
			'[{"message_id":"m1","status":"clean"},{"message_id":"m2","status":"deleted"}]',
		).value
		expect(Array.isArray(value)).toBe(true)
		expect((value as unknown[]).length).toBe(2)
	})

	test("a double-encoded tool argument is unwrapped", () => {
		const encoded = JSON.stringify(JSON.stringify({ query: "judi" }))
		expect(parseLenientJsonValue(encoded)).toEqual({ query: "judi" })
	})
})

describe("coercion helpers", () => {
	test("coerceStringArray", () => {
		expect(coerceStringArray(["spam"])).toEqual(["spam"])
		expect(coerceStringArray("spam")).toEqual(["spam"])
		expect(coerceStringArray("spam, scam")).toEqual(["spam", "scam"])
		expect(coerceStringArray(["spam", "spam"])).toEqual(["spam"])
		expect(coerceStringArray('["spam","scam"]')).toEqual(["spam", "scam"])
		expect(coerceStringArray(null)).toEqual([])
		expect(coerceStringArray([])).toEqual([])
		expect(coerceStringArray({ unrelated: "x" })).toEqual([])
	})

	test("coerceText", () => {
		expect(coerceText("a")).toBe("a")
		expect(coerceText(["a", "b"])).toBe("a b")
		expect(coerceText({ text: "a" })).toBe("a")
		expect(coerceText(null)).toBe("")
		expect(coerceText({})).toBe("")
	})

	test("coerceNumber", () => {
		expect(coerceNumber(0.5)).toBe(0.5)
		expect(coerceNumber("0.5")).toBe(0.5)
		expect(coerceNumber("0,5")).toBe(0.5)
		expect(coerceNumber("85%")).toBe(0.85)
		expect(coerceNumber("nope")).toBeUndefined()
		expect(coerceNumber(Number.NaN)).toBeUndefined()
		expect(coerceNumber(null)).toBeUndefined()
	})
})
