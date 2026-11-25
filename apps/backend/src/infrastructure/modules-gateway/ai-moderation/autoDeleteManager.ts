/**
 * Auto-delete enforcement.
 *
 * Ported from the pre-rewrite `autoDeleteManager.ts` (562 lines, deleted in
 * 2658b0dd along with autoDeleteEligibility/autoDeleteLogger/autoDeleteNotify
 * — 894 lines of enforcement with no replacement). Auto-delete has been dead
 * since that commit: the gateway still holds the Discord client and the
 * `msg.delete()` call, but nothing decided to call it, so `messages.deleted_at`
 * has not moved and 53 flagged messages are still standing in Discord.
 *
 * WHY THE GATEWAY AND NOT THE WORKER
 * Deleting a message needs a live Discord client. The worker deliberately has
 * only a database pool (it runs as a separate process precisely so moderation
 * cannot stall capture), so enforcement stays here where the client lives. The
 * worker only produces verdicts; this module acts on them.
 *
 * WHAT CHANGED FROM THE ORIGINAL
 * The judgement input. The old code gated on `message.ai_status`, which after
 * the rewrite only means "the worker finished this message" and no longer
 * carries the verdict. Every decision now reads the `verdicts` row. The gate
 * order, the dry-run behaviour, the nickname-reset carve-out, the role-hierarchy
 * guard and the audit columns are all preserved.
 */
import type { Client, Guild, PermissionString } from "discord.js-selfbot-v13"
import { LRUCache } from "lru-cache"
import { extractLenientJson } from "../../../domain/utils/lenientJson.js"
import { config } from "../../config/index.js"
import { createChildLogger } from "../../logger/index.js"
import { parseRichMessageMetadata } from "../message-capture/messageMetadata.js"
import { messageStore } from "../message-capture/messageStore.js"
import {
	holdsExemptRole,
	isEligibleForAutoDelete,
	isNameImplicated,
	isNicknameOnlyViolation,
	type MessageLike,
	type VerdictLike,
} from "./autoDeleteEligibility.js"
import { logAlreadyDeleted, logDeletionToChannel } from "./autoDeleteLogger.js"
import { createDefaultGateway } from "./llmGateway.js"
import { actionForVerdict } from "./verdictParser.js"
import { verdictToActionFields } from "./verdictToActionFields.js"

const logger = createChildLogger("auto-delete-manager")

export interface AutoDeleteResult {
	deleted: boolean
	skipped: boolean
	reason: string
}

export interface AutoDeleteInput extends MessageLike {
	username?: string | null
	content?: string | null
	edited_content?: string | null
	metadata?: unknown
}

// Cooldown per guild:user — a nick violation fires per message, but the
// Discord PATCH is idempotent; hammering it on every message by the same
// member is wasteful and risks rate limits.
const recentNicknameResets = new LRUCache<string, number>({
	max: 200,
	ttl: config.AUTO_NICKNAME_RESET_COOLDOWN_MS ?? 10 * 60 * 1000,
})

export function isNicknameResetInCooldown(
	guildId: string,
	userId: string,
): boolean {
	return recentNicknameResets.has(`${guildId}:${userId}`)
}

/** "User" + 5 random digits. */
function generateRandomUsername(): string {
	const suffix = Math.floor(10000 + Math.random() * 90000)
	return `User${suffix}`
}

// ─── Error Handling Utilities ────────────────────────────────────────

function getErrorCode(error: unknown): number | string | undefined {
	if (!error || typeof error !== "object") return undefined
	const maybeCode = (error as { code?: number | string }).code
	const maybeStatus = (error as { status?: number | string }).status
	return maybeCode ?? maybeStatus
}

export function isAlreadyDeletedError(error: unknown): boolean {
	const code = getErrorCode(error)
	// 10008 Unknown Message, 10003 Unknown Channel, 50001 Missing Access, 404.
	//
	// MESSAGE_ID_NOT_FOUND is Discord's own code for a message the account
	// cannot see — returned when the message is already gone, and also when the
	// account lacks MANAGE_MESSAGES in that channel. It is NOT in the historical
	// numeric list because it is a string code. Before this was handled, every
	// such delete was recorded as reason='error' with status='failed', and the
	// dashboard showed a steady stream of failures for deletes that had in fact
	// already succeeded (a human moderator, another bot, or Discord's own
	// retention removed the message first).
	if (
		code === 10008 ||
		code === 10003 ||
		code === 50001 ||
		code === 404 ||
		code === "10008" ||
		code === "10003" ||
		code === "50001" ||
		code === "404" ||
		code === "MESSAGE_ID_NOT_FOUND" ||
		code === "MESSAGE_ID_NOT_FOUND_TYPE"
	) {
		return true
	}
	const msg =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: ""
	return msg.includes("Unknown Message") || msg.includes("Unknown Channel")
}

function hasChannelMessagesApi(channel: unknown): channel is {
	messages: {
		fetch: (id: string) => Promise<{ delete: () => Promise<unknown> }>
	}
} {
	return Boolean(
		channel &&
			typeof channel === "object" &&
			"messages" in channel &&
			(channel as { messages?: unknown }).messages &&
			typeof (channel as { messages: { fetch?: unknown } }).messages.fetch ===
				"function",
	)
}

function hasPermissionApi(channel: unknown): channel is {
	permissionsFor: (
		member: unknown,
	) => { has: (permission: string) => boolean } | null
} {
	return Boolean(
		channel &&
			typeof channel === "object" &&
			"permissionsFor" in channel &&
			typeof (channel as { permissionsFor?: unknown }).permissionsFor ===
				"function",
	)
}

/** The member's per-guild display name, falling back to the username. */
function resolveServerNick(message: AutoDeleteInput): string | null {
	try {
		const parsed = parseRichMessageMetadata(message.metadata as never)
		return parsed?.member?.displayName ?? message.username ?? null
	} catch {
		return message.username ?? null
	}
}

async function logAutoDeleteAttempt(
	message: AutoDeleteInput,
	verdict: VerdictLike | null | undefined,
	result: AutoDeleteResult,
): Promise<void> {
	try {
		await messageStore.createModerationAction({
			message_id: message.id,
			user_id: message.user_id,
			guild_id: message.guild_id,
			action_type: "delete_message",
			reason: result.reason,
			...verdictToActionFields(message, verdict),
			username: message.username ?? null,
			server_nick: resolveServerNick(message),
			executed_by: "auto-delete-manager",
			status:
				result.deleted || result.reason === "dry_run" ? "executed" : "failed",
			error: result.reason === "error" ? result.reason : null,
			executed_at:
				result.deleted || result.reason === "dry_run" ? Date.now() : null,
		} as never)
	} catch (error) {
		logger.warn(
			{
				messageId: message.id,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to persist auto-delete attempt log",
		)
	}
}

// ─── AI-Based Global Username Check ──────────────────────────────────

/**
 * Read the `offensive` decision from a model reply.
 *
 * Returns `undefined` when the reply carries no readable boolean — the caller
 * then treats the check as failed and fails open, which is the documented
 * behaviour. Reading the FIELD rather than searching the text matters: a
 * `false` verdict whose explanation contains the word "true" must not flip.
 */
function readOffensiveFlag(text: string): boolean | undefined {
	let parsed: unknown
	try {
		parsed = extractLenientJson(text).value
	} catch {
		return undefined
	}
	if (parsed === null || typeof parsed !== "object") return undefined
	const record = parsed as Record<string, unknown>
	for (const key of ["offensive", "is_offensive", "violation", "violates"]) {
		const value = record[key]
		if (value === true || value === "true") return true
		if (value === false || value === "false") return false
	}
	return undefined
}

/**
 * Ask the moderation model whether a global username violates the rules.
 *
 * Fail-open: if the call fails or times out, return false so the nickname
 * reset still completes — a broken model must not block enforcement.
 */
async function isGlobalUsernameOffensiveAI(username: string): Promise<boolean> {
	if (!username) return false
	try {
		const content = await createDefaultGateway().complete({
			system:
				"Kamu adalah moderator Discord. Tentukan apakah username berikut melanggar aturan server " +
				"(judi, togel, scam, spam, NSFW, SARA, atau ofensif). Jawab HANYA dengan JSON: " +
				'{"offensive": true} atau {"offensive": false}. Jangan penjelasan tambahan.',
			user: `Username: "${username}"`,
			timeoutMs: 10_000,
		})
		const text = content?.trim() ?? ""
		// Read the boolean, not the prose. The old version matched a quoted key
		// with a regex and, on a miss, fell back to `text.includes("true")` —
		// so a model that wrote `{offensive: false}` (unquoted key) or
		// `{"offensive": false, "reason": "true statement, not abuse"}` could
		// have its nickname replaced on the strength of a substring.
		const decision = readOffensiveFlag(text)
		if (decision !== undefined) return decision
		// No readable boolean at all: this is a failed check, and the documented
		// behaviour is fail-open so a broken model cannot block the reset.
		return false
	} catch (error) {
		logger.warn(
			{
				username,
				error: error instanceof Error ? error.message : String(error),
			},
			"AI username check failed — failing open (not offensive)",
		)
		return false
	}
}

/**
 * Reset a member's server nickname to their global username
 * (`setNickname(null)` removes the custom nick). If the global username is
 * itself offensive it is replaced with a random one, so an offensive global
 * name cannot be used to slip past the filter.
 */
export async function resetOffensiveNickname(
	client: Client | undefined,
	guildId: string,
	userId: string,
	messageId: string,
): Promise<boolean> {
	const cooldownKey = `${guildId}:${userId}`
	try {
		if (!client?.user?.id) {
			logger.warn(
				{ messageId, guildId, userId },
				"Nick reset skipped: client missing",
			)
			return false
		}
		if (userId === client.user.id) {
			logger.debug({ userId }, "Nick reset skipped: operator's own account")
			return false
		}
		if (recentNicknameResets.has(cooldownKey)) {
			logger.debug({ guildId, userId }, "Nick reset skipped: cooldown active")
			return false
		}

		const guild = client.guilds.cache.get(guildId)
		if (!guild) {
			logger.warn({ messageId, guildId }, "Nick reset skipped: guild not found")
			return false
		}
		const member = await guild.members.fetch(userId)
		// Discord rejects setNickname with Missing Permissions (50013) whenever the
		// target's top role sits above ours, even with MANAGE_NICKNAMES. Guard on
		// `manageable` (hierarchy-aware) so we skip with a clear reason instead of
		// hammering a doomed PATCH on every message.
		if (!member.manageable) {
			logger.debug(
				{
					messageId,
					guildId,
					userId,
					reason: "target role above bot in hierarchy (Discord 50013)",
				},
				"Nick reset skipped: member not manageable",
			)
			return false
		}
		await member.setNickname(null, "[auto] nickname melanggar aturan server")

		// The member now shows their global username. If that is also offensive,
		// replace it so the filter cannot be circumvented that way.
		const refreshedMember = await guild.members.fetch(userId)
		const globalUsername = refreshedMember.user?.username ?? ""
		if (await isGlobalUsernameOffensiveAI(globalUsername)) {
			const randomName = generateRandomUsername()
			await refreshedMember.setNickname(
				randomName,
				"[auto] global username juga melanggar, diganti random",
			)
			logger.info(
				{ messageId, guildId, userId, globalUsername, randomName },
				"Global username also offensive — replaced with random username",
			)
		}

		recentNicknameResets.set(cooldownKey, Date.now())
		logger.info(
			{ messageId, guildId, userId },
			"Offensive nickname reset to default username",
		)
		return true
	} catch (error) {
		logger.warn(
			{
				messageId,
				guildId,
				userId,
				error: error instanceof Error ? error.message : String(error),
				code: getErrorCode(error),
			},
			"Nick reset failed",
		)
		return false
	}
}

/**
 * The nickname reset, and the audit row that records it — one place.
 *
 * Three gates, in order, and each has its own outcome so the caller can report
 * honestly rather than collapsing them into a boolean:
 *
 *  1. EXEMPT ROLE. Discord refuses `setNickname` (50013) for a member whose top
 *     role is above the account's, so the reset is not attempted at all. This is
 *     a permission fact, not a judgement about the violation — which is why it
 *     skips the RESET while the message deletion proceeds normally.
 *  2. COOLDOWN. One PATCH per member per window; the reset is idempotent and
 *     hammering it risks rate limits.
 *  3. The PATCH itself, with the failure recorded as `nickname_reset_failed`.
 *
 * Extracted so both call sites (the nickname-only branch and the "body violates
 * too" branch) cannot drift: a duplicated reset is how the earlier version came
 * to log a reset it never performed in one branch.
 */
async function applyNicknameReset(
	client: Client | undefined,
	message: AutoDeleteInput,
	verdict: VerdictLike | null | undefined,
	reason: string,
): Promise<"reset" | "exempt_role" | "cooldown"> {
	if (holdsExemptRole(message)) {
		logger.debug(
			{ messageId: message.id, userId: message.user_id },
			"Nick reset skipped: sender holds a role above this account (Discord 50013)",
		)
		return "exempt_role"
	}
	if (isNicknameResetInCooldown(message.guild_id, message.user_id)) {
		logger.debug(
			{ messageId: message.id, userId: message.user_id },
			"Nick reset skipped: cooldown active",
		)
		return "cooldown"
	}

	const resetOk = await resetOffensiveNickname(
		client,
		message.guild_id,
		message.user_id,
		message.id,
	)
	try {
		await messageStore.createModerationAction({
			message_id: message.id,
			user_id: message.user_id,
			guild_id: message.guild_id,
			action_type: "reset_nickname",
			reason,
			...verdictToActionFields(message, verdict),
			username: message.username ?? null,
			server_nick: resolveServerNick(message),
			executed_by: "auto-delete-manager",
			status: resetOk ? "executed" : "failed",
			error: resetOk ? null : "nickname_reset_failed",
			executed_at: resetOk ? Date.now() : null,
		} as never)
	} catch (error) {
		logger.warn(
			{
				messageId: message.id,
				error: error instanceof Error ? error.message : String(error),
			},
			"Failed to persist nickname reset action log",
		)
	}
	return "reset"
}

/**
 * Decide whether a just-judged message should be deleted, and do it.
 *
 * Called by the gateway for every message the worker has judged. Returns a
 * result describing what happened; never throws, because a failed deletion
 * must not take down capture.
 */
export async function attemptAutoDeleteFlaggedMessage(
	client: Client | undefined,
	message: AutoDeleteInput,
	verdict: VerdictLike | null | undefined,
): Promise<AutoDeleteResult> {
	logger.debug({ messageId: message.id }, "Processing message for auto-delete")

	// ── The enforcement, derived from the CATEGORY ─────────────────────
	// Not from the model's own `action` field, and not from a remembered
	// preference. Enforcement follows the violation category, so the same
	// category always produces the same action — which is what stops a model
	// from deleting a message over a nickname. `actionForCategories` is the one
	// rule, shared with the parser.
	//
	// Read from the verdict row rather than trusted from the parser, because the
	// two run in DIFFERENT PROCESSES: the worker parses and persists, the gateway
	// enforces, and anything in between (an older row, a hand-written verdict, a
	// future writer) can hold a value this code has never seen. Deriving it here
	// means a legacy row is also classified by its category — prod's 51
	// `offensive_nickname` rows carry that category, so they resolve correctly
	// even though their stored `action` came from the old code path.
	const enforced = actionForVerdict(verdict)

	// ── Nickname violation: reset the nick, keep the message ─────
	// The violation is in the NAME, so enforcement acts on the name and the
	// message stays.
	//
	// The predicate is `isNicknameOnlyViolation`, and it is the one that decides,
	// because it is the only thing that can answer the question the category
	// cannot. `enforced === "reset_nickname"` says "every category named the
	// name"; it does NOT say the body is clean, and a message whose body also
	// insults someone must still be deleted. Taking the category alone as
	// sufficient would be the jail card in a new costume: categorise a message
	// `offensive_nickname` and any abusive body escapes.
	//
	// `isNicknameOnlyViolation` reads the SAME effective categories (so a
	// category-only row is still classified by its category) and additionally
	// requires the body to be free of insult terms. It therefore contains the
	// category test — `reset_nickname` is only derivable from name categories,
	// and those are exactly the ones its path 1 accepts — and adds the body check
	// that makes the difference between sparing a message and letting one
	// through. One predicate, one source of truth for the insult terms.
	//
	// It is also a SAFETY NET over the category, which is the point of checking
	// evidence at all: the shipped regression is user 1052035456688205854,
	// nickname "adit cuking", body "Nandayo" — categorised `harassment`, so a
	// purely category-driven decision deleted the message and left the name
	// standing. A model that miscategorises a name violation as a content one
	// must not thereby delete the message.
	if (isNicknameOnlyViolation(message, verdict)) {
		const outcome = await applyNicknameReset(
			client,
			message,
			verdict,
			"nickname melanggar aturan server; pesan dibiarkan",
		)
		logger.info(
			{ messageId: message.id, userId: message.user_id, outcome, enforced },
			"Nickname violation: message kept, nickname reset attempted",
		)
		return {
			deleted: false,
			skipped: true,
			reason:
				outcome === "exempt_role"
					? "nickname_reset_exempt_role"
					: "nickname_only_violation",
		}
	}

	// ── A content violation whose name is ALSO implicated ──────────────
	// The message goes, and the name is corrected alongside it. This is the
	// mirror of the branch above: `isNicknameOnlyViolation` returned false,
	// which is ambiguous — it means either "no nickname problem" or "a nickname
	// problem PLUS a rude body".
	//
	// It used to perform the reset only in the "message not being deleted"
	// sub-case, while logging that a reset had been applied in the other. So for
	// a member whose name AND body both violated, the message was deleted and the
	// NAME was left alone, under a log line asserting the opposite. Production:
	// 51 of those log lines and ZERO "Offensive nickname reset" lines — the
	// claimed reset never once ran.
	//
	// Deliberately ABOVE the eligibility gate, and that ordering is the point:
	// the name is objectionable on its own, so it is corrected whether or not the
	// MESSAGE turns out to be deletable. A verdict that fails the confidence or
	// suppressed-embed gates can still describe a member whose nickname breaks
	// the rules — the captured name is evidence in its own right and does not
	// become clean because the message was unreadable. Reaching this on a `clean`
	// or `error` verdict is therefore intended, not a leak: the insult term is in
	// the name, and the cooldown in `applyNicknameReset` bounds the correction to
	// one PATCH per member per window.
	if (isNameImplicated(message, verdict)) {
		const outcome = await applyNicknameReset(
			client,
			message,
			verdict,
			"nickname juga melanggar; nickname direset dan pesan dihapus",
		)
		logger.info(
			{ messageId: message.id, userId: message.user_id, outcome },
			"Content violation with a flagged name: nickname reset attempted, message still deleted",
		)
	}

	// ── Eligibility gate ─────────────────────────────────────────────
	if (!isEligibleForAutoDelete(message, verdict)) {
		logger.debug(
			{ messageId: message.id },
			"Auto-delete skipped: model did not decide to delete (or category blocked)",
		)
		const result: AutoDeleteResult = {
			deleted: false,
			skipped: true,
			reason: "not_eligible",
		}
		await logAutoDeleteAttempt(message, verdict, result)
		return result
	}

	// ── Client check ─────────────────────────────────────────────────
	if (!client?.user?.id) {
		logger.warn(
			{ messageId: message.id },
			"Auto-delete skipped: client user missing",
		)
		return { deleted: false, skipped: true, reason: "client_user_missing" }
	}

	// ── Deletion flow ────────────────────────────────────────────────
	// Hoisted out of the try so the catch branch can report the channel even
	// when resolution itself is what failed.
	const channelId = message.thread_id ?? message.channel_id
	let guild: Guild | undefined
	try {
		// Resolve the guild and channel, fetching from Discord only if they are
		// not already cached.
		//
		// The gateway has no startup priming of `client.guilds.cache` — it only
		// caches what it happens to see — so a plain `cache.get()` returns nothing
		// for a channel the account never interacts with, and the first version
		// retried that message every 5s forever. A fetch is the correct answer
		// here: the user account is a member, so it can read the channel list.
		guild = client.guilds.cache.get(message.guild_id)
		if (!guild) {
			logger.warn(
				{ messageId: message.id, guildId: message.guild_id },
				"Auto-delete skipped: guild not found",
			)
			return { deleted: false, skipped: true, reason: "guild_not_found" }
		}

		let channel = guild.channels.cache.get(channelId)
		if (!channel) {
			try {
				await guild.channels.fetch(channelId)
				channel = guild.channels.cache.get(channelId)
			} catch (fetchErr) {
				logger.warn(
					{
						messageId: message.id,
						channelId,
						error:
							fetchErr instanceof Error ? fetchErr.message : String(fetchErr),
					},
					"Auto-delete skipped: channel could not be resolved",
				)
				return {
					deleted: false,
					skipped: true,
					reason: "channel_not_found",
				}
			}
		}
		if (!channel) {
			logger.warn(
				{ messageId: message.id, channelId },
				"Auto-delete skipped: channel not found",
			)
			return { deleted: false, skipped: true, reason: "channel_not_found" }
		}

		if (!hasPermissionApi(channel) || !hasChannelMessagesApi(channel)) {
			logger.warn(
				{ messageId: message.id, channelId },
				"Auto-delete skipped: channel cannot delete messages",
			)
			return { deleted: false, skipped: true, reason: "unsupported_channel" }
		}

		const selfMember = await guild.members.fetch(client.user.id)
		const permissions = channel.permissionsFor(selfMember)
		const canManageMessages =
			permissions?.has("MANAGE_MESSAGES" as PermissionString) ?? false

		if (!canManageMessages) {
			logger.warn(
				{ messageId: message.id, channelId, userId: client.user.id },
				"Auto-delete skipped: current user lacks Manage Messages",
			)
			const result: AutoDeleteResult = {
				deleted: false,
				skipped: true,
				reason: "missing_manage_messages",
			}
			await logAutoDeleteAttempt(message, verdict, result)
			return result
		}

		// ── Perform the deletion ───────────────────────────────────────
		const discordMessage = await channel.messages.fetch(message.id)
		await discordMessage.delete()
		logger.info(
			{ messageId: message.id, channelId },
			"Message deleted from Discord",
		)

		// Mirror the deletion into the row.
		//
		// The enforcer only ever wrote `moderation_actions`; `messages.deleted_at`
		// stayed NULL, so the message still looked present everywhere it is read:
		// the dashboard's live counts, the enforcer's own `m.deleted_at IS NULL`
		// filter, and the claim query (which excludes deleted rows) — a message
		// removed from Discord was still eligible for analysis. Best-effort: the
		// Discord delete has already succeeded, and a failed bookkeeping write
		// must not be reported as a failed delete.
		try {
			await messageStore.updateMessageAsDeleted(message.id, Date.now())
		} catch (err) {
			logger.error(
				{ messageId: message.id, error: err },
				"Deleted from Discord but failed to mark the row deleted",
			)
		}

		// Notifications must never fail the deletion that already succeeded.
		await logDeletionToChannel(guild, message, verdict, channelId)

		const result: AutoDeleteResult = {
			deleted: true,
			skipped: false,
			reason: "deleted",
		}
		await logAutoDeleteAttempt(message, verdict, result)
		return result
	} catch (error) {
		if (isAlreadyDeletedError(error)) {
			// The message is gone, but not by us. A human moderator, another bot, or
			// Discord's own retention removed it between our verdict and this
			// attempt. That is worth a line in the mod log: it is the difference
			// between "the system deleted this" and "someone beat us to it", and
			// without it the audit log looks like the system silently did nothing.
			logger.info(
				{ messageId: message.id, channelId },
				"Message already gone from Discord (deleted by someone else) — treating as deleted",
			)
			const result: AutoDeleteResult = {
				deleted: true,
				skipped: false,
				reason: "already_deleted",
			}
			// The message is gone from Discord, so the row must say so — otherwise
			// it is still counted as live and still looks analysable.
			try {
				await messageStore.updateMessageAsDeleted(message.id, Date.now())
			} catch (err) {
				logger.error(
					{ messageId: message.id, error: err },
					"Already gone from Discord but failed to mark the row deleted",
				)
			}
			if (guild) {
				await logAlreadyDeleted(guild, message, verdict, channelId)
			}
			await logAutoDeleteAttempt(message, verdict, result)
			return result
		}
		logger.error(
			{
				messageId: message.id,
				error: error instanceof Error ? error.message : String(error),
				code: getErrorCode(error),
			},
			"Auto-delete failed",
		)
		const result: AutoDeleteResult = {
			deleted: false,
			skipped: false,
			reason: "error",
		}
		await logAutoDeleteAttempt(message, verdict, result)
		return result
	}
}
