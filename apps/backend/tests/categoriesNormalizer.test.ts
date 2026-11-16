import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { describe, expect, it } from "vitest"

/**
 * Regression guard for the `moderation_actions.categories` normalizer.
 *
 * WHY THIS EXISTS
 * The column is `text` and has been written in two different shapes:
 *   `["gambling","scam"]`  (JSON array)  and  `harassment` / `a, b`  (bare)
 * 172 of 1403 live rows use the bare shape. Both `getTrends` and
 * `getByCategory` used to cast it with `::jsonb`, which aborts the ENTIRE
 * query on the first bad row — so a whole table became unreadable and both
 * procedures returned HTTP 500 on every call.
 *
 * The normalizer started life as a cast-free SQL expression built from
 * `regexp_matches` / `regexp_split_to_array`, and now lives in JS as
 * `normalizeCategories()`. Its behavioural contract is pinned by
 * `normalizeCategories.test.ts`; these tests hold the *source-level* guards
 * that a behavioural test cannot see.
 */

const repoPath = fileURLToPath(
	new URL(
		"../src/infrastructure/repositories/moderation.repository.ts",
		import.meta.url,
	),
)
const rawSource = readFileSync(repoPath, "utf8")

/** Strip comments so prose explaining a past bug can't fail the assertions. */
function stripComments(src: string): string {
	return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "")
}

const source = stripComments(rawSource)

/** Slice the body of `normalizeCategories` out of the module source. */
function normalizerBody(): string {
	const start = source.indexOf("export function normalizeCategories")
	expect(start).toBeGreaterThan(-1)
	// Stop at the next top-level `export`/`function` so the window cannot spill
	// into an unrelated helper (e.g. `parseJsonArray`, which legitimately uses
	// JSON.parse behind a try/catch).
	const rest = source.slice(start + 1)
	const end = rest.search(/\n(?:export |\/\*\*|function )/)
	return end === -1 ? rest : rest.slice(0, end)
}

describe("categories normalizer", () => {
	it("is exported so it can be unit-tested directly", () => {
		expect(source).toContain("export function normalizeCategories")
	})

	it("performs NO jsonb cast — a cast is what made the query abort", () => {
		// `::jsonb` and `jsonb_array_elements_text(<col>::jsonb)` are the two
		// shapes that raise "invalid input syntax for type json". Neither may
		// return: the normalizer is pure text handling, so no input can throw.
		expect(source).not.toContain("::jsonb")
		expect(source).not.toContain("jsonb_array_elements_text")
	})

	it("does not parse the column as JSON", () => {
		// `JSON.parse` inside the normalizer would reintroduce the
		// throw-on-malformed-input failure that the original SQL was carefully
		// written to avoid. (A guarded `JSON.parse` elsewhere in the module, such
		// as `parseJsonArray`, is a different concern and is fine.)
		expect(normalizerBody()).not.toContain("JSON.parse")
	})

	it("never yields an empty-string category", () => {
		// The old SQL guarded this with NULLIF(..., ARRAY['']); in JS the filter
		// inside normalizeCategories is what prevents a phantom empty category.
		const body = normalizerBody()
		expect(body).toContain(".filter(")
		expect(body).toContain(".length > 0")
	})
})

describe("categories normalizer is used everywhere categories are queried", () => {
	it("getTrends aggregates through the normalizer", () => {
		const body = source.slice(
			source.indexOf("async getTrends"),
			source.indexOf("async getTopFlaggedDomains"),
		)
		expect(body).toContain("normalizeCategories")
		expect(body).not.toContain("categories::jsonb")
	})

	it("getByCategory filters through the normalizer", () => {
		const body = source.slice(
			source.indexOf("async getByCategory"),
			source.indexOf("async getCoverage"),
		)
		expect(body).toContain("normalizeCategories")
		expect(body).not.toContain("categories::jsonb")
	})

	it("no method casts the categories column any more", () => {
		expect(source).not.toContain("categories::jsonb")
	})
})

describe("getTopFlaggedDomains reads content from messages", () => {
	it("does not reference the nonexistent moderation_actions.content column", () => {
		const body = source.slice(
			source.indexOf("async getTopFlaggedDomains"),
			source.indexOf("async getTopFlaggedChannels"),
		)
		// a.content never existed; the message body lives on messages.content.
		expect(body).not.toContain("a.content")
		// The lookup is shared (`loadMessageContents`), so the method delegates to
		// it and the helper is what must read `messages.content`.
		expect(body).toContain("loadMessageContents")
		const helper = source.slice(
			source.indexOf("private async loadMessageContents"),
			source.indexOf("async getStats"),
		)
		expect(helper).toContain("messagesTable.content")
	})
})
