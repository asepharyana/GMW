import {
	coerceNumber,
	coerceStringArray,
	coerceText,
	extractLenientJson,
	LenientJsonError,
	parseLenientJson,
} from "../../../domain/utils/lenientJson.js"
import { POLICY_VERSION } from "./policy.js"

/**
 * v2 verdict parser.
 *
 * ## Why this file exists instead of reusing moderationResponseParser.ts
 *
 * The v1 parser THREW on any per-message problem, which killed the whole batch
 * (defect D10, verified):
 *
 *   moderationResponseParser.ts:243-247  throw on duplicate message_id
 *   moderationResponseParser.ts:253-257  throw on deferral analysis text
 *   llmCaller.ts:297-309                 catch → every message in the
 *                                        sub-batch marked analysis_parse_failed
 *
 * One message whose analysis happened to contain the phrase "perlu ditinjau"
 * therefore discarded 59 valid verdicts, triggered JSON repair, triggered four
 * full LLM re-requests, and then routed all 60 messages into the individual
 * fallback queue — 60 more LLM calls. A single sentence, a ~120x cost
 * multiplier, and 59 correct answers thrown away.
 *
 * The rule here is the inverse: a per-message defect degrades THAT message to
 * its own error verdict and never touches its siblings. The batch is only
 * declared failed when the response is not JSON at all, or when a message the
 * model was asked about is missing entirely.
 */

/**
 * One message's outcome. Never throws.
 *
 * `status` IS the decision, and it is two-valued because there is nothing in
 * between: `severity` and the six-valued `recommended_action` are both gone.
 * A message is either a violation to remove or it is clean — no review tier,
 * full auto. `status` rather than a separate boolean is deliberate: the
 * decision and the column that stores it stay one fact, not two that can drift.
 *
 * `error` remains a third value because "could not judge" is a real outcome and
 * not a synonym for "clean". An unreadable message must reach a human rather
 * than being deleted on no evidence or silently blessed.
 */
export type ParsedVerdict = {
	messageId: string
	/** THE decision. `deleted` means "remove this"; `error` means "needs a human". */
	status: "clean" | "deleted" | "error"
	/**
	 * WHICH enforcement applies, DERIVED from the violation category.
	 *
	 * Not the model's choice. `actionForCategories` computes it from
	 * `categories` plus `status`, and the model's own `action` field is
	 * discarded on the way in — a model asked to name its own disposition got
	 * it wrong in prod: 51 verdicts categorised `offensive_nickname` whose
	 * action still deleted the MESSAGE and left the nickname alone.
	 *
	 * So: the model answers "what rule was broken" (categories), the policy
	 * answers "what happens then" (this field). `clean` and `delete_message`
	 * follow `status`; `reset_nickname` is the one outcome `status` cannot
	 * express, because the violation lives in the member's NAME while the
	 * message itself stays up in Discord.
	 */
	action: VerdictAction
	/** Required when `status` is `deleted`; the cause of the violation. */
	reason?: string
	flags: string[]
	categories: string[]
	confidence: number
	score: number
	analysis: string
	evidence: string[]
	policyVersion?: string
	/** Set when this single message could not be judged. */
	perMessageError?: string
}

export type ParseBatchResult = {
	verdicts: ParsedVerdict[]
	/** Messages the model omitted entirely — the only recoverable "gap". */
	missing: string[]
	/** True when the response was unusable as a whole. */
	batchFailed: boolean
	batchError?: string
}

/**
 * The three dispositions the MODEL may choose between.
 *
 * `status` answers "is this a violation"; this answers "what should happen to
 * it". The only outcome `status` cannot express is `reset_nickname`, because
 * the violation lives in the member's nickname and the message is correct
 * enough to stay — which is why the model has to be asked, rather than code
 * inferring it from prose the model itself wrote.
 *
 * Spelled as `moderation_actions.action_type` values on purpose: this string is
 * what the enforcer writes into the audit row, and it is free text in the
 * schema (no CHECK), so the two must not drift apart.
 */
export const VERDICT_ACTIONS = [
	"clean",
	"delete_message",
	"reset_nickname",
] as const

export type VerdictAction = (typeof VERDICT_ACTIONS)[number]

const ACTION_SET: ReadonlySet<string> = new Set(VERDICT_ACTIONS)

/**
 * The violation categories that are enforced on the member's NAME.
 *
 * ## Why this list exists, and why it — not the model — picks the action
 *
 * Enforcement is a property of the POLICY, not of the model's opinion. A model
 * asked to name its own disposition gets it wrong in ways no prompt fixes: prod
 * had 51 verdicts whose category was `offensive_nickname` and whose action still
 * produced a deleted MESSAGE with the nickname left alone. The category was
 * right and the disposition was not.
 *
 * So the mapping is mechanical and lives here: a message whose only violation
 * category is a name category is enforced on the name (`reset_nickname`), and
 * everything else is enforced on the message (`delete_message`). The model is
 * still asked to identify the CATEGORY — that is judgement, and a model is
 * better at it than a regex — but it no longer chooses what happens.
 *
 * Adding a category here is how a new name-based rule gets name-based
 * enforcement. Nothing else needs to change.
 */
export const NAME_ONLY_CATEGORIES = [
	"offensive_nickname",
	"offensive_username",
] as const

const NAME_ONLY_CATEGORY_SET: ReadonlySet<string> = new Set(
	NAME_ONLY_CATEGORIES,
)

/**
 * The enforcement a verdict gets, derived from its CATEGORY and nothing else.
 *
 * This is the single rule. It deliberately takes no model-supplied `action`:
 * accepting one as an input is what let a model delete a message over a
 * nickname, and a parameter that must never be trusted is better absent from the
 * signature than validated inside it.
 *
 *  - `error` is inert. "Could not judge" is not evidence of a violation, so it
 *    can never authorise enforcement — the same reason it is not `deleted`.
 *  - A category set that is ENTIRELY name categories is a name violation. The
 *    body may still be rude — that is caught separately by
 *    `isEligibleForAutoDelete`/`isNicknameOnlyViolation`, which read the text —
 *    but the policy's judgement is that the name is what needs fixing.
 *  - Anything else follows `status`: `deleted` means the message goes.
 *
 * A category set that mixes name and content categories is NOT a name
 * violation: `["offensive_nickname", "harassment"]` says the body violates too,
 * so the message goes (and the manager resets the name alongside it).
 */
export function actionForCategories(
	categories: readonly string[] | null | undefined,
	status: string,
): VerdictAction {
	if (status === "error") return "clean"

	const cats = (categories ?? []).filter((c): c is string => Boolean(c))
	if (
		cats.length > 0 &&
		cats.every((category) => NAME_ONLY_CATEGORY_SET.has(category))
	) {
		return "reset_nickname"
	}

	return status === "deleted" ? "delete_message" : "clean"
}

/**
 * The categories a stored row effectively carries, and the action that follows.
 *
 * `categories` falls back to `flags` because the model routinely fills one field
 * and not the other, and the ENFORCEMENT is derived from this value while a
 * reader may be looking at the raw column. Computing the action from raw
 * `categories` in one place and from the fallback in another is how the two
 * disagree — the exact class of bug this whole change removes (a stored category
 * that says `offensive_nickname` next to an action that deleted the message).
 *
 * The fallback triggers on an EMPTY array, not merely on null, because `[]` is
 * what an unfilled array field arrives as. Treating `[]` as "answered, and the
 * answer is nothing" would silently drop the flags beside it.
 *
 * The manager runs in a DIFFERENT PROCESS from the worker that wrote the row, so
 * it re-derives rather than trusting the stored `action`: an older row, a
 * hand-written verdict, or a future writer can all hold a value this build has
 * never seen, and deriving means a legacy row is still classified by its
 * category.
 */
export function actionForVerdict(
	verdict:
		| {
				status?: string | null
				categories?: readonly string[] | null
				flags?: readonly string[] | null
		  }
		| null
		| undefined,
): VerdictAction {
	if (!verdict) return "clean"

	const categories = (verdict.categories ?? []).filter((c): c is string =>
		Boolean(c),
	)
	const flags = (verdict.flags ?? []).filter((f): f is string => Boolean(f))
	const effective = categories.length > 0 ? categories : flags

	return actionForCategories(effective, verdict.status ?? "pending")
}

/**
 * Read a stored `action` value into the three-value set, or return null.
 *
 * Null means "not a value we understand". It deliberately does NOT guess: an
 * unrecognised disposition must be distinguishable from a deliberate `clean`,
 * because a hallucinated `action` field is exactly as untrustworthy as a
 * hallucinated `status` and must not be laundered into a decision.
 *
 * Used to READ rows written by older builds, never to decide enforcement —
 * `actionForCategories` decides, and it does not accept this value as an input.
 */
export function normaliseAction(value: unknown): VerdictAction | null {
	if (typeof value !== "string") return null
	const trimmed = value.trim()
	return ACTION_SET.has(trimmed) ? (trimmed as VerdictAction) : null
}

/** Deferral language. Kept from v1 so policy behaviour does not drift. */
const DEFERRAL_ANALYSIS_PATTERN =
	/(?:kurang (?:konteks|bukti|informasi|data) (?:untuk (?:menilai|menentukan|memutuskan)|untuk moderasi)|perlu (?:dicek|diperiksa|ditinjau|dikaji|dievaluasi) (?:oleh )?(?:admin|moderator|manusia|human review)|tidak (?:bisa|dapat|mampu) (?:menentukan|menilai|memastikan|menyimpulkan|memberi keputusan|memoderasi).*(?:karena (?:konteks tidak jelas|informasi tidak cukup|bukti kurang|konteks kurang|tidak cukup konteks)|data tidak cukup|informasi tidak lengkap)|cannot determine|insufficient (?:context|evidence|information) (?:to |for )?(?:moderate|judge|evaluate|decide|classify)|(?:sepertinya|tampaknya) (?:perlu|harus) (?:ditinjau|diperiksa|dicek) (?:oleh )?(?:admin|moderator)|tidak cukup (?:bukti|informasi|konteks) (?:untuk (?:memberikan|membuat|menentukan)|memutuskan))/i

const DEFERRAL_EXCEPTION_PATTERN =
	/tidak bisa menentukan.*(?:karena|sebab|dengan alasan|sebab tidak ada).*(?:clean|tidak (?:ada|terdapat|menunjukkan).*(?:pelanggaran|masalah|indikasi|konten)|aman|bersih|normal)/i

export function hasDeferralAnalysis(analysis: string): boolean {
	if (DEFERRAL_EXCEPTION_PATTERN.test(analysis)) return false
	return DEFERRAL_ANALYSIS_PATTERN.test(analysis)
}

export function clampScore(value: unknown, fallback = 0): number {
	const n = coerceNumber(value)
	if (n === undefined) return fallback
	return Math.max(0, Math.min(1, n))
}

/**
 * Read a list field, accepting every shape the model writes.
 *
 * `["spam"]`, `"spam"`, `"spam, scam"` and `[{"name":"spam"}]` all state the
 * same categories. Reading only the array form left `categories` EMPTY, and the
 * category is what chooses between deleting the message and resetting the
 * nickname — so a quoting slip there silently changed the enforcement.
 */
function asStringArray(value: unknown): string[] {
	return coerceStringArray(value)
}

/**
 * Extract the first JSON object from a model response.
 *
 * Kept deliberately tolerant, and now tolerant of *syntax* rather than only of
 * packaging: models wrap JSON in prose and fences, and also emit trailing
 * commas, single quotes, unquoted values, comments and smart quotes. All of
 * those are the same answer written carelessly, so they are read rather than
 * rejected — a rejection costs a whole batch.
 *
 * Throws only when there is no JSON container at all.
 */
export function extractJson(content: string): unknown {
	try {
		return extractLenientJson(content).value
	} catch (error) {
		if (error instanceof LenientJsonError) {
			throw new Error("no JSON object found in response")
		}
		throw error
	}
}

function errorVerdict(
	messageId: string,
	reason: string,
	attempt: number,
): ParsedVerdict {
	return {
		messageId,
		status: "error",
		// `clean`, and it is the only correct value: `status: "error"` means the
		// model could not read this message, which authorises no enforcement at
		// all. `actionFromStatus` happens to agree here, but stating the value
		// directly keeps "an error deletes nothing" independent of that helper.
		action: "clean",
		// Distinct flag per cause so the attempt log explains WHY, and so the
		// dashboard can tell "model was evasive" from "JSON was malformed".
		flags: [`analysis_${reason}`],
		categories: [`analysis_${reason}`],
		// Never delete on an error. "The model could not read this message" is not
		// evidence of a violation, and deleting on it is unrecoverable — the content
		// is gone and the judgement that justified removing it never happened.
		// Confidence 0 says so explicitly rather than leaving a stale high value
		// from a failed attempt to imply the model was sure.
		confidence: 0,
		score: 0,
		analysis: `Analisis tidak dapat diselesaikan (${reason}). Perlu pemeriksaan manual. Percobaan ${attempt}.`,
		evidence: [],
		perMessageError: reason,
	}
}

/**
 * The status values the model may return, after formatting is normalised.
 *
 * `clean` and `deleted` only — `warn`, `flagged` and `error` are decisions the
 * pipeline removed or derives itself, and accepting them would resurrect a
 * review tier or let a model authorise enforcement it cannot justify. What IS
 * accepted is the *spelling*: `Clean`, `DELETED`, ` clean. ` and a quoted
 * `"clean"` are the same answer, and rejecting them cost a whole batch.
 */
const STATUS_ALIASES: ReadonlyMap<string, ParsedVerdict["status"]> = new Map([
	["clean", "clean"],
	["deleted", "deleted"],
	// `delete`/`remove` state the same decision in the imperative. Rejecting
	// them threw away a verdict the model had already made.
	["delete", "deleted"],
	["remove", "deleted"],
	["removed", "deleted"],
	["keep", "clean"],
	["kept", "clean"],
	["ok", "clean"],
	["allow", "clean"],
])

/**
 * Read the status field, tolerating case, padding and stray punctuation.
 *
 * Returns null when the value is not one of the two decisions — the caller then
 * degrades THAT message to an error verdict, which is the D10 rule.
 */
export function normaliseStatus(
	value: unknown,
): ParsedVerdict["status"] | null {
	if (typeof value !== "string") return null
	const normalised = value
		.trim()
		.toLowerCase()
		.replace(/^["'`]+|["'`]+$/g, "")
		.replace(/[\s.,;:!]+$/g, "")
		.trim()
	return STATUS_ALIASES.get(normalised) ?? null
}

/**
 * Read the message id, whatever the model called the field.
 *
 * `messageId`, `messageID`, `message`, `id`, `msg_id` and `Message_ID` all
 * appear in real replies, and a single missed spelling drops that verdict into
 * `missing` — a silent requeue that looks like the model forgetting a message.
 * Surrounding quotes and whitespace are stripped for the same reason.
 */
function readMessageId(entry: Record<string, unknown>): string {
	for (const key of [
		"message_id",
		"messageId",
		"messageID",
		"messageid",
		"msg_id",
		"msgId",
		"message",
		"id",
	]) {
		const value = entry[key]
		if (value === null || value === undefined) continue
		const text =
			typeof value === "string" || typeof value === "number"
				? String(value)
				: ""
		const cleaned = text
			.trim()
			.replace(/^["'`]+|["'`]+$/g, "")
			.trim()
		if (cleaned.length > 0) return cleaned
	}
	return ""
}

/** True when a value looks like one verdict entry rather than a container. */
function looksLikeVerdictEntry(value: unknown): boolean {
	if (value === null || typeof value !== "object" || Array.isArray(value)) {
		return false
	}
	const record = value as Record<string, unknown>
	return (
		record.status !== undefined ||
		record.analysis !== undefined ||
		record.message_id !== undefined ||
		record.messageId !== undefined
	)
}

/**
 * Find the verdict list in whatever container the model produced.
 *
 * Five shapes occur in practice, all of them the same answer:
 *   { results: [...] }            the contract
 *   { verdicts: [...] }           a renamed wrapper
 *   [...]                         no wrapper at all
 *   { "m1": {...}, "m2": {...} }  keyed by message id
 *   { message_id, status, ... }   one entry, unwrapped
 *
 * Returns null when nothing in the payload is a list of verdicts, which stays a
 * batch failure: an unusable response must retry, not be reported as "the model
 * judged nothing".
 */
function findVerdictList(payload: unknown): unknown[] | null {
	if (Array.isArray(payload)) return payload

	if (payload === null || typeof payload !== "object") return null
	const container = payload as Record<string, unknown>

	for (const key of ["results", "data", "verdicts", "messages", "items"]) {
		const candidate = container[key]
		if (Array.isArray(candidate)) return candidate
		// The list arrived as JSON text inside the field.
		if (typeof candidate === "string" && candidate.trim().startsWith("[")) {
			const parsed = parseLenientJson(candidate)
			if (Array.isArray(parsed.value)) return parsed.value
		}
		// `results` keyed by message id.
		if (
			candidate !== null &&
			typeof candidate === "object" &&
			!Array.isArray(candidate)
		) {
			const entries = Object.entries(candidate as Record<string, unknown>)
			if (
				entries.length > 0 &&
				entries.every(([, v]) => looksLikeVerdictEntry(v))
			) {
				return entries.map(([id, v]) => ({ ...(v as object), message_id: id }))
			}
		}
	}

	// No wrapper: keyed by message id, or a single unwrapped entry.
	if (looksLikeVerdictEntry(payload)) return [payload]
	const entries = Object.entries(container)
	if (
		entries.length > 0 &&
		entries.every(([, v]) => looksLikeVerdictEntry(v))
	) {
		return entries.map(([id, v]) => ({ ...(v as object), message_id: id }))
	}

	return null
}

/**
 * Parse a model response into one verdict per requested message.
 *
 * `requestedIds` is the contract: the caller must receive exactly one verdict
 * per id, or the message stays in the queue. A message the model never
 * mentioned is reported in `missing` rather than silently dropped, because
 * "the model forgot" and "the model judged it clean" are different facts.
 *
 * Two tolerances were added because each one previously cost a full re-request:
 *
 *  - **Syntax.** `extractJson` reads trailing commas, single quotes, unquoted
 *    values, comments and smart quotes instead of rejecting them.
 *  - **Truncation.** A reply cut off at `max_tokens` used to fail the entire
 *    batch. Complete entries now persist and only the cut one is reported
 *    missing, so a 40-message batch keeps its first 30 answers instead of
 *    paying for all 40 again.
 *
 * What is NOT tolerated: an unknown status, a missing verdict, or a verdict for
 * an id we never asked about. Those are decision-shaped, not formatting-shaped,
 * and the D10 rule applies — degrade that one message, never guess.
 */
export function parseVerdicts(
	raw: string,
	requestedIds: string[],
	attempt: number,
): ParseBatchResult {
	const verdictById = new Map<string, ParsedVerdict>()
	const missing: string[] = []

	let parsed: ReturnType<typeof extractLenientJson>
	try {
		parsed = extractLenientJson(raw)
	} catch (e) {
		// Not JSON at all → the batch itself is unusable. Retry the whole call.
		return {
			verdicts: requestedIds.map((id) =>
				errorVerdict(id, "parse_failed", attempt),
			),
			missing: [],
			batchFailed: true,
			batchError: e instanceof Error ? e.message : String(e),
		}
	}

	const list = findVerdictList(parsed.value)

	if (!list) {
		return {
			verdicts: requestedIds.map((id) =>
				errorVerdict(id, "parse_failed", attempt),
			),
			missing: [],
			batchFailed: true,
			batchError: "response JSON had no results array",
		}
	}

	const duplicates: string[] = []

	for (const entry of list) {
		if (!entry || typeof entry !== "object") continue

		// An entry the reader had to auto-close was cut off mid-write. Its
		// fields may be half-read, so it is not the model's answer: report it
		// missing so the caller re-queues it, rather than persisting a guess.
		if (parsed.incomplete.has(entry)) continue

		const raw_ = entry as Record<string, unknown>

		const id = readMessageId(raw_)
		if (!id) continue

		// A duplicate degrades only the DUPLICATE (v1 threw and lost the batch).
		// The first occurrence wins, which is the model's primary answer.
		if (verdictById.has(id)) {
			duplicates.push(id)
			continue
		}

		// An id we never asked for is ignored — a hallucinated extra target must
		// not be able to overwrite a real verdict.
		if (!requestedIds.includes(id)) continue

		const analysis = coerceText(raw_.analysis)

		// D10, part 1: deferral text is now a PER-MESSAGE degradation.
		if (hasDeferralAnalysis(analysis)) {
			verdictById.set(id, errorVerdict(id, "deferred", attempt))
			continue
		}

		const status = normaliseStatus(raw_.status)
		if (!status) {
			verdictById.set(id, errorVerdict(id, "invalid_status", attempt))
			continue
		}

		const score = clampScore(raw_.score, 0)
		const confidenceValue = clampScore(raw_.confidence, Number.NaN)
		// v1 derived confidence from score when the model omitted it. Keep that.
		const confidence = Number.isFinite(confidenceValue)
			? confidenceValue
			: status === "deleted"
				? Math.max(0.8, score)
				: 0.9

		const flags = asStringArray(raw_.flags)
		const categories = asStringArray(raw_.categories)

		// The categories the row will actually carry. `flags` is the fallback
		// because the model often fills one field and not the other, and the
		// ENFORCEMENT is derived from this same value — computing the action from
		// the raw `categories` and storing the fallback would let the two disagree,
		// which is precisely the class of bug (action not following category) this
		// change removes.
		const effectiveCategories = categories.length > 0 ? categories : flags

		const reason = coerceText(raw_.reason)

		// `verdicts_reason_check` rejects a `deleted` row with a null or empty
		// reason, so a model that states the decision and no prose must not be
		// able to make the INSERT fail. The order is the model's own words
		// first, then a statement of the category that justified it — never a
		// silent empty string.
		const deletionReason =
			reason.length > 0
				? reason
				: analysis.length > 0
					? analysis
					: `Pelanggaran kategori ${effectiveCategories.join(", ") || "tidak disebutkan"}.`

		// The model's disposition is NOT read, and that is the point.
		//
		// `action` used to be a model-supplied field, and the model got it
		// wrong where it mattered most: prod had 51 verdicts correctly
		// categorised `offensive_nickname` whose action still deleted the
		// MESSAGE and left the nickname alone. The category was the reliable
		// output; the disposition was not. Enforcement is now derived from the
		// category by `actionForCategories`, so there is one rule instead of a
		// model opinion to police.
		//
		// Consequence: a stored row can no longer be self-contradictory. Both
		// fields now come from the same two inputs, so a `deleted` verdict always
		// carries an action that does something.
		const action = actionForCategories(effectiveCategories, status)

		verdictById.set(id, {
			messageId: id,
			// `status` is already the decision — it is validated above to be exactly
			// one of clean/deleted — so nothing reconciles it and nothing overrides
			// it. The model states the outcome once and that value is the outcome.
			status,
			// The enforcement the CATEGORY derived, never an unrecognised value.
			action,
			// A deletion without a stated cause is a deletion a moderator cannot
			// audit or appeal, so it falls back to the model's own explanation rather
			// than to an empty string. The fallback is the analysis, not a literal
			// placeholder: a real sentence is worth more to a reviewer than "n/a".
			...(status === "deleted" ? { reason: deletionReason } : {}),
			flags,
			categories: effectiveCategories,
			confidence,
			score,
			// The boilerplate says "no violation", so it is only ever a fallback
			// for a CLEAN verdict. Using it for a deletion wrote "tidak ada
			// indikasi pelanggaran" into the analysis of a message the same row
			// deletes — a self-contradicting record, and the one sentence a
			// moderator reads when they ask why something was removed.
			analysis:
				analysis.length > 0
					? analysis
					: status === "deleted"
						? deletionReason
						: `Tidak ada indikasi pelanggaran. Pesan dinilai wajar dalam konteks percakapan.`,
			evidence: asStringArray(raw_.evidence),
			// The version that actually produced this verdict, not whatever the
			// model echoed back. The prompt's policy_version field is advisory and
			// the model frequently omits it, which left every verdict with
			// policy_version = NULL and no way to tell which policy ruled.
			policyVersion: POLICY_VERSION,
		})
	}

	for (const id of requestedIds) {
		if (!verdictById.has(id)) missing.push(id)
	}

	return {
		verdicts: requestedIds
			.map((id) => verdictById.get(id))
			.filter((v): v is ParsedVerdict => v !== undefined),
		missing,
		batchFailed: false,
	}
}
