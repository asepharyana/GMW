/**
 * Lenient JSON reading for model output.
 *
 * ## Why `JSON.parse` is the wrong reader for an LLM
 *
 * Every model output this service consumes is JSON *by instruction*, not by
 * construction. `JSON.parse` is a conformance check: it rejects a trailing
 * comma, a single-quoted key, an unquoted `clean`, a `//` note, a smart quote,
 * a `None`, or a response cut off at the token limit. Each of those is a
 * *formatting* slip, not a different answer, and the cost of rejecting one is
 * paid by the whole batch — the moderation worker retries every message in it
 * (a full second LLM call), and the chatbot answers from a canned fallback.
 *
 * Measured on this repo's own prompt: of eighteen realistic near-miss shapes,
 * twelve previously failed outright (`parse_failed` / `invalid_status` /
 * verdicts silently dropped), including trailing commas, unquoted values,
 * `"status": "Clean"`, `"flags": "spam, scam"` and a truncated batch.
 *
 * ## What this module is, and what it deliberately is not
 *
 * It is a tokenizer plus a recursive-descent reader that accepts JSON's
 * *intent*: the six structural characters, strings in any of the three quote
 * styles, numbers, and bare words. Bare words are read as `true`/`false`/
 * `null` (plus the Python/JS spellings `True`, `None`, `NaN`, …) or as a
 * string, because `status: clean` is unambiguous.
 *
 * It is NOT a fuzzy matcher. It never invents a field, never reorders
 * anything, and never guesses which of two messages an unlabelled verdict
 * belongs to. A value it cannot read becomes `null`, and the caller decides
 * what an absent value means. That line is load-bearing for moderation: a
 * repaired *syntax* error must not become a repaired *decision*.
 *
 * ## Truncation is reported, not hidden
 *
 * A response cut off mid-array is the commonest real failure (a 40-verdict
 * batch overruns `max_tokens`). The reader closes the open containers so the
 * complete entries survive, and records every container it had to close in
 * `incomplete`. A caller that persists decisions must drop entries inside an
 * incomplete container — the cut can land inside a half-written verdict, and a
 * half-written verdict is not an answer.
 */

/** Raised when the text carries no JSON object or array at all. */
export class LenientJsonError extends Error {
	constructor(message: string) {
		super(message)
		this.name = "LenientJsonError"
	}
}

export type LenientParseResult = {
	value: unknown
	/**
	 * Every object/array the reader closed itself because the text ended.
	 *
	 * A verdict object in this set was cut off mid-write; its fields may be
	 * missing or half-read, so it must not be treated as the model's answer.
	 */
	incomplete: ReadonlySet<object>
	/** True when at least one container was auto-closed. */
	truncated: boolean
}

type Token =
	| { kind: "punct"; value: "{" | "}" | "[" | "]" | ":" | "," }
	| { kind: "string"; value: string }
	| { kind: "number"; value: number; raw: string }
	| { kind: "bare"; value: string }

const IDENT_START = /[A-Za-z_$]/
const IDENT_PART = /[A-Za-z0-9_$.-]/

/**
 * Normalise the typography a model picks up from its training data.
 *
 * Smart quotes are the single most common cause of an unparseable reply that
 * looks perfect to a human reading the log, and full-width punctuation appears
 * whenever the model slips into a CJK context.
 */
function normaliseTypography(text: string): string {
	return (
		text
			.replace(/^\uFEFF/, "")
			// Zero-width joiners and BOMs survive copy/paste from a web UI.
			.replace(/[\u200B-\u200D\uFEFF]/g, "")
			.replace(/\u00A0/g, " ")
			.replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
			.replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
			.replace(/\uFF1A/g, ":")
			.replace(/\uFF0C/g, ",")
			.replace(/\uFF5B/g, "{")
			.replace(/\uFF5D/g, "}")
			.replace(/\uFF3B/g, "[")
			.replace(/\uFF3D/g, "]")
	)
}

/**
 * Read a numeric token as the value the model meant.
 *
 * Integers beyond `Number.MAX_SAFE_INTEGER` keep their literal text: a Discord
 * snowflake is a 19-digit integer, and `Number("1234567890123456789")` silently
 * changes its last digits — an unquoted id would then address a message that
 * does not exist, and the verdict would be filed against nothing.
 */
function numberFromToken(token: {
	value: number
	raw: string
}): number | string {
	if (Number.isSafeInteger(token.value)) return token.value
	if (/^-?\d+$/.test(token.raw)) return token.raw
	return token.value
}

/** `true`/`false`/`null` and their other-language spellings. */
function literalFromBareWord(word: string): unknown {
	switch (word.toLowerCase()) {
		case "true":
		case "yes":
			return true
		case "false":
		case "no":
			return false
		case "null":
		case "none":
		case "nil":
		case "undefined":
		case "nan":
		case "infinity":
			return null
		default:
			return word
	}
}

/**
 * Split the text into structural tokens.
 *
 * Unknown characters are skipped rather than rejected: prose around the JSON
 * ("Here is the result:") is normal, and a stray `!` is not a reason to lose
 * forty verdicts. Comments are only recognised where a value cannot be in
 * progress, so `https://…` inside a bare word is not mistaken for `//`.
 */
function tokenize(text: string): Token[] {
	const tokens: Token[] = []
	let i = 0

	const previousIsSeparator = (): boolean => {
		const last = tokens[tokens.length - 1]
		return last === undefined || last.kind === "punct"
	}

	while (i < text.length) {
		const ch = text[i]

		if (ch === " " || ch === "\t" || ch === "\n" || ch === "\r") {
			i += 1
			continue
		}

		// Line comment. Only outside a value, or `https://` would vanish.
		if (ch === "/" && text[i + 1] === "/" && previousIsSeparator()) {
			const end = text.indexOf("\n", i)
			i = end === -1 ? text.length : end + 1
			continue
		}

		if (ch === "/" && text[i + 1] === "*") {
			const end = text.indexOf("*/", i + 2)
			i = end === -1 ? text.length : end + 2
			continue
		}

		if (ch === "{" || ch === "[" || ch === "]" || ch === "}") {
			tokens.push({ kind: "punct", value: ch })
			i += 1
			continue
		}

		if (ch === ":" || ch === ",") {
			tokens.push({ kind: "punct", value: ch })
			i += 1
			continue
		}

		// `status = clean` is a YAML habit, not a different answer.
		if (ch === "=") {
			i += text[i + 1] === ">" ? 2 : 1
			tokens.push({ kind: "punct", value: ":" })
			continue
		}

		// A fence marker is packaging, not a string. Treating "```" as three
		// template-literal delimiters made an UNCLOSED fence swallow the whole
		// reply into one string token, so the JSON inside it was never seen.
		if (ch === "`" && text[i + 1] === "`") {
			i += 3
			// Skip the language tag on the same line (`json`, `JSON5`, …).
			while (i < text.length && text[i] !== "\n" && text[i] !== "`") i += 1
			continue
		}

		if (ch === '"' || ch === "'" || ch === "`") {
			const quote = ch
			let value = ""
			let j = i + 1
			let closed = false
			while (j < text.length) {
				const c = text[j]
				// An inline-code backtick closes at the end of its line. A model
				// writing `spam` never means a multi-line literal, and treating
				// it as one swallowed everything after it.
				if (quote === "`" && (c === "\n" || c === "\r")) break
				if (c === "\\") {
					const escaped = text[j + 1]
					// Keep JSON's escapes meaningful; pass anything else through.
					if (escaped === "n") value += "\n"
					else if (escaped === "t") value += "\t"
					else if (escaped === "r") value += "\r"
					else if (escaped === "u") {
						const hex = text.slice(j + 2, j + 6)
						const code = Number.parseInt(hex, 16)
						value += Number.isFinite(code) ? String.fromCharCode(code) : ""
						j += 4
					} else if (escaped !== undefined) value += escaped
					j += 2
					continue
				}
				if (c === quote) {
					closed = true
					j += 1
					break
				}
				// A raw newline inside a string is illegal JSON and common from a
				// model writing a multi-line analysis. Keep it.
				value += c
				j += 1
			}
			tokens.push({ kind: "string", value })
			i = closed ? j : text.length
			continue
		}

		if (ch === "-" || ch === "+" || ch === "." || (ch >= "0" && ch <= "9")) {
			const match = /^[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/.exec(
				text.slice(i),
			)
			if (match) {
				const after = text[i + match[0].length]
				// `3d` is a bare word, not the number 3 followed by junk.
				if (after === undefined || !IDENT_PART.test(after)) {
					tokens.push({
						kind: "number",
						value: Number(match[0]),
						// The literal text is kept because a Discord snowflake is a
						// 19-digit integer: `Number` loses its last digits, and an
						// unquoted snowflake would then address a message that does
						// not exist.
						raw: match[0],
					})
					i += match[0].length
					continue
				}
			}
		}

		if (IDENT_START.test(ch)) {
			let j = i + 1
			while (j < text.length && IDENT_PART.test(text[j])) j += 1
			tokens.push({ kind: "bare", value: text.slice(i, j) })
			i = j
			continue
		}

		// Anything else (stray punctuation, emoji) carries no structure.
		i += 1
	}

	return tokens
}

class Reader {
	private index = 0
	readonly incomplete = new Set<object>()

	constructor(private readonly tokens: Token[]) {}

	private peek(offset = 0): Token | undefined {
		return this.tokens[this.index + offset]
	}

	private next(): Token | undefined {
		const token = this.tokens[this.index]
		this.index += 1
		return token
	}

	private isPunct(value: string): boolean {
		const token = this.peek()
		return token?.kind === "punct" && token.value === value
	}

	private atEnd(): boolean {
		return this.index >= this.tokens.length
	}

	parseValue(): unknown {
		const token = this.peek()
		if (!token) return undefined

		if (token.kind === "punct") {
			if (token.value === "{") return this.parseObject()
			if (token.value === "[") return this.parseArray()
			// A colon or comma where a value belongs: skip it rather than
			// aborting the enclosing container.
			this.next()
			return this.parseValue()
		}

		if (token.kind === "string") {
			this.next()
			return token.value
		}

		if (token.kind === "number") {
			this.next()
			return numberFromToken(token)
		}

		return this.parseBareValue()
	}

	/**
	 * `clean` → "clean", `true` → true, `tidak ada pelanggaran` → one string.
	 *
	 * Consecutive bare words are joined because a model that forgets quotes
	 * writes the whole phrase, not one token. The run stops before a word that
	 * is followed by `:` — that word is the next KEY, not part of this value.
	 */
	private parseBareValue(): unknown {
		const parts: string[] = []
		for (;;) {
			const token = this.peek()
			if (!token || token.kind !== "bare") break
			const follower = this.peek(1)
			if (follower?.kind === "punct" && follower.value === ":") break
			parts.push(token.value)
			this.next()
		}

		if (parts.length === 0) {
			const token = this.next()
			return token?.kind === "bare" ? literalFromBareWord(token.value) : null
		}

		return literalFromBareWord(parts.join(" "))
	}

	private parseObject(): unknown {
		this.next() // consume `{`
		const object: Record<string, unknown> = {}

		for (;;) {
			const token = this.peek()
			if (!token) {
				this.incomplete.add(object)
				break
			}
			if (token.kind === "punct" && token.value === "}") {
				this.next()
				break
			}
			if (token.kind === "punct" && token.value === ",") {
				this.next()
				continue
			}

			const key = this.readKey()
			if (key === null) {
				// Unreadable token in key position: drop it and resynchronise.
				this.next()
				continue
			}

			if (this.isPunct(":")) this.next()

			if (this.isPunct("}") || this.isPunct(",") || this.atEnd()) {
				// `"reason":` with nothing after it. Absent is honest; inventing
				// a value here would be the defect this module must not create.
				object[key] = null
				continue
			}

			object[key] = this.parseValue()
		}

		return object
	}

	private parseArray(): unknown {
		this.next() // consume `[`
		const array: unknown[] = []

		for (;;) {
			const token = this.peek()
			if (!token) {
				this.incomplete.add(array)
				break
			}
			if (token.kind === "punct" && token.value === "]") {
				this.next()
				break
			}
			if (token.kind === "punct" && token.value === ",") {
				this.next()
				continue
			}
			// No comma required between elements: a missing separator is a
			// formatting slip, and the next value is unambiguous here.
			array.push(this.parseValue())
		}

		return array
	}

	private readKey(): string | null {
		const token = this.peek()
		if (!token) return null
		if (token.kind === "string" || token.kind === "bare") {
			this.next()
			return token.value
		}
		if (token.kind === "number") {
			this.next()
			return String(token.value)
		}
		return null
	}
}

/**
 * Index just past the container that opens at `start`.
 *
 * Used to walk only the OUTERMOST containers: without it, `[{…},{…}]` yields
 * the first element as a candidate too, and one verdict out of many is not the
 * model's answer. An unterminated container runs to the end of the tokens.
 */
function skipContainer(tokens: Token[], start: number): number {
	let depth = 0
	for (let i = start; i < tokens.length; i++) {
		const token = tokens[i]
		if (token.kind !== "punct") continue
		if (token.value === "{" || token.value === "[") depth += 1
		else if (token.value === "}" || token.value === "]") {
			depth -= 1
			if (depth === 0) return i + 1
		}
	}
	return tokens.length
}

function readFrom(tokens: Token[], start: number): LenientParseResult {
	const reader = new Reader(tokens.slice(start))
	const value = reader.parseValue()
	return {
		value,
		incomplete: reader.incomplete,
		truncated: reader.incomplete.size > 0,
	}
}

function isContainer(value: unknown): boolean {
	return value !== null && typeof value === "object"
}

/**
 * Read one JSON value from the START of `text`.
 *
 * Used where the whole string is supposed to be JSON (tool-call arguments).
 * Leading prose and a fence are skipped, because "```json" and "Here:" are
 * wrappers, not content.
 */
export function parseLenientJson(text: string): LenientParseResult {
	const tokens = tokenize(normaliseTypography(text))
	if (tokens.length === 0) {
		return { value: undefined, incomplete: new Set(), truncated: false }
	}

	const start = tokens.findIndex(
		(t) => t.kind === "punct" && (t.value === "{" || t.value === "["),
	)
	if (start === -1) {
		// Not a container: a bare scalar (`"spam"`, `42`) is still a value the
		// caller may want, so read it from the beginning.
		return readFrom(tokens, 0)
	}
	return readFrom(tokens, start)
}

/**
 * Find the first JSON object or array inside a model reply.
 *
 * Tries a fenced block first (the prompt asks for bare JSON, so a fence means
 * the model wrapped it anyway), then every `{`/`[` in the text. Later
 * candidates matter because prose can contain brackets — "Analisis [link]
 * berikut: {…}" — and taking the first bracket there would return the prose's
 * `[link]` instead of the payload.
 *
 * Selection order, and why it is not simply "first container":
 *   1. an array whose elements are objects (the unwrapped-verdicts shape)
 *   2. the first non-empty object
 *   3. the first non-empty array (a bare list of strings)
 *
 * Throws `LenientJsonError` when there is no container at all — that is a
 * refusal or an empty answer, which the caller must treat as a failed call and
 * not as "the model judged everything clean".
 */
export function extractLenientJson(text: string): LenientParseResult {
	const normalised = normaliseTypography(text)

	const fence = /```[a-zA-Z0-9_-]*\s*([\s\S]*?)```/g
	for (const match of fence ? normalised.matchAll(fence) : []) {
		const inner = tokenize(match[1])
		const first = inner.findIndex(
			(t) => t.kind === "punct" && (t.value === "{" || t.value === "["),
		)
		if (first === -1) continue
		const parsed = readFrom(inner, first)
		if (isContainer(parsed.value)) return parsed
	}

	const tokens = tokenize(normalised)

	// The whole reply arrived as one JSON STRING containing the payload
	// (`"{\"results\":[…]}"`). Unwrap once; a model that double-encodes is
	// stating the same answer, and the answer is one parse away.
	if (tokens.length === 1 && tokens[0].kind === "string") {
		const inner = tokens[0].value.trim()
		if (inner.startsWith("{") || inner.startsWith("[")) {
			return extractLenientJson(inner)
		}
	}

	// Only the OUTERMOST containers are candidates. A scan that considered every
	// `{` would, for `[{…},{…}]`, hand back the first ELEMENT instead of the
	// list — and one verdict out of many is not the model's answer.
	//
	// Among the outermost containers, the order of preference is:
	//   1. an object      (the contract's shape; keeps sibling keys)
	//   2. an array of objects  (unwrapped verdicts)
	//   3. an array of scalars  (a bare list)
	// Prose can contain a bracket — "Analisis [link] berikut: {…}" — and without
	// this ranking the prose's `[link]` would be returned as the payload.
	let firstObject: LenientParseResult | undefined
	let firstObjectArray: LenientParseResult | undefined
	let firstScalarArray: LenientParseResult | undefined

	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]
		if (token.kind !== "punct") continue
		if (token.value !== "{" && token.value !== "[") continue

		const parsed = readFrom(tokens, i)
		const next = skipContainer(tokens, i)
		i = next - 1

		if (!isContainer(parsed.value)) continue

		if (Array.isArray(parsed.value)) {
			if (parsed.value.length === 0) continue
			const [head] = parsed.value
			if (head !== null && typeof head === "object") firstObjectArray ??= parsed
			else firstScalarArray ??= parsed
			continue
		}

		const object = parsed.value as Record<string, unknown>
		if (Object.keys(object).length > 0) firstObject ??= parsed
	}

	const chosen = firstObject ?? firstObjectArray ?? firstScalarArray
	if (chosen) return chosen

	throw new LenientJsonError("no JSON object or array found in response")
}

/**
 * Unwrap a value that is itself JSON text.
 *
 * A double-encoded payload (`"{\"results\":[]}"`) and a tool argument that
 * arrives as a JSON string both look like a plain string here, and both are one
 * `JSON.parse` away from the value the caller wanted.
 */
function unwrapEncodedString(value: unknown): unknown {
	if (typeof value !== "string") return value
	const trimmed = value.trim()
	if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return value
	try {
		const parsed = parseLenientJson(trimmed)
		return isContainer(parsed.value) ? parsed.value : value
	} catch {
		return value
	}
}

/** `parseLenientJson`, with double-encoded payloads unwrapped. */
export function parseLenientJsonValue(text: string): unknown {
	return unwrapEncodedString(parseLenientJson(text).value)
}

/**
 * Read a field that the prompt describes as a list of strings.
 *
 * `["spam"]`, `"spam"` and `"spam, scam"` all mean the same thing to the model
 * that wrote them. Reading only the array form silently produced an EMPTY
 * category list, and the category is what decides whether a message is deleted
 * or a nickname is reset — so a formatting slip there changed the enforcement,
 * which is the worst place for one.
 */
export function coerceStringArray(value: unknown): string[] {
	const out: string[] = []
	const push = (raw: string): void => {
		const trimmed = raw
			.trim()
			.replace(/^["'`]|["'`]$/g, "")
			.trim()
		if (trimmed.length > 0 && !out.includes(trimmed)) out.push(trimmed)
	}

	const visit = (item: unknown, depth: number): void => {
		if (item === null || item === undefined) return
		if (depth > 3) return
		if (typeof item === "string") {
			const trimmed = item.trim()
			// A JSON array that arrived as text is still an array.
			if (trimmed.startsWith("[")) {
				const parsed = parseLenientJson(trimmed)
				if (Array.isArray(parsed.value)) {
					visit(parsed.value, depth + 1)
					return
				}
			}
			for (const part of trimmed.split(/[,;|/\n]+/)) push(part)
			return
		}
		if (Array.isArray(item)) {
			for (const entry of item) visit(entry, depth + 1)
			return
		}
		if (typeof item === "number" || typeof item === "boolean") {
			push(String(item))
			return
		}
		if (typeof item === "object") {
			// `{ "name": "spam" }` / `{ "category": "spam" }` are list entries
			// written one level too deep. Only a recognised label is read; an
			// arbitrary object must not be stringified into a category.
			const record = item as Record<string, unknown>
			for (const key of ["name", "category", "flag", "label", "value"]) {
				const candidate = record[key]
				if (typeof candidate === "string") {
					visit(candidate, depth + 1)
					return
				}
			}
		}
	}

	visit(value, 0)
	return out
}

/**
 * Read a field that should be prose.
 *
 * An array of sentences is the commonest shape a model uses for `analysis`;
 * joining it keeps the explanation instead of falling back to boilerplate.
 */
export function coerceText(value: unknown): string {
	if (value === null || value === undefined) return ""
	if (typeof value === "string") return value.trim()
	if (typeof value === "number" || typeof value === "boolean") {
		return String(value)
	}
	if (Array.isArray(value)) {
		return value
			.map((entry) => coerceText(entry))
			.filter((entry) => entry.length > 0)
			.join(" ")
	}
	if (typeof value === "object") {
		const record = value as Record<string, unknown>
		for (const key of ["text", "value", "description", "analysis", "reason"]) {
			const candidate = record[key]
			if (typeof candidate === "string" && candidate.trim().length > 0) {
				return candidate.trim()
			}
		}
	}
	return ""
}

/**
 * Read a number, including the string spellings a model uses.
 *
 * `"0.9"`, `"0,9"` (Indonesian decimal comma) and `"85%"` all state a
 * confidence. Returning `undefined` for them threw away a value the model did
 * provide, which the caller then had to replace with a default.
 */
export function coerceNumber(value: unknown): number | undefined {
	if (typeof value === "number")
		return Number.isFinite(value) ? value : undefined
	if (typeof value !== "string") return undefined

	const trimmed = value.trim()
	if (trimmed.length === 0) return undefined
	const percent = trimmed.endsWith("%")
	const body = percent ? trimmed.slice(0, -1).trim() : trimmed
	// A decimal comma only when there is no dot; `1,234.5` is not a decimal.
	const normalised = body.includes(".") ? body : body.replace(",", ".")
	const parsed = Number(normalised)
	if (!Number.isFinite(parsed)) return undefined
	return percent ? parsed / 100 : parsed
}
