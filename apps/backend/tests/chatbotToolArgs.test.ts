/**
 * Tool arguments: the model states the intent, the reader must find it.
 *
 * `search_messages` used to read only `args.query`, so a model that sent
 * `{"queries":["judi","togel"]}` (the plural is natural, and one provider
 * encodes the array as a JSON string) searched for the EMPTY string. The tool
 * then returned a flood of unrelated rows and the model reported it as an
 * answer. These tests pin the shapes that must resolve to a real query, and the
 * ones that must still resolve to nothing.
 */
import { describe, expect, test } from "vitest"
import {
	readIdArg,
	readQueryArg,
} from "../src/infrastructure/repositories/chatbot.tools.js"

describe("readQueryArg", () => {
	test("the documented singular field", () => {
		expect(readQueryArg({ query: "judi" })).toBe("judi")
	})

	test("the plural field as an array", () => {
		expect(readQueryArg({ queries: ["judi", "togel"] })).toBe("judi togel")
	})

	test("the plural field as a JSON string", () => {
		// The exact shape that made the search run against an empty string.
		expect(readQueryArg({ queries: '["judi","togel"]' })).toBe("judi togel")
	})

	test("the plural field as CSV", () => {
		expect(readQueryArg({ queries: "judi, togel" })).toBe("judi togel")
	})

	test("synonym field names", () => {
		expect(readQueryArg({ q: "judi" })).toBe("judi")
		expect(readQueryArg({ keyword: "judi" })).toBe("judi")
		expect(readQueryArg({ keywords: ["judi"] })).toBe("judi")
	})

	test("an empty or missing query stays empty", () => {
		expect(readQueryArg({})).toBe("")
		expect(readQueryArg({ query: "   " })).toBe("")
		expect(readQueryArg({ queries: [] })).toBe("")
		expect(readQueryArg({ query: 42 })).toBe("")
	})
})

describe("readIdArg", () => {
	test("a string id", () => {
		expect(readIdArg("123456789012345678")).toBe("123456789012345678")
	})

	test("a quoted string id", () => {
		expect(readIdArg('"123"')).toBe("123")
	})

	// A snowflake written as a NUMBER lost its identity entirely: the tool
	// received `undefined` and queried the whole guild.
	test("a numeric id", () => {
		expect(readIdArg(123)).toBe("123")
	})

	test("absent or unusable values", () => {
		expect(readIdArg(undefined)).toBeUndefined()
		expect(readIdArg(null)).toBeUndefined()
		expect(readIdArg("")).toBeUndefined()
		expect(readIdArg(Number.NaN)).toBeUndefined()
		expect(readIdArg({})).toBeUndefined()
	})
})
