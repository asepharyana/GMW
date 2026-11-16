/**
 * Channel logging for auto-delete.
 *
 * Ported from the pre-rewrite `autoDeleteLogger.ts`. The only change is where
 * the status comes from: the old code read `message.ai_status` and
 * `message.ai_severity`, which after the rewrite no longer describe the
 * judgement. It now comes from the verdict row, which carries the decision and
 * nothing else — there is no severity to report.
 */
import type { Guild } from "discord.js-selfbot-v13"
import { config } from "../../config/index.js"
import { createChildLogger } from "../../logger/index.js"
import type { MessageLike, VerdictLike } from "./autoDeleteEligibility.js"

interface ChannelWithSend {
	send: (content: string | object, options?: unknown) => Promise<unknown>
}

const logger = createChildLogger("auto-delete-logger")

type LoggedMessage = MessageLike & {
	content?: string | null
	edited_content?: string | null
}

interface LogFields {
	status: string
	categories: string
	reason: string
	snippet: string
}

/** The four values every auto-delete log line reports about a message. */
function describeVerdict(
	message: LoggedMessage,
	verdict: VerdictLike | null | undefined,
): LogFields {
	return {
		status: verdict?.status ?? message.ai_status ?? "unknown",
		categories:
			(verdict?.categories ?? []).join(", ") ||
			message.ai_categories ||
			message.ai_moderation_flags ||
			"—",
		reason: verdict?.analysis ?? message.ai_analysis ?? "—",
		snippet: (message.edited_content ?? message.content ?? "").substring(
			0,
			200,
		),
	}
}

/**
 * Send one line to the configured moderation log channel. No-op when
 * AUTO_DELETE_LOG_CHANNEL_ID is unset. Failures are warnings only — losing the
 * log line must never fail the deletion.
 */
async function sendToLogChannel(options: {
	guild: Guild
	message: LoggedMessage
	verdict: VerdictLike | null | undefined
	channelId: string
	format: (fields: LogFields) => string
	successLog: string
	failureLog: string
}): Promise<void> {
	const { guild, message, verdict, channelId } = options
	if (!config.AUTO_DELETE_LOG_CHANNEL_ID) return

	try {
		const logChannel = guild.channels.cache.get(
			config.AUTO_DELETE_LOG_CHANNEL_ID,
		)
		if (
			logChannel &&
			"send" in logChannel &&
			typeof (logChannel as ChannelWithSend).send === "function"
		) {
			await (logChannel as ChannelWithSend).send(
				options.format(describeVerdict(message, verdict)),
			)
			logger.info({ channelId, messageId: message.id }, options.successLog)
		}
	} catch (logErr) {
		logger.warn(
			{ messageId: message.id, error: String(logErr) },
			options.failureLog,
		)
	}
}

const logTime = () => `<t:${Math.floor(Date.now() / 1000)}:R>`

/**
 * Post a log message about the auto-deletion to the configured moderation log
 * channel.
 */
export function logDeletionToChannel(
	guild: Guild,
	message: LoggedMessage,
	verdict: VerdictLike | null | undefined,
	channelId: string,
): Promise<void> {
	return sendToLogChannel({
		guild,
		message,
		verdict,
		channelId,
		format: ({ status, categories, reason, snippet }) =>
			`**🧹 Auto-Delete** — Pesan dari <@${message.user_id}> di <#${channelId}>\n` +
			`**Status:** ${status}\n` +
			`**Kategori:** ${categories}\n` +
			`**Alasan:** ${reason}\n` +
			`**Isi:** ${snippet}\n` +
			`**Waktu:** ${logTime()}`,
		successLog: "Deletion logged to channel",
		failureLog: "Failed to log auto-delete to moderation channel",
	})
}

/**
 * Report that a flagged message was already gone before we could delete it.
 *
 * Discord answers with MESSAGE_ID_NOT_FOUND when a human moderator, another
 * bot, or the server's own message retention removed the message between our
 * verdict and our delete attempt. We treat that as "deleted" so the verdict is
 * not retried forever, but it is important to say who actually did it: an
 * audit trail where every entry claims the system deleted the message is
 * misleading when most of them were removed by a person.
 */
export function logAlreadyDeleted(
	guild: Guild,
	message: LoggedMessage,
	verdict: VerdictLike | null | undefined,
	channelId: string,
): Promise<void> {
	return sendToLogChannel({
		guild,
		message,
		verdict,
		channelId,
		format: ({ status, categories, reason, snippet }) =>
			`**⏭️ Auto-Delete gagal — sudah dihapus orang lain** — Pesan dari <@${message.user_id}> di <#${channelId}>\n` +
			`**Status:** ${status}\n` +
			`**Kategori:** ${categories}\n` +
			`**Alasan AI:** ${reason}\n` +
			`**Isi:** ${snippet}\n` +
			`Discord mengembalikan ` +
			`\`MESSAGE_ID_NOT_FOUND\`: pesan sudah tidak ada saat sistem mau ` +
			`menghapus. Kemungkinan dihapus moderator lain, bot lain, atau oleh ` +
			`retensi pesan server. Sistem tidak perlu menghapusnya lagi.\n` +
			`**Waktu:** ${logTime()}`,
		successLog: "Already-deleted message logged to channel",
		failureLog: "Failed to log already-deleted message to moderation channel",
	})
}
