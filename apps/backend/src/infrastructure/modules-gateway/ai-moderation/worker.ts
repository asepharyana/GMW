/**
 * v2 moderation worker — the durable half of moderation.
 *
 * ## What replaced what
 *
 * v1 kept the work queue as in-process state: a `Map` of pending
 * conversations, a scheduler interval per lane, cooldown timestamps, a
 * conversation-level lock, and a global circuit-breaker counter. None of that
 * survives a restart, which is the mechanism behind every "message got stuck"
 * report: the row is committed to Postgres as `processing`, and the process
 * that owned the timer is gone.
 *
 * v2 keeps nothing. The queue IS the `ai_status` column. A worker asks the
 * database for claimable work, holds a time-boxed lease while it processes,
 * and the database hands the work to someone else if the lease lapses. A
 * worker can be killed at any instant with no lost work and no duplicated
 * verdict, because correctness is enforced by `claim_messages` and the
 * deferred trigger, not by this file's control flow.
 *
 * ## Module-local state, deliberately
 *
 * Only two things live here: the worker identity (a random id, so a restarted
 * process does not inherit a dead worker's claims) and the poll loop itself.
 * Neither affects correctness.
 */

import { randomUUID } from "node:crypto"
import { LRUCache } from "lru-cache"
import pLimit from "p-limit"
import type { Pool, PoolClient } from "pg"
import { createChildLogger } from "../../logger/index.js"
// Link/embed pairing lives with the other capture→prompt helpers, and the two
// escaping helpers used to be duplicated here. Both are re-exported below so
// existing importers of this module keep working.
import {
	escapeMessageBody,
	escapeXmlAttr,
	extractMessageMediaEvidence,
	extractPromptAuthor,
	formatAuthorForPrompt,
	formatChannelContextForPrompt,
	formatLinkEvidenceForPrompt,
} from "../message-capture/messageMetadata.js"
import type { LlmGateway } from "./llmGateway.js"
import {
	batchDedupeKey,
	extractMediaItems,
	isVisionCapable,
	type MediaItem,
	mediaSignature,
} from "./mediaFingerprint.js"
import {
	MediaVisionCacheService,
	type VisionCacheEntry,
} from "./mediaVisionCache.js"
import { buildSystemPrompt, POLICY_VERSION } from "./policy.js"
import {
	logBatchResult,
	logClaimed,
	logCycle,
	logLlmDone,
	logMessageRequeued,
	logParked,
	logVerdictWritten,
	traceId,
} from "./trace.js"
import type { ParseBatchResult, ParsedVerdict } from "./verdictParser.js"
import { parseVerdicts } from "./verdictParser.js"

export { escapeMessageBody, escapeXmlAttr, isVisionCapable }

interface CachedSpamViolation {
	readonly flags: string[]
	readonly categories: string[]
	readonly reason: string
	readonly analysis: string
	readonly action: ParsedVerdict["action"]
	readonly authorId: string
}

const log = createChildLogger("ai-moderation")

export type MessageState =
	| "pending"
	| "claimed"
	| "analyzed"
	| "retry_wait"
	| "dead"
	| "skipped"

export type ClaimedMessage = {
	id: string
	guildId: string
	channelId: string
	/**
	 * The thread's OWN id, or null for a plain channel message.
	 *
	 * Distinct from `channelId`, which holds the PARENT id when the message
	 * came from a thread (getMessageLocation writes parentId into channel_id).
	 */
	threadId: string | null
	authorId: string
	content: string
	/**
	 * `messages.created_at` is a bigint of epoch MILLISECONDS, and node-postgres
	 * returns bigint as a STRING. This was typed `Date`, which is simply false —
	 * anything calling `.toISOString()` on it would have thrown at runtime. It is
	 * a string here, and `isoFromEpoch` / `toEpochMs` convert it where needed.
	 */
	createdAt: string
	/** Incremented by `claim_messages()` at claim time, so it counts this try. */
	attempts: number
	username: string | null
	/**
	 * `messages.metadata` — the captured rich evidence (embeds, attachments,
	 * stickers, channel, member).
	 *
	 * THIS FIELD IS THE FIX. The prompt interpolated `content` and nothing
	 * else, so a link post reached the model as a bare `t.co` string with the
	 * resolved Facebook/Instagram preview sitting unread in this column, and an
	 * embedder message whose `content` was `""` was judged as literally empty.
	 * `formatLinkEvidenceForPrompt` consumes this to present the link and its
	 * preview as one unit.
	 */
	metadata: string | null
	/**
	 * True when the channel is marked NSFW on Discord, read from the
	 * metadata captured with the message. Such messages are never analysed.
	 */
	channelIsNsfw?: boolean | null

	/** True when the message has at least one attachment row. */
	hasMedia: boolean
}

export type WorkerConfig = {
	/** How many messages to pull per claim. */
	claimBatchSize: number
	/** Lease length. Must exceed `batchWorstCaseMs` — the WHOLE vision pre-pass
	 *  PLUS the moderation call — or work is reclaimed while still running and
	 *  two workers process the same message. */
	leaseMs: number
	/** How often to poll when the queue is empty. */
	idlePollMs: number
	/** Attempts before a message is parked in `failed`. */
	maxAttempts: number
	/** Backoff base; attempt N waits `retryBackoffBaseMs * 2^(N-1)`. */
	retryBackoffBaseMs: number
	/** Deadline for a single LLM call. */
	llmTimeoutMs: number
	/**
	 * Deadline for the vision pre-pass, which runs BEFORE the moderation call
	 * and holds the same lease. A media batch pays this once PER WAVE — the
	 * pre-pass is capped at `visionConcurrency` in flight — so the lease has to
	 * cover `visionWaves() * visionTimeoutMs + llmTimeoutMs`.
	 */
	visionTimeoutMs: number
	/**
	 * How many PRECEDING messages to put in the prompt per analysed message.
	 *
	 * 0 disables the history block. Was declared as `includeContext: boolean`
	 * plus `contextWindow: number` and never read by anything — the pair let a
	 * deployment set a window of 10 with the flag off and get silence, which is
	 * indistinguishable from "no history exists". One number now.
	 */
	contextWindow: number
	/**
	 * Channels deliberately excluded from moderation. Their messages are still
	 * captured and still visible on the dashboard — they are simply never
	 * judged, and land in the terminal `skipped` state.
	 *
	 * Empty by default, and the empty list skips nothing: the default direction
	 * is "moderate", so a mis-set env var can never quietly unmoderate a
	 * channel.
	 */
	skipChannelIds?: readonly string[]
	/**
	 * Same terminal `skipped` treatment, keyed on `messages.thread_id`.
	 *
	 * Separate from `skipChannelIds` because `messages.channel_id` holds the
	 * PARENT id for a thread, so a thread id can never appear in the channel
	 * list — it would match nothing and the thread would stay moderated with no
	 * error anywhere.
	 */
	skipThreadIds?: readonly string[]
	/**
	 * Same terminal `skipped` treatment, keyed on `messages.user_id`.
	 *
	 * For high-volume bots whose messages carry no moderation signal — a music
	 * bot posting now-playing embeds into the channel root all day. They are
	 * still captured and still visible on the dashboard; they are simply never
	 * judged.
	 *
	 * This list was declared in the config schema and read by nothing, so the
	 * default entry (Jockie Music's user id) had no effect: every one of that
	 * bot's embeds paid a vision call and a moderation call per batch, forever.
	 */
	skipUserIds?: readonly string[]
	/** Stop after this many batches (0 = run forever). Used by tests. */
	maxBatches?: number
	/**
	 * Ceiling on concurrent vision calls inside one batch's pre-pass.
	 *
	 * The fan-out used to be a bare `Promise.all` over every message in the
	 * batch, so a single media batch opened `claimBatchSize` (40 by default)
	 * simultaneous image uploads and completions. AI_LLM_MEDIA_MAX_CONCURRENT
	 * was declared in the schema, documented as owning a dedicated semaphore,
	 * and read by nothing — so a backlog of images hit the provider as a
	 * 40-way burst and the router throttled or dropped the lot.
	 */
	visionConcurrency?: number
}

export const DEFAULT_WORKER_CONFIG: WorkerConfig = {
	claimBatchSize: 40,
	// Sized by `batchWorstCaseMs` for a FULLY-media batch: 10 waves x 120s of
	// vision + 90s moderation = 1290s. It was 300s — which passed the old
	// single-call check (120 + 90) and therefore shipped a 4.3x overrun, handing
	// every slow media batch to a second worker while the first still held it.
	leaseMs: 1_500_000,
	idlePollMs: 2_000,
	maxAttempts: 5,
	retryBackoffBaseMs: 15_000,
	llmTimeoutMs: 90_000,
	visionTimeoutMs: 120_000,
	contextWindow: 10,
	// Matches the AI_LLM_MEDIA_MAX_CONCURRENT schema default.
	visionConcurrency: 4,
}

/**
 * How many vision waves a fully-media batch pays, and the resulting budget.
 *
 * The vision pre-pass is bounded by `visionConcurrency`, not run all at once,
 * so a batch of N media messages costs `ceil(N / visionConcurrency)` ROUNDS of
 * `visionTimeoutMs` — not one. Modelling a single call was the bug this
 * function existed to prevent in the first place: with the shipped defaults
 * (40 messages, 4-wide, 120s each) the real worst case is 10 x 120s + 90s =
 * 1290s against a 300s lease, so `reclaim_expired_claims` reset every row to
 * `pending` while the first worker was still describing images, and a second
 * worker claimed the same messages and paid for them again.
 *
 * At most `visionConcurrency` calls are in flight, so the waves genuinely do
 * serialise: it is one wall-clock budget, not `N` parallel budgets.
 */
export function visionWaves(cfg: WorkerConfig): number {
	const perWave = Math.max(1, cfg.visionConcurrency ?? 1)
	return Math.ceil(cfg.claimBatchSize / perWave)
}

/**
 * The longest a single claim can legitimately take: every message carrying
 * media, described in waves, THEN the one moderation call for the batch.
 */
export function batchWorstCaseMs(cfg: WorkerConfig): number {
	return visionWaves(cfg) * cfg.visionTimeoutMs + cfg.llmTimeoutMs
}

/**
 * A lease shorter than the batch's worst case guarantees duplicate work.
 *
 * The worst case is the WHOLE vision pre-pass PLUS the moderation call, because
 * `analyze()` runs vision first for any batch containing media and both hold
 * the same lease. The shipped defaults were lease 120s / vision 120s /
 * moderation 90s — a 210s worst case against a 120s lease, so every media
 * batch was handed to a second worker mid-flight, paying for duplicate
 * vision and racing two workers on the same `verdicts` row. The guard that
 * exists to make duplicate verdicts impossible did not cover the path that
 * made them likely.
 *
 * It then under-corrected: it compared the lease against ONE vision call
 * (120s + 90s = 210s < 300s, so the defaults passed) while the pre-pass runs
 * `ceil(claimBatchSize / visionConcurrency)` waves. The arithmetic is now
 * `assertLeaseCoversLlmTimeout`'s own subject rather than an assumption inside
 * it, and the defaults are sized to it.
 */
export function assertLeaseCoversLlmTimeout(cfg: WorkerConfig): void {
	const worstCase = batchWorstCaseMs(cfg)
	if (cfg.leaseMs <= worstCase) {
		const waves = visionWaves(cfg)
		throw new Error(
			`leaseMs (${cfg.leaseMs}) must exceed the worst-case batch time: ` +
				`${waves} vision wave(s) x visionTimeoutMs + llmTimeoutMs ` +
				`(${waves} x ${cfg.visionTimeoutMs} + ${cfg.llmTimeoutMs} = ${worstCase}); ` +
				`otherwise a slow media batch outlives its lease and another worker re-processes the messages. ` +
				`Raise leaseMs, lower visionTimeoutMs, or lower visionConcurrency so a fully-media ` +
				`batch of claimBatchSize (${cfg.claimBatchSize}) fits`,
		)
	}
}

/**
 * `messages.created_at` is a bigint of milliseconds, not a timestamp column, so
 * node-postgres hands it back as a STRING (or a number for small values) and
 * `.toISOString()` does not exist on it. Prompt timestamps are advisory
 * context, so a malformed one degrades to "unknown" rather than failing the
 * whole batch over a formatting detail.
 */
export function isoFromEpoch(value: unknown): string {
	const ms = typeof value === "number" ? value : Number(value)
	if (!Number.isFinite(ms) || ms <= 0) return "unknown"
	try {
		return new Date(ms).toISOString()
	} catch {
		return "unknown"
	}
}

export type WorkerStats = {
	batches: number
	claimed: number
	analyzed: number
	retried: number
	dead: number
	skipped: number
	batchFailures: number
	llmErrors: number
}

function emptyStats(): WorkerStats {
	return {
		batches: 0,
		claimed: 0,
		analyzed: 0,
		retried: 0,
		dead: 0,
		skipped: 0,
		batchFailures: 0,
		llmErrors: 0,
	}
}

/**
 * Prompt for the vision pass.
 *
 * It asks what the image SHOWS, not whether it is acceptable, and forbids
 * the two useless answers: "the image is unclear" and "there is no text".
 * A vague description is worse than none, because the moderation model
 * treats it as evidence and concludes "clean" from it — so the prompt has
 * to make the vision model commit to concrete detail.
 */
const VISION_SYSTEM_PROMPT = `Kamu adalah Penetras Gambar. Tugasmu MENJELASKAN isi gambar, bukan menilai apakah itu melanggar.

Untuk setiap gambar, tulis 1-2 kalimat faktual dalam Bahasa Indonesia:
- Apa yang terlihat: orang, objek, latar, tempat, dan tulisan di dalam gambar.
- Detail spesifik: siapa saja yang ada, berapa orang, aktivitas apa yang terjadi.
- Kalau ada teks di dalam gambar, tuliskan teksnya.
- Kalau ada bagian tubuh atau kondisi fisik yang tampak, sebutkan.

DILARANG menjawab:
- "gambar tidak jelas" atau "kualitas gambar rendah"
- "tidak ada teks" sebagai satu-satunya jawaban, itu bukan deskripsi
- penilaian moral atau kebijakan; itu tugas moderator, bukan kamu

Kalau memang tidak ada yang bisa dibaca dari gambar, katakan bentuk dan
warna yang terlihat, bukan bahwa gambarnya tidak terbaca.

Output: JSON array berisi SATU string per gambar, urutan sama dengan input.
Contoh: ["Seseorang mengambil selfie, rambut disisir ke belakang, memakai kemeja hitam."]`

/**
 * Image URLs a message carries OUTSIDE the `attachments` table.
 *
 * Discord models stickers and custom emoji separately from attachments, so they
 * never become attachment rows — but `getStickerMetadata` / `getCustomEmojiMetadata`
 * captured them into `messages.metadata` with name, description and pack. Nothing
 * read them: `hasMedia` was computed from the attachments table alone, so a
 * sticker-only or emoji-only message skipped the vision pre-pass entirely and
 * reached the moderator with no visual evidence, while `MEDIA_RULES` promised
 * one. An explicit sticker is frequently the whole content of a message, so the
 * gap was not edge-case.
 *
 * Sticker URLs are `cdn.discordapp.com/stickers/…`, which is not an `image/*`
 * content type, so `isVisionCapable` would reject them on a filename guess. They
 * are images the provider accepts; the pass runs with them.
 *
 * Returns every distinct URL, order preserved, so one image posted twice in a
 * batch is described once.
 */
export function stickerAndEmojiUrls(metadata: string | null): string[] {
	if (!metadata) return []
	const { stickers, customEmojis } = extractMessageMediaEvidence(metadata)
	const urls: string[] = []
	const seen = new Set<string>()
	for (const u of [
		...stickers.map((s) => s.url),
		...customEmojis.map((e) => e.url),
	]) {
		if (!u || seen.has(u)) continue
		seen.add(u)
		urls.push(u)
	}
	return urls
}

/**
 * Describe a set of images, skipping ones already described.
 *
 * `cache` is per worker process and keyed on the Discord CDN URL, which is
 * content-addressed for practical purposes: the same sticker or a re-posted
 * image resolves to the same URL, and its description cannot change under it.
 *
 * It exists because the fan-out is per MESSAGE, not per image. A bot that
 * re-posts one sticker every few seconds, or a pack a guild uses all day,
 * otherwise pays a full vision call per message for an image already
 * described — the most repeated, least informative spend in the pipeline. A
 * miss is not cached, so a transient vision failure is retried rather than
 * pinned as "this image has no description".
 */
async function describeMediaItems(
	vision: LlmGateway,
	items: readonly MediaItem[],
	timeoutMs: number,
	cacheService: MediaVisionCacheService,
): Promise<string> {
	if (items.length === 0) return ""
	const fingerprints = items.map((i) => i.fingerprint)
	const cached = await cacheService.getMany(fingerprints)
	const pending = items.filter((i) => !cached.has(i.fingerprint))

	if (pending.length > 0) {
		const uniqueByFp = new Map<string, MediaItem>()
		for (const p of pending) {
			if (!uniqueByFp.has(p.fingerprint)) {
				uniqueByFp.set(p.fingerprint, p)
			}
		}
		const uniqueList = Array.from(uniqueByFp.values())
		const newEntries: VisionCacheEntry[] = []

		await Promise.all(
			uniqueList.map((item) =>
				cacheService.coalesce(item.fingerprint, async () => {
					const doubleCheck = cacheService.get(item.fingerprint)
					if (doubleCheck) {
						cached.set(item.fingerprint, doubleCheck)
						return doubleCheck
					}

					const description = await vision.complete({
						system: VISION_SYSTEM_PROMPT,
						user: "Deskripsikan 1 gambar berikut.",
						images: [{ url: item.url }],
						timeoutMs,
					})
					const text = description.trim()
					if (text.length > 0) {
						const perImage = splitVisionDescriptions(text, 1)
						const line = perImage[0] ?? text
						const rendered = `\n[Media description: ${line}]\n`
						cached.set(item.fingerprint, rendered)
						newEntries.push({
							fingerprint: item.fingerprint,
							description: rendered,
						})
						return rendered
					}
					return ""
				}),
			),
		)

		if (newEntries.length > 0) {
			await cacheService.setMany(newEntries)
		}
	}

	const parts: string[] = []
	const seen = new Set<string>()
	for (const item of items) {
		if (seen.has(item.fingerprint)) continue
		seen.add(item.fingerprint)
		const desc = cached.get(item.fingerprint)
		if (desc) parts.push(desc)
	}

	return parts.join("")
}

/**
 * Split a vision reply into one description per image.
 *
 * The prompt asks for a JSON array of strings. Tolerates prose and markdown
 * fences, because a single bracket of preamble should not cost the whole batch
 * its descriptions. Returns fewer entries than `count` when the reply cannot be
 * split, and the caller then treats the reply as one shared description rather
 * than attributing it to the wrong image.
 */
function splitVisionDescriptions(raw: string, _count: number): string[] {
	const trimmed = raw.trim()
	const fenced = /```(?:json)?\s*([\s\S]*?)\s*```/.exec(trimmed)
	const candidate = fenced?.[1] ?? trimmed
	if (candidate.startsWith("[")) {
		try {
			const parsed: unknown = JSON.parse(candidate)
			if (Array.isArray(parsed)) {
				const strings = parsed
					.map((v) => (typeof v === "string" ? v.trim() : ""))
					.filter((v) => v.length > 0)
				if (strings.length > 0) return strings
			}
		} catch {
			/* fall through */
		}
	}
	// Not a JSON array. If there is exactly one image there is nothing to split,
	// and if there are many, attributing the whole reply to each would be a
	// fabrication — so one entry is returned and the caller shares it.
	return [trimmed]
}

async function generateVisionDescription(
	pool: Pool,
	message: ClaimedMessage,
	visionTimeoutMs: number,
	visionGateway?: LlmGateway,
	preloaded?:
		| readonly MediaItem[]
		| ReadonlyArray<{
				discord_url: string | null
				type?: string | null
				filename?: string | null
				size?: number | null
		  }>,
	cacheService?: MediaVisionCacheService,
): Promise<string> {
	try {
		let vision = visionGateway
		if (!vision) {
			const { createDefaultVisionGateway } = await import("./llmGateway.js")
			vision = createDefaultVisionGateway()
		}

		let items: readonly MediaItem[]
		if (preloaded && preloaded.length > 0 && "fingerprint" in preloaded[0]) {
			items = preloaded as readonly MediaItem[]
		} else {
			const attachmentRows =
				(preloaded as
					| ReadonlyArray<{
							discord_url: string | null
							type?: string | null
							filename?: string | null
							size?: number | null
					  }>
					| undefined) ??
				(
					await pool.query<{
						discord_url: string | null
						type: string | null
						filename: string | null
						size: number | null
					}>(
						`SELECT discord_url, type, filename, size
						   FROM attachments
						  WHERE message_id = $1`,
						[message.id],
					)
				).rows
			items = extractMediaItems(attachmentRows, message.metadata)
		}

		if (!items.length) return ""

		const cache = cacheService ?? new MediaVisionCacheService(pool)
		return await describeMediaItems(vision, items, visionTimeoutMs, cache)
	} catch (e) {
		log.warn(
			{ messageId: message.id, error: String(e) },
			"Failed to generate vision description — analyzing on text only",
		)
		return ""
	}
}

/**
 * Test seam for the vision pass.
 *
 * `generateVisionDescription` reads config and the vision gateway through
 * dynamic imports, which is right for production but leaves the description
 * itself untestable. This exposes the same code path with both injected.
 */
export async function generateVisionDescriptionForTest(
	pool: Pool,
	message: ClaimedMessage,
	vision: LlmGateway,
	visionTimeoutMs = 120_000,
): Promise<string> {
	return generateVisionDescription(pool, message, visionTimeoutMs, vision)
}

/** One message from the recent past, as the prompt's history block. */
type HistoryMessage = {
	id: string
	channelId: string
	threadId: string | null
	createdAt: number
	authorId: string
	username: string | null
	content: string
	/** Whether this row is itself in the batch being judged, not history. */
	inBatch: boolean
}

/**
 * Load the messages immediately preceding each analysed message.
 *
 * `includeContext`/`contextWindow` existed in `WorkerConfig` with a default of
 * 10 and zero call sites — the feature was declared and never built, so the
 * model judged every message in isolation while the config claimed otherwise.
 * This is that feature.
 *
 * The window is per THREAD, not per channel. `messages.channel_id` holds the
 * parent channel for a thread message, so a channel-wide window would splice
 * an unrelated thread's discussion into the middle of another one — the exact
 * confusion the 2026-10-01 memory rebuild was done to remove. A root-channel
 * message (no `thread_id`) gets its channel-root predecessors instead.
 *
 * One query for the whole batch, not one per message: a 40-message batch would
 * otherwise be 40 round trips inside the moderation call's own lease. It walks
 * each target backwards and stops at `contextWindow` per target, deduplicating
 * as it goes, so the whole window costs one round trip regardless of size.
 *
 * `ORDER BY created_at, id` matches the `(channel_id, created_at, id)` and
 * `(thread_id, created_at, id)` indexes, and `id` breaks ties because Discord
 * snowflakes are monotonic — two messages can share a millisecond.
 *
 * History rows are read from the same table the batch came from, so a message
 * still being processed by another worker can appear. That is harmless: it is
 * text the model would have seen anyway, and it is capped.
 */
async function loadContextHistory(
	pool: Pool,
	batch: readonly ClaimedMessage[],
	window: number,
): Promise<HistoryMessage[]> {
	if (window <= 0 || batch.length === 0) return []

	// Each target carries its own scope, so a batch spanning a thread and a
	// channel root does not collapse into one of them.
	const targets = batch.map((m) => ({
		id: m.id,
		channelId: m.channelId,
		threadId: m.threadId ?? null,
		createdAt: m.createdAt,
	}))

	// `id` leads the ORDER BY because DISTINCT ON requires it — Postgres keeps
	// whichever row it saw first per id, and every target reaches the same message
	// with the same columns, so which one wins is irrelevant. The result is
	// re-sorted chronologically below rather than trusted from SQL, because
	// `id`-order is chronological only by the accident that Discord snowflakes
	// grow with time.
	const { rows } = await pool.query<HistoryMessage>(
		`WITH targets AS (
       SELECT * FROM unnest(
         $1::text[], $2::text[], $3::text[], $4::bigint[]
       ) AS t(id, "channelId", "threadId", "createdAt")
     ),
     reachable AS (
       SELECT t.id AS target_id,
              h.id, h.channel_id, h.thread_id, h.created_at,
              h.user_id, h.username, h.content,
              row_number() OVER (
                PARTITION BY t.id
                ORDER BY h.created_at DESC, h.id DESC
              ) AS depth
         FROM targets t
         JOIN messages h
           ON (
             h.created_at < t."createdAt"
             OR (h.created_at = t."createdAt" AND h.id < t.id)
           )
          AND h.channel_id = t."channelId"
          AND h.thread_id IS NOT DISTINCT FROM t."threadId"
     ),
     capped AS (
       SELECT * FROM reachable WHERE depth <= $5
     )
     SELECT DISTINCT ON (id)
            id, channel_id AS "channelId", thread_id AS "threadId",
            created_at AS "createdAt", user_id AS "authorId",
            username, content, false AS "inBatch"
       FROM capped
      ORDER BY id, created_at, id`,
		[
			targets.map((t) => t.id),
			targets.map((t) => t.channelId),
			targets.map((t) => t.threadId),
			targets.map((t) => t.createdAt),
			window,
		],
	)

	const inBatch = new Set(batch.map((m) => m.id))
	// Re-sorted here, in the type's terms, so the guarantee does not depend on
	// how the query happened to be written. Chronological, and `id` breaks the
	// tie because two messages can share a millisecond.
	return rows
		.map((r) => ({ ...r, inBatch: inBatch.has(r.id) }))
		.sort((a, b) =>
			a.createdAt === b.createdAt
				? a.id.localeCompare(b.id)
				: a.createdAt - b.createdAt,
		)
}

/**
 * `loadContextHistory` that cannot fail the batch.
 *
 * Context is an enhancement. A query timeout, a missing index, a bad window —
 * none of those are a reason to leave `attempts` unspent or to park a message
 * as `failed`, because the moderation call itself has everything it needs.
 * Returns "" and lets the prompt be what it was before this feature existed.
 */
async function loadContextHistorySafely(
	pool: Pool,
	batch: readonly ClaimedMessage[],
	window: number,
): Promise<string> {
	if (window <= 0 || batch.length === 0) return ""
	try {
		const history = await loadContextHistory(pool, batch, window)
		if (history.length === 0) return ""
		return formatConversationHistory(history)
	} catch (e) {
		log.warn(
			{
				err: e instanceof Error ? e.message : String(e),
				batchSize: batch.length,
				window,
			},
			"conversation history unavailable — analysing without it",
		)
		return ""
	}
}

/**
 * Render recent messages that PRECEDED the batch, as one closed block.
 *
 * Labelled `<conversation_history>` and deliberately a closed region rather
 * than a set of sibling `<message>` elements: a second block that looks
 * judgeable invites the model to return a verdict for a row that was already
 * judged, or to delete it twice. Every row carries `context="history"` so the
 * policy can mark it as background rather than work.
 *
 * Empty string when there is no history, so the prompt is exactly what it was
 * before this feature existed.
 */
function formatConversationHistory(history: readonly HistoryMessage[]): string {
	const seen = new Set<string>()
	const lines: string[] = []
	for (const h of history) {
		if (h.inBatch || seen.has(h.id)) continue
		seen.add(h.id)
		// Only the CONTENT is sanitised; the attributes are ours and a snowflake id
		// carries no injection risk. Usernames are user-controlled and escaped.
		const who = h.username ? escapeXmlAttr(h.username) : "unknown"
		lines.push(
			`<message id="${h.id}" author="${who}" ts="${isoFromEpoch(h.createdAt)}" context="history">` +
				`\n${escapeMessageBody(h.content)}\n</message>`,
		)
	}
	if (lines.length === 0) return ""
	return `<conversation_history>\n${lines.join("\n")}\n</conversation_history>`
}

export class ModerationWorker {
	private readonly pool: Pool
	private readonly llm: LlmGateway
	/**
	 * Describes attached images before moderation. Optional: when absent the
	 * shared default client is created on first use, so production wiring is
	 * unchanged while tests can inject a stub instead of calling a real model.
	 */
	private readonly vision: LlmGateway | undefined
	private readonly config: WorkerConfig
	private readonly mediaVisionCache: MediaVisionCacheService
	private readonly recentSpamViolations = new LRUCache<
		string,
		CachedSpamViolation
	>({ max: 500, ttl: 15 * 60 * 1000 })
	private static readonly VISION_CACHE_MAX = 2000
	readonly workerId: string
	private stopped = false
	private loop: Promise<void> | null = null
	readonly stats: WorkerStats = emptyStats()

	constructor(
		pool: Pool,
		llm: LlmGateway,
		config?: Partial<WorkerConfig>,
		vision?: LlmGateway,
	) {
		this.pool = pool
		this.llm = llm
		this.vision = vision
		this.config = { ...DEFAULT_WORKER_CONFIG, ...config }
		assertLeaseCoversLlmTimeout(this.config)
		this.mediaVisionCache = new MediaVisionCacheService(pool)
		// A fresh id per process is the point: a restarted worker must not be able
		// to reclaim its own previous leases and reprocess them.
		this.workerId = `w-${randomUUID().slice(0, 8)}`
		log.info(
			{
				workerId: this.workerId,
				...this.config,
			},
			"moderation worker constructed",
		)
	}

	/** Claim work, process it, write verdicts. Returns false when drained. */
	async runOnce(): Promise<boolean> {
		const cycleStart = Date.now()
		const messages = await this.claim()
		if (messages.length === 0) return false

		this.stats.batches += 1
		this.stats.claimed += messages.length

		// Snapshot the counters so the heartbeat reports THIS cycle, not the
		// process lifetime. A monotonic total is useless for spotting a batch
		// that suddenly gets slow.
		const before = { ...this.stats }
		const trace = traceId(messages[0].id)

		let result: ParseBatchResult
		let llmMs = 0
		try {
			;({ result, llmMs } = await this.analyze(messages))
		} catch (e) {
			// The whole LLM call failed (network, timeout, refusal). Every message
			// in the batch takes the same action, and attempts increments so a
			// permanently broken endpoint eventually parks the batch in `failed`
			// instead of retrying forever.
			this.stats.llmErrors += 1
			await this.handleLlmFailure(messages, e)
			this.logCycle(before, cycleStart, trace, messages.length)
			return true
		}

		if (result.batchFailed) {
			this.stats.batchFailures += 1
			await this.handleLlmFailure(
				messages,
				new Error(result.batchError ?? "unparseable response"),
			)
			this.logCycle(before, cycleStart, trace, messages.length)
			return true
		}

		await this.persist(messages, result, llmMs)
		this.logCycle(before, cycleStart, trace, messages.length)
		return true
	}

	/** Emit one heartbeat per cycle with this cycle's deltas, not lifetime totals. */
	private logCycle(
		before: WorkerStats,
		cycleStart: number,
		trace: string,
		count: number,
	): void {
		logCycle({
			workerId: this.workerId,
			trace,
			count,
			claimed: this.stats.claimed - before.claimed,
			analyzed: this.stats.analyzed - before.analyzed,
			retried: this.stats.retried - before.retried,
			dead: this.stats.dead - before.dead,
			skipped: this.stats.skipped - before.skipped,
			llmErrors: this.stats.llmErrors - before.llmErrors,
			cycleMs: Date.now() - cycleStart,
		})
	}

	private async claim(): Promise<ClaimedMessage[]> {
		// `has_media` comes from the attachments table, NOT from inspecting
		// message content. v1 inferred media by regexing the text
		// (analysisLanes.ts:17 called hasMediaContent(message) with no attachments
		// argument at all), which is why lane assignment disagreed with the
		// orchestrator and media landed in the text lane.
		// `attempts` MUST come from the function's own RETURNING row, not from a
		// re-read of `messages`. Inside that one statement the join sees the
		// pre-UPDATE snapshot, so `m.attempts` is always one behind — the
		// increment claim_messages() performs is only visible to a later
		// statement. Reading it from `c` gives the post-increment value.
		const { rows: claimed } = await this.pool.query<ClaimedMessage>(
			`SELECT m.id,
              m.guild_id      AS "guildId",
              m.channel_id    AS "channelId",
              m.thread_id     AS "threadId",
              m.user_id       AS "authorId",
              m.content,
              m.created_at    AS "createdAt",
              m.username      AS "username",
              m.metadata      AS metadata,
              c.attempts::int AS "attempts",
              (a.n IS NOT NULL) AS "hasMedia",
              (m.metadata::jsonb -> 'channel' ->> 'nsfw')::boolean AS "channelIsNsfw"
         FROM claim_messages($1, $2, $3) AS c
         JOIN messages m ON m.id = c.id
         LEFT JOIN LATERAL (
              SELECT 1 AS n FROM attachments a WHERE a.message_id = m.id LIMIT 1
         ) a ON true`,
			[this.workerId, this.config.claimBatchSize, this.config.leaseMs],
		)
		if (claimed.length > 0) logClaimed(this.workerId, claimed)

		// Never analyse or moderate inside a channel Discord marks NSFW.
		//
		// The flag comes from the channel object itself, captured at message
		// time and persisted in messages.metadata -> channel -> nsfw, so this
		// tracks whatever an admin sets in the Discord UI. No hardcoded id
		// list: production shows 4 flagged channels and 6 safe ones, and the
		// set changes whenever an admin edits a channel.
		//
		// The comment below used to say these rows are "released straight back to
		// pending". They are not — they go to the terminal `skipped` state, as the
		// skip-list branch below already documents. NSFW is a POLL in spirit (an
		// admin may untick the channel later) but a poll must not consume the
		// retry budget, or a message in a flagged channel climbs to `dead` while
		// never having been analysed.
		const inNsfw = claimed.filter((r) => r.channelIsNsfw === true)
		let rows = claimed
		if (inNsfw.length > 0) {
			const safe = claimed.filter((r) => r.channelIsNsfw !== true)
			await this.pool.query(
				`UPDATE messages
            SET ai_status = 'skipped',
                worker_id = NULL,
                lease_until = NULL
          WHERE id = ANY($1)`,
				[inNsfw.map((r) => r.id)],
			)
			log.debug(
				{ skipped: inNsfw.length, kept: safe.length },
				"skipped NSFW channel messages — never analysed",
			)
			// `safe` still needs the skip-list pass below, so fall through rather
			// than returning here.
			rows = safe
		}

		// A channel or thread on the skip list is never analysed, and — unlike
		// NSFW — never re-offered. NSFW is a poll, because an admin can toggle the
		// channel at any time and the rule should follow them; the skip list is a
		// decision that does not change on its own, so a re-claim loop is pure
		// waste: 12 claims an hour per message forever, `attempts` climbing past
		// the cap so the row eventually parks as `dead` — reported as a
		// human-needing-a-look message that was in fact never broken — and a
		// backlog gauge that never drains.
		//
		// So it goes to the terminal `skipped` state (migration 0023): no verdict
		// (nothing was judged, so nothing to delete), no retry budget consumed,
		// and `claim_messages` never selects it again.
		//
		// `messages.channel_id` holds the PARENT id for a thread, so the channel
		// list covers threads under an exempt channel for free — the same rule
		// EXCLUDED_CHANNEL_IDS applies at capture time. A single exempt THREAD
		// cannot be expressed that way, which is what skipThreadIds is for.
		const skipChannels = new Set(this.config.skipChannelIds ?? [])
		const skipThreads = new Set(this.config.skipThreadIds ?? [])
		const skipUsers = new Set(this.config.skipUserIds ?? [])
		const skipReason = (r: ClaimedMessage): string | null => {
			if (skipChannels.has(r.channelId)) {
				return `channel ${r.channelId} is on AI_SKIP_ANALYSIS_CHANNEL_IDS`
			}
			if (r.threadId && skipThreads.has(r.threadId)) {
				return `thread ${r.threadId} is on AI_SKIP_ANALYSIS_THREAD_IDS`
			}
			if (skipUsers.has(r.authorId)) {
				return `user ${r.authorId} is on AI_SKIP_ANALYSIS_USER_IDS`
			}
			return null
		}
		const inSkipped = rows.filter((r) => skipReason(r) !== null)
		if (inSkipped.length > 0) {
			const keep = rows.filter((r) => skipReason(r) === null)
			await this.pool.query(
				`UPDATE messages
            SET ai_status = 'skipped',
                worker_id = NULL,
                lease_until = NULL
          WHERE id = ANY($1)`,
				[inSkipped.map((r) => r.id)],
			)
			this.stats.skipped += inSkipped.length
			log.info(
				{
					skipped: inSkipped.length,
					kept: keep.length,
					channels: [...skipChannels],
					threads: [...skipThreads],
					users: [...skipUsers],
				},
				"channel, thread or user is on the skip list — captured, never analysed",
			)
			for (const m of inSkipped) {
				logMessageRequeued({
					trace: traceId(m.id),
					messageId: m.id,
					// Not a requeue: the terminal reason, kept on the same event so one
					// grep on the trace id explains the message's whole life.
					reason: "skipped_by_config",
					detail: skipReason(m) ?? "",
					attempts: m.attempts,
					createdAt: m.createdAt,
				})
			}
			rows = keep
		}

		if (rows.length === 0) {
			// Everything in this batch was released. Returning false is what makes
			// the poll loop take its idle sleep — otherwise a batch of nothing but
			// skips would report "did work" and spin at full speed.
			return []
		}
		return rows
	}

	/** Build the prompt, call the model, parse. Throws only on transport failure. */
	/**
	 * Describe each attached image/sticker/video with the vision model.
	 *
	 * The moderation LLM needs a text description of what the media
	 * contains before it can decide whether the message violates
	 * server policy. Without this, image-only messages have no evidence
	 * to judge and default to clean. This runs the vision model once
	 * per message with attachments and returns the description text
	 * that the moderation prompt inserts before the message body.
	 *
	 * Failures here are non-fatal: the message still gets analyzed on
	 * its text, and the missing description is noted in the trace.
	 */

	private async analyze(messages: ClaimedMessage[]): Promise<{
		result: ParseBatchResult
		/** Wall-clock of the moderation call, for `verdicts.duration_ms`. */
		llmMs: number
	}> {
		const requestedIds = messages.map((m) => m.id)
		// Sticker and custom emoji count as media. They are not attachment rows,
		// so `hasMedia` from the claim query is false for a message that is
		// nothing but a sticker — and the vision pre-pass was gated on `hasMedia`,
		// so those messages reached the moderator with no visual evidence.
		const hasMedia = messages.some(
			(m) => m.hasMedia || stickerAndEmojiUrls(m.metadata).length > 0,
		)

		// NOTE: the system prompt is built LAST, after vision descriptions and
		// the conversation history resolve. It has to be, because whether it
		// carries the HISTORY_RULES block depends on whether history actually
		// produced something. Building it up here — the obvious spot —
		// hard-codes `history: false` for every batch, and the
		// <conversation_history> then arrives in the user turn with nothing in
		// the system prompt explaining how to read it.
		//
		// Descriptions are resolved BEFORE the prompt is assembled. The previous
		// version called the vision model inside the .map() and then dropped the
		// result on the floor — the variable was never interpolated into the
		// template, so image messages reached the model with no description at
		// all and the whole feature was inert. It also had to be awaited: the
		// call is async, and an un-awaited promise stringifies to "[object
		// Promise]" in a template literal.
		//
		// All descriptions for the batch are fetched concurrently rather than one
		// at a time, so a batch of ten images does not pay the vision latency ten
		// times over. A failure for one message is contained: the description is
		// empty and that message is still judged on its text.
		const visionById = new Map<string, string>()
		const mediaItemsByMsgId = new Map<string, readonly MediaItem[]>()
		if (hasMedia) {
			const mediaMessages = messages.filter((m) => m.hasMedia)
			let attachmentsByMsgId:
				| Map<
						string,
						Array<{
							discord_url: string | null
							type: string | null
							filename: string | null
							size: number | null
						}>
				  >
				| undefined

			try {
				const { rows } = await this.pool.query<{
					message_id: string
					discord_url: string | null
					type: string | null
					filename: string | null
					size: number | null
				}>(
					`SELECT message_id, discord_url, type, filename, size
             FROM attachments
            WHERE message_id = ANY($1::text[])`,
					[mediaMessages.map((m) => m.id)],
				)
				attachmentsByMsgId = new Map()
				for (const row of rows) {
					let list = attachmentsByMsgId.get(row.message_id)
					if (!list) {
						list = []
						attachmentsByMsgId.set(row.message_id, list)
					}
					list.push({
						discord_url: row.discord_url,
						type: row.type,
						filename: row.filename,
						size: row.size,
					})
				}
			} catch (err) {
				log.warn(
					{ err },
					"failed to pre-fetch batch attachments; falling back to per-message queries",
				)
			}

			for (const m of messages) {
				const items = extractMediaItems(
					attachmentsByMsgId?.get(m.id) ?? [],
					m.metadata,
				)
				if (items.length > 0) mediaItemsByMsgId.set(m.id, items)
			}

			// Bounded, not one call per message at once. The concurrency ceiling keeps
			// a 40-message image batch from arriving at the provider as a 40-way
			// burst; p-limit preserves the "all descriptions resolved concurrently"
			// property the old Promise.all comment claimed, up to the cap.
			const limit = pLimit(
				this.config.visionConcurrency ??
					DEFAULT_WORKER_CONFIG.visionConcurrency ??
					1,
			)
			const described = await Promise.all(
				messages.map((m) =>
					limit(async () => {
						const items = mediaItemsByMsgId.get(m.id)
						if (!items || items.length === 0) {
							return [m.id, ""] as const
						}
						return [
							m.id,
							await generateVisionDescription(
								this.pool,
								m,
								this.config.visionTimeoutMs,
								this.vision,
								items,
								this.mediaVisionCache,
							),
						] as const
					}),
				),
			)
			for (const [id, desc] of described) {
				if (desc) visionById.set(id, desc)
			}
		}

		// Fast path: identical spam media. A scammer who blasts the SAME images
		// across every channel pays one vision call and one moderation call for
		// the whole blast, not one per channel.
		//
		// Keyed on media fingerprints ONLY (no author, no channel, no text):
		// screenshots of one casino promo are byte-identical whoever re-posts
		// them, and a fresh account per channel is exactly how these blasts are
		// sent. Gated on a verdict that already said `deleted` with media
		// evidence, inside a 15-minute window, so a legitimate image can never
		// inherit an old judgement.
		const shortCircuited = new Map<string, ParsedVerdict>()
		for (const m of messages) {
			const items = mediaItemsByMsgId.get(m.id)
			if (!items || items.length === 0) continue
			const signature = mediaSignature(items)
			if (!signature) continue
			const seen = this.recentSpamViolations.get(signature)
			if (!seen) continue
			shortCircuited.set(m.id, {
				messageId: m.id,
				status: "deleted",
				action: seen.action,
				reason: seen.reason,
				flags: [...seen.flags],
				categories: [...seen.categories],
				confidence: 1,
				score: 1,
				analysis: seen.analysis,
				evidence: [
					`media_signature=${signature}`,
					"duplicate of a message already deleted in this window",
				],
				policyVersion: POLICY_VERSION,
			})
		}
		if (shortCircuited.size > 0) {
			log.info(
				{
					count: shortCircuited.size,
					ids: [...shortCircuited.keys()].map(traceId),
				},
				"short-circuited duplicate spam media — no model call",
			)
		}

		// Identical messages INSIDE this batch are judged once. A blast is the
		// same text and the same media posted to N channels, so N-1 of them are
		// pure duplicate spend: same prompt tokens, same answer.
		const groupBySignature = new Map<string, ClaimedMessage[]>()
		const toJudge: ClaimedMessage[] = []
		for (const m of messages) {
			if (shortCircuited.has(m.id)) continue
			const sig = batchDedupeKey(m, mediaItemsByMsgId.get(m.id))
			if (!sig) {
				toJudge.push(m)
				continue
			}
			const group = groupBySignature.get(sig)
			if (group) {
				group.push(m)
			} else {
				groupBySignature.set(sig, [m])
				toJudge.push(m)
			}
		}
		const judgeMessages = toJudge
		const judgeVisionById = new Map<string, string>()
		for (const m of judgeMessages) {
			const desc = visionById.get(m.id)
			if (desc) judgeVisionById.set(m.id, desc)
		}

		// Recent predecessors, loaded before the prompt is built so the block can
		// be part of it. One query for the batch; a failure here must not park the
		// messages, so it degrades to no history rather than throwing.
		const historyBlock = await loadContextHistorySafely(
			this.pool,
			judgeMessages,
			this.config.contextWindow,
		)

		// Built AFTER history so `history` reflects reality. See the note at the
		// top of this method for why the obvious earlier spot is the wrong one.
		const system = buildSystemPrompt({
			mode: hasMedia ? "mixed" : "text",
			history: historyBlock.length > 0,
		})

		const body = judgeMessages
			.map((m) => {
				// Identity, in full. `username (user_id)` was not enough: the same
				// person is "Zulfikar", "zulfik_dev" or "Zul" depending on which name
				// is read, so carrying all of them lets the model tie the message in
				// front of it to a human being.
				const author = extractPromptAuthor(m.authorId, m.metadata)
				const who = formatAuthorForPrompt(author)
				const vision = visionById.get(m.id) ?? ""
				// The link and its resolved preview, as ONE block. Without this the
				// model saw the `t.co` wrapper and nothing else: it invented a
				// verdict from the domain, and an embedder message (`content: ""`)
				// was reported as an empty message.
				const links = formatLinkEvidenceForPrompt(m.content, m.metadata)
				// NOTE: only the CONTENT is sanitised. The id/author/ts attributes are
				// structured data we generate, and passing the id through
				// sanitizeAiContent would wrap it in <![CDATA[…]]> — which breaks the
				// `<message id="…">` tag the model must echo back, and made the
				// requested-id extraction below find nothing. Message ids are Discord
				// snowflakes (digits only), so they carry no injection risk; author
				// names are user-controlled and therefore escaped with XML entities
				// only, without the CDATA wrapper.
				//
				// The channel's own name/topic/thread ride along as attributes for the
				// same reason: without them the model is asked whether a message suits
				// this channel while never being told what the channel is for. That is
				// what produced a deleted invite-link "unrelated to the channel's topic"
				// verdict in a channel whose topic IS sharing external communities.
				// Empty string on a row captured before these existed, so the tag
				// degrades to exactly what it was.
				const place = formatChannelContextForPrompt(m.metadata)
				return (
					`<message id="${m.id}" author="${escapeXmlAttr(who)}" ` +
					`ts="${isoFromEpoch(m.createdAt)}"${place}>\n${vision}` +
					`${escapeMessageBody(m.content)}\n${links}\n</message>`
				)
			})
			.join("\n")

		const allVerdicts: ParsedVerdict[] = Array.from(shortCircuited.values())
		let llmMs = 0
		let missingIds: string[] = []
		let batchFailed = false
		let batchError: string | undefined

		if (judgeMessages.length > 0) {
			const requestedIds = judgeMessages.map((m) => m.id)
			const userPrompt =
				`Analisis ${judgeMessages.length} pesan berikut dan kembalikan JSON ` +
				`dengan satu entri per message_id di dalam field results.\n\n` +
				(historyBlock ? `${historyBlock}\n\n` : "") +
				`${body}`

			const llmStart = Date.now()
			const raw = await this.llm.complete({
				system,
				user: userPrompt,
				timeoutMs: this.config.llmTimeoutMs,
			})
			llmMs = Date.now() - llmStart

			const trace = traceId(judgeMessages[0].id)
			logLlmDone({
				trace,
				batchSize: judgeMessages.length,
				model: this.llm.modelLabel ?? "unknown",
				durationMs: llmMs,
				promptChars: system.length + userPrompt.length,
				completionChars: raw.length,
				streamed: true,
				content: raw,
				ids: judgeMessages.map((m) => traceId(m.id)),
			})

			const parseStart = Date.now()
			const attempt = Math.max(...judgeMessages.map((m) => m.attempts))
			const parsed = parseVerdicts(raw, requestedIds, attempt)
			missingIds = parsed.missing
			batchFailed = parsed.batchFailed ?? false
			batchError = parsed.batchError

			logBatchResult({
				trace,
				requested: requestedIds.length,
				ok: parsed.verdicts.length,
				errored: parsed.verdicts.filter((v) => v.status === "error").length,
				missing: parsed.missing.length,
				batchFailed: parsed.batchFailed,
				batchError: parsed.batchError,
				durationMs: Date.now() - parseStart,
			})

			for (const v of parsed.verdicts) {
				allVerdicts.push(v)

				const repMsg = judgeMessages.find((m) => m.id === v.messageId)
				if (repMsg) {
					const sig = batchDedupeKey(repMsg, mediaItemsByMsgId.get(repMsg.id))
					if (sig) {
						const siblings = groupBySignature.get(sig) ?? []
						for (const s of siblings) {
							if (s.id !== v.messageId) {
								allVerdicts.push({
									...v,
									messageId: s.id,
								})
							}
						}
					}

					if (v.status === "deleted") {
						const mItems = mediaItemsByMsgId.get(v.messageId)
						if (mItems && mItems.length > 0) {
							const mSig = mediaSignature(mItems)
							if (mSig) {
								this.recentSpamViolations.set(mSig, {
									flags: v.flags,
									categories: v.categories,
									reason: v.reason ?? "Media spam terdeteksi",
									analysis: v.analysis,
									action: v.action,
									authorId: repMsg.authorId,
								})
							}
						}
					}
				}
			}
		}

		return {
			result: {
				verdicts: allVerdicts,
				missing: missingIds,
				batchFailed,
				batchError,
			},
			llmMs,
		}
	}

	/**
	 * Write verdicts and transition state, in ONE transaction.
	 *
	 * The verdict row must be visible before `ai_status='analyzed'`. Both
	 * statements therefore share a transaction.
	 *
	 * This used to be enforced by a deferred constraint trigger
	 * (`messages_analyzed_has_verdict`), removed in migration 0028 because Prisma
	 * cannot represent triggers. The invariant is now asserted here instead —
	 * same transaction, so a violation aborts rather than half-writing.
	 */
	private async persist(
		messages: ClaimedMessage[],
		result: ParseBatchResult,
		llmMs: number,
	): Promise<void> {
		const byId = new Map(messages.map((m) => [m.id, m]))
		const client: PoolClient = await this.pool.connect()
		try {
			await client.query("BEGIN")

			const validVerdicts: Array<{ msg: ClaimedMessage; v: ParsedVerdict }> = []
			for (const v of result.verdicts) {
				const msg = byId.get(v.messageId)
				if (!msg) continue
				validVerdicts.push({ msg, v })
			}

			if (validVerdicts.length > 0) {
				await this.writeVerdictsBatch(client, validVerdicts, llmMs)
			}

			// Messages the model never mentioned stay queued — they are not judged.
			// Their lease is released so another attempt can pick them up.
			//
			// They get the SAME capped, backed-off treatment as a batch failure.
			// This used to set `ready_for_work_at = now` with no backoff and no
			// attempt cap, which combined badly:
			//   - `claim_messages` orders by created_at ASC, so a poison message is
			//     always the oldest row and is re-sent in the FIRST batch of every
			//     cycle;
			//   - `runOnce` returns true after a successful persist, so `start()`
			//     skips its idle sleep entirely;
			//   => an unbounded tight loop of full-price LLM calls for a message
			//      that can never be judged, and the row never reached `dead`, so
			//      an operator had no signal at all.
			if (result.missing.length > 0) {
				await client.query(
					`UPDATE messages
              SET ai_status = CASE
                    WHEN attempts >= $3 THEN 'dead'
                    ELSE 'retry_wait'
                  END,
                  ready_for_work_at =
                    (extract(epoch from now())*1000)::bigint
                    + ($4::bigint * (1 << LEAST(GREATEST(attempts - 1, 0), 20))),
                  worker_id = NULL, lease_until = NULL
            WHERE id = ANY($1::text[]) AND ai_status = 'claimed' AND worker_id = $2`,
					[
						result.missing,
						this.workerId,
						this.config.maxAttempts,
						this.config.retryBackoffBaseMs,
					],
				)
				for (const id of result.missing) {
					const msg = byId.get(id)
					logMessageRequeued({
						trace: traceId(id),
						messageId: id,
						reason: "omitted_by_model",
						detail: "the model returned no verdict for this message",
						attempts: msg ? msg.attempts : null,
						createdAt: msg?.createdAt,
					})
				}
			}

			await client.query("COMMIT")
		} catch (e) {
			await client.query("ROLLBACK")
			// Leave the rows claimed. The lease lapses and another worker retries
			// them; that is strictly better than guessing which side of the write
			// failed and double-writing a verdict.
			throw e
		} finally {
			client.release()
		}
	}

	private async writeVerdictsBatch(
		client: PoolClient,
		items: ReadonlyArray<{ msg: ClaimedMessage; v: ParsedVerdict }>,
		durationMs: number,
	): Promise<void> {
		if (items.length === 0) return

		// 1. Batch upsert into verdicts table in a single query
		const verdictRowsSql: string[] = []
		const verdictValues: unknown[] = []
		let vp = 1

		for (const { msg, v } of items) {
			const isError = v.status === "error"
			verdictRowsSql.push(
				`($${vp++}, $${vp++}, $${vp++}, $${vp++}, $${vp++}, $${vp++}, $${vp++}, $${vp++}, $${vp++}::jsonb, $${vp++}, $${vp++}, $${vp++}, $${vp++})`,
			)
			verdictValues.push(
				msg.id,
				isError ? "error" : v.status,
				v.reason ?? null,
				v.score,
				v.confidence,
				v.flags,
				v.categories,
				v.analysis,
				JSON.stringify(v.evidence),
				this.llm.modelLabel ?? null,
				isError ? null : v.action,
				// The batch's moderation-call latency. `verdicts.duration_ms` is the
				// only place this exists: `verdictNotifier` reads it for the dashboard
				// badge, and it has read NULL on every row since the column was created
				// because nothing on the write path ever populated it.
				durationMs,
				// `verdictParser` has always stamped the policy that actually ruled
				// (`v.policyVersion`), but this INSERT omitted the column, so every
				// row carried NULL and the audit trail could not say which policy
				// version produced a deletion. The parser's value wins over anything
				// the model echoed back.
				v.policyVersion ?? null,
			)
		}

		await client.query(
			`INSERT INTO verdicts
         (message_id, status, reason, score, confidence, flags, categories,
          analysis, evidence, model, action, duration_ms, policy_version)
       VALUES ${verdictRowsSql.join(", ")}
       ON CONFLICT (message_id) DO UPDATE SET
         status = EXCLUDED.status,
         reason = EXCLUDED.reason,
         score = EXCLUDED.score, confidence = EXCLUDED.confidence,
         flags = EXCLUDED.flags, categories = EXCLUDED.categories,
         analysis = EXCLUDED.analysis, evidence = EXCLUDED.evidence,
         model = EXCLUDED.model,
         action = EXCLUDED.action,
         duration_ms = EXCLUDED.duration_ms,
         policy_version = EXCLUDED.policy_version,
         auto_delete_state = CASE
           WHEN verdicts.status IS DISTINCT FROM EXCLUDED.status
             OR verdicts.score IS DISTINCT FROM EXCLUDED.score
           THEN NULL
           ELSE verdicts.auto_delete_state
         END,
         auto_delete_claimed_at = CASE
           WHEN verdicts.status IS DISTINCT FROM EXCLUDED.status
             OR verdicts.score IS DISTINCT FROM EXCLUDED.score
           THEN NULL
           ELSE verdicts.auto_delete_claimed_at
         END,
         updated_at = (extract(epoch from now())*1000)::bigint`,
			verdictValues,
		)

		// 2. Batch insert into analysis_attempts in a single query
		const attemptRowsSql: string[] = []
		const attemptValues: unknown[] = []
		let ap = 1

		for (const { msg, v } of items) {
			const isError = v.status === "error"
			attemptRowsSql.push(
				`($${ap++}, $${ap++}, $${ap++}, $${ap++}, $${ap++}, $${ap++}, $${ap++}, $${ap++})`,
			)
			attemptValues.push(
				msg.id,
				this.workerId,
				msg.attempts,
				isError ? "parse_error" : "success",
				v.perMessageError ?? null,
				v.perMessageError ? v.analysis : null,
				this.llm.modelLabel ?? null,
				durationMs,
			)
		}

		await client.query(
			`INSERT INTO analysis_attempts
         (message_id, worker_id, attempt, outcome, error_code, error_message, model, duration_ms)
       VALUES ${attemptRowsSql.join(", ")}`,
			attemptValues,
		)

		// 3. Batch mark messages as analyzed in a single query
		const messageIds = items.map(({ msg }) => msg.id)
		const updated = await client.query(
			`UPDATE messages
          SET ai_status = 'analyzed', worker_id = NULL, lease_until = NULL
        WHERE id = ANY($1::text[]) AND ai_status = 'claimed' AND worker_id = $2`,
			[messageIds, this.workerId],
		)

		// Replaces the deferred trigger dropped in 0028: every row we just flipped
		// to `analyzed` must correspond to a verdict we wrote above.
		if (updated.rowCount !== messageIds.length) {
			throw new Error(
				`invariant violated: ${messageIds.length} verdicts written but ` +
					`${updated.rowCount} messages marked analyzed — a claimed message ` +
					`was taken by another worker mid-batch`,
			)
		}

		// 4. Update stats and write trace logs
		for (const { msg, v } of items) {
			const isError = v.status === "error"
			if (isError) this.stats.skipped += 1
			else this.stats.analyzed += 1

			logVerdictWritten({
				trace: traceId(msg.id),
				messageId: msg.id,
				status: isError ? "error" : v.status,
				score: v.score,
				attempts: msg.attempts,
				createdAt: msg.createdAt,
				perMessageError: v.perMessageError ?? null,
			})
		}
	}

	/**
	 * The batch never produced usable results. Reschedule every message with
	 * exponential backoff, or park it in `failed` once the attempt cap is hit.
	 */
	private async handleLlmFailure(
		messages: ClaimedMessage[],
		error: unknown,
	): Promise<void> {
		if (messages.length === 0) return

		const detail = error instanceof Error ? error.message : String(error)
		// Every id in the failed batch, so the operator can grep any ONE of them and
		// find the model call that killed it. This is the line that makes a stuck
		// message traceable back to a single bad API response.
		log.warn(
			{
				workerId: this.workerId,
				trace: traceId(messages[0].id),
				stage: "llm-failed",
				count: messages.length,
				ids: messages.map((m) => traceId(m.id)),
				attempts: messages.map((m) => m.attempts),
				err: detail,
			},
			"LLM batch failed; rescheduling with backoff",
		)
		// The raw text is the whole diagnosis for a parse failure ("no results
		// array", "unexpected token <"), and it is invisible at info level.
		log.debug(
			{ trace: traceId(messages[0].id), stage: "llm-failed-raw", err: detail },
			"failure detail for the failed batch",
		)

		const messageIds = messages.map((m) => m.id)
		const { rows } = await this.pool.query<{
			id: string
			attempts: number
		}>(
			`UPDATE messages
          SET ai_status = CASE
                WHEN attempts >= $3 THEN 'dead'
                ELSE 'retry_wait'
              END,
              ready_for_work_at =
                (extract(epoch from now())*1000)::bigint
                + ($4::bigint * (1 << LEAST(GREATEST(attempts - 1, 0), 20))),
              worker_id = NULL,
              lease_until = NULL
        WHERE id = ANY($1::text[]) AND ai_status = 'claimed' AND worker_id = $2
        RETURNING id, attempts`,
			[
				messageIds,
				this.workerId,
				this.config.maxAttempts,
				this.config.retryBackoffBaseMs,
			],
		)

		const attemptsById = new Map(rows.map((r) => [r.id, r.attempts]))

		const attemptRowsSql: string[] = []
		const attemptValues: unknown[] = []
		let ap = 1
		for (const msg of messages) {
			const attempts = attemptsById.get(msg.id) ?? msg.attempts
			attemptRowsSql.push(
				`($${ap++}, $${ap++}, $${ap++}, 'llm_error', 'llm_unavailable', $${ap++}, $${ap++})`,
			)
			attemptValues.push(
				msg.id,
				this.workerId,
				attempts,
				detail.slice(0, 2000),
				this.llm.modelLabel ?? null,
			)
		}

		if (attemptRowsSql.length > 0) {
			await this.pool.query(
				`INSERT INTO analysis_attempts
           (message_id, worker_id, attempt, outcome, error_code, error_message, model)
         VALUES ${attemptRowsSql.join(", ")}`,
				attemptValues,
			)
		}

		for (const msg of messages) {
			const attempts = attemptsById.get(msg.id) ?? msg.attempts
			const isDead = attempts >= this.config.maxAttempts
			if (isDead) {
				this.stats.dead += 1
				logParked({
					trace: traceId(msg.id),
					messageId: msg.id,
					attempts,
					reason: detail.slice(0, 200),
					createdAt: msg.createdAt,
				})
			} else {
				this.stats.retried += 1
				// Per-message, because "why is this one message still queued?" is the
				// question that gets asked, and it is unanswerable from a batch line.
				logMessageRequeued({
					trace: traceId(msg.id),
					messageId: msg.id,
					reason: "llm_failure",
					detail: detail.slice(0, 200),
					attempts,
					createdAt: msg.createdAt,
				})
			}
		}
	}
	/** Poll until stopped. Reclaims expired leases on the way past. */
	async start(): Promise<void> {
		this.stopped = false
		this.loop = (async () => {
			let sinceReclaim = 0
			let heartbeat: ReturnType<typeof setInterval> | undefined
			while (!this.stopped) {
				let didWork = false
				// Push the lease forward while the batch is in flight. The lease is
				// sized for the batch's worst case (ten vision waves plus the
				// moderation call), so a crash costs the queue that entire window
				// before `reclaim_expired_claims` can return the rows — 25 minutes at
				// the shipped defaults, for work nobody is doing any more.
				//
				// The renewal is safe because it only ever EXTENDS a lease this worker
				// still holds, and the guard `worker_id = $2` means a batch that lost
				// its lease to a peer (or was already committed) renews nothing. That
				// is what stops a slow-but-alive worker from resurrecting rows another
				// worker is already processing.
				heartbeat = setInterval(() => {
					void this.renewLease().catch((e: unknown) => {
						log.warn(
							{
								workerId: this.workerId,
								err: e instanceof Error ? e.message : e,
							},
							"lease renewal failed — the lease will still lapse on its own",
						)
					})
				}, this.config.leaseMs / 3)
				heartbeat.unref?.()
				try {
					didWork = await this.runOnce()
				} catch (e) {
					// Never let one bad batch kill the loop — that is precisely how v1
					// lost work. Log and keep polling.
					log.error(
						{
							workerId: this.workerId,
							err: e instanceof Error ? e.message : e,
						},
						"batch failed; continuing",
					)
				} finally {
					if (heartbeat) clearInterval(heartbeat)
				}

				// Reclaim every ~10 idle polls; cheap, and it is what rescues work
				// abandoned by a crashed peer.
				sinceReclaim += 1
				if (sinceReclaim >= 10) {
					sinceReclaim = 0
					try {
						const { rows } = await this.pool.query<{
							reclaim_expired_claims: number
						}>("SELECT reclaim_expired_claims()")
						const n = rows[0]?.reclaim_expired_claims ?? 0
						if (n > 0) {
							log.info({ reclaimed: n }, "reclaimed expired claims")
						}
					} catch (e) {
						log.warn({ err: e }, "reclaim failed")
					}
				}

				if (!didWork && !this.stopped) {
					await this.sleep(this.config.idlePollMs)
				}
			}
		})()
	}

	private sleep(ms: number): Promise<void> {
		return new Promise((resolve) => setTimeout(resolve, ms))
	}

	/**
	 * Extend this worker's lease on everything it currently holds.
	 *
	 * Scoped to `worker_id = $1` and to `ai_status = 'claimed'`, so it can only
	 * ever renew this worker's own in-flight batch. A batch that has already
	 * committed (or whose lease a peer reclaimed and took over) matches nothing
	 * and the statement is a no-op — which is the property that makes a
	 * heartbeat safe to run on a timer without knowing whether the batch is
	 * still going.
	 */
	private async renewLease(): Promise<void> {
		const leaseMs = this.config.leaseMs
		await this.pool.query(
			`UPDATE messages
          SET lease_until = (extract(epoch from now())*1000)::bigint + $2
        WHERE worker_id = $1
          AND ai_status = 'claimed'`,
			[this.workerId, leaseMs],
		)
	}

	async stop(): Promise<void> {
		this.stopped = true
		// Release in-flight claims so a peer can take over immediately rather than
		// waiting out the lease.
		try {
			await this.pool.query(
				`UPDATE messages
            SET ai_status = 'pending', worker_id = NULL, lease_until = NULL
          WHERE ai_status = 'claimed' AND worker_id = $1`,
				[this.workerId],
			)
		} catch (e) {
			log.warn({ err: e }, "failed to release claims on stop")
		}
		await this.loop
	}
}
