import type {
	Message,
	TextChannel,
	ThreadChannel,
} from "discord.js-selfbot-v13"

export interface MessageLocation {
	channelId: string
	threadId: string | null
	threadName: string | null
	channelName: string | null
	/** Channel topic (resmi/deskripsi channel) — strong context for judging
	 *  whether a message fits the channel's purpose. Guarded: some channel
	 *  types (threads on older API builds) expose no topic. */
	topic?: string | null
	nsfw?: boolean
	nsfwLevel?: string | null
	ageRestricted?: boolean
	/** Discord channel type ("GUILD_TEXT", "GUILD_PUBLIC_THREAD", …), so the
	 *  dashboard and the prompt can tell an announcement channel from a support
	 *  thread without resolving the id. */
	channelType?: string | null
	/** Slowmode in seconds. 0 or null means none. */
	rateLimitPerUser?: number | null
	/** Thread-only. Who started it and when. `ownerId` is null when the account
	 *  cannot see the owner (e.g. a thread in a channel it lost access to). */
	threadOwnerId?: string | null
	threadCreatedAt?: number | null
	threadArchived?: boolean | null
	threadLocked?: boolean | null
	threadMemberCount?: number | null
	threadMessageCount?: number | null
	/** Forum/media post tags. Empty for an ordinary channel. */
	appliedTags?: string[]
}

export interface StickerEvidence {
	id: string
	name: string
	url: string
	format: string | null
	/** Alt text a human set on the sticker — often the only description there is. */
	description?: string | null
	/** Owning pack, so the dashboard can group stickers and spot a pack that
	 *  someone posted repeatedly. */
	packId?: string | null
	type?: string | null
	tags?: string[] | null
}

export interface CustomEmojiEvidence {
	id: string
	name: string
	animated: boolean
	url: string
	/** Guild that owns the emoji, or null for a global one. Lets a prompt tell
	 *  "an emoji someone uploaded" from Discord's own set. */
	guildId?: string | null
}

export interface MentionedRoleEvidence {
	id: string
	name: string
	/** Higher = more privileged, so a ping at the mod team is distinguishable
	 *  from a ping at a colour role. */
	position?: number | null
	/** True for @everyone and @here, which are materially different from
	 *  mentioning a named role. */
	isEveryone?: boolean
}

export interface MentionedUserEvidence {
	id: string
	username: string
	/** Bot authors are legitimate moderation context: a raid tool posting fifty
	 *  identical messages looks nothing like a user. */
	bot?: boolean
	displayName?: string | null
	globalName?: string | null
}

export interface PollEvidence {
	question: string | null
	allowMultiselect: boolean
	durationHours: number | null
	answers: Array<{
		id: number
		text: string | null
		/** EMOJI | NUMERIC. A poll of numbers with a question like "how much do you
		 *  bet" is a different moderation signal from a yes/no poll. */
		pollMediaType: string | null
		emoji: string | null
	}>
}

export interface EmbedEvidence {
	title: string | null
	description: string | null
	url: string | null
	color: number | null
	image: string | null
	thumbnail: string | null
	author: {
		name: string | null
		url: string | null
		iconURL: string | null
	} | null
	footer: { text: string | null; iconURL: string | null } | null
	fields: Array<{ name: string; value: string; inline: boolean }>
	/** "rich", "image", "video", "link", "tweet"… The type alone separates a
	 *  plain link preview from a rich embed, which are different content. */
	type?: string | null
	/** Epoch millis of a timestamp footer, or null. */
	timestamp?: number | null
	/** Video URL for a video embed — YouTube/TikTok embeds put the whole
	 *  offending content in the video, not in the title. */
	video?: {
		url: string | null
		width: number | null
		height: number | null
	} | null
	/** Embed provider ("Twitter", "YouTube", …). */
	provider?: { name: string | null; url: string | null } | null
}

export interface AttachmentEvidence {
	id: string
	name: string
	url: string
	contentType: string | null
	size: number
	/** Pixel dimensions; present for images and video, null otherwise. Worth
	 *  capturing: a 2000x3000 phone screenshot reads very differently from a
	 *  64x64 sticker when the vision model looks at it. */
	width?: number | null
	height?: number | null
	/** Seconds, for audio and video. */
	duration?: number | null
	/** User-supplied alt text, which frequently says more than the file does
	 *  (or is itself the thing worth moderating). */
	description?: string | null
	/** Discord's spoiler marker. */
	spoiler?: boolean
	/** "REMIX" when the attachment was edited into a new message. */
	flags?: string[]
}

export interface MessageMediaEvidence {
	stickers: StickerEvidence[]
	embeds: EmbedEvidence[]
	attachments: AttachmentEvidence[]
	customEmojis: CustomEmojiEvidence[]
}

export interface MemberRoleEvidence {
	id: string
	name: string
	/** Role hierarchy. This is what makes a moderation verdict actionable: a
	 *  slur from someone with Manage Server is a different decision from the
	 *  same slur from a drive-by account. */
	position: number
	/** Set for @everyone. */
	isEveryone?: boolean
	/** Role colour, as a Discord colour integer. */
	color?: number | null
	hoist?: boolean
	managed?: boolean
	mentionable?: boolean
}

export interface RichMessageMetadata {
	stickers: Array<StickerEvidence>
	embeds: Array<EmbedEvidence>
	attachments: Array<AttachmentEvidence>
	customEmojis: Array<CustomEmojiEvidence>
	mentionedRoles: Array<MentionedRoleEvidence>
	mentionedUsers: Array<MentionedUserEvidence>
	/** Channel pings, which the old metadata dropped entirely. A link posted
	 *  with a channel ping is a broadcast, not a reply. */
	mentionedChannels: Array<{
		id: string
		name: string | null
		type: string | null
	}>
	author: {
		id: string
		username: string
		tag: string | null
		avatarURL: string | null
		bot: boolean
		/** Display name (the new-style name), when it differs from the username. */
		displayName?: string | null
		globalName?: string | null
		/** Discord system/verified flags, as raw bit values. Distinguishes a
		 *  verified staff badge from an account that merely claims to be staff. */
		flags?: number | null
		accountCreatedTimestamp?: number | null
		system?: boolean
	}
	member: {
		displayName: string | null
		roles: MemberRoleEvidence[]
		joinedTimestamp: number | null
		/** The member's per-guild nickname, when set. */
		nickname?: string | null
		/** Guild-relative permissions, as a JSON-safe array of permission names.
		 *  This is the single most useful fact for deciding whether a message is
		 *  worth escalating: a moderator posting a link is not a spam report. */
		permissions?: string[]
		/** Epoch millis the member is timed out until, or null. A message from a
		 *  currently-timed-out member is worth a look. */
		communicationDisabledUntil?: number | null
		premiumSince?: number | null
		pending?: boolean
	} | null
	channel: MessageLocation
	reference: {
		messageId: string | null
		channelId: string | null
		guildId: string | null
		type: string | null
		content: string | null
		repliedUsername: string | null
		repliedUserId: string | null
		/** Attachments on the replied-to message. A reply that forwards a
		 *  screenshot has no text, so without this the moderator sees an empty
		 *  quote. */
		attachments?: AttachmentEvidence[]
		authorId?: string | null
		authorIsBot?: boolean | null
	} | null
	isCrosspost: boolean
	/** True when the message pinged @everyone or @here. */
	mentionsEveryone?: boolean
	/** Raw MessageFlags bitfield, so any flag Discord adds later is preserved
	 *  instead of being dropped at capture time. */
	flags?: number
	/** Decoded, human-readable flag names — what the prompt actually wants. */
	flagNames?: string[]
	/** Webhook id, when the message came through a webhook. A webhook author is
	 *  not the person whose name it borrows. */
	webhookId?: string | null
	applicationId?: string | null
	/** Pinned state. */
	pinned?: boolean
	/** Text-to-speech read out loud in-channel. */
	tts?: boolean
	/** Discord-generated (join/boost/pin) rather than written by a user. */
	system?: boolean
	/** Timestamp of the last edit, or null. */
	editedTimestamp?: number | null
	/** Position in a thread, when Discord reports it. */
	position?: number | null
	/** A thread was started from this message. */
	hasThread?: boolean
	/** Poll attached to the message. */
	poll?: PollEvidence | null
	/** Components (buttons/selects) attached to the message. */
	componentCount?: number
	/** Set when the account reacted to its own message — a spoiler or a bot
	 *  self-reply, both of which change how the message should be read. */
	selfReacted?: boolean
}

/**
 * Read the channel topic, which Discord only exposes on a *parent* text
 * channel — `ThreadChannel` has no `topic` field at all.
 *
 * Reading `channel.topic` off a thread therefore always returned null, so
 * every thread message lost the one piece of context that says what the
 * thread is for. Fall back to the parent.
 */
function resolveTopic(channel: TextChannel | ThreadChannel): string | null {
	if ("topic" in channel && typeof channel.topic === "string") {
		return channel.topic
	}
	const parent = (channel as ThreadChannel).parent
	if (parent && "topic" in parent && typeof parent.topic === "string") {
		return parent.topic
	}
	return null
}

/**
 * Read the NSFW flag, inheriting it from the parent for threads.
 *
 * `ThreadChannel` has no `nsfw` property (Discord has no per-thread toggle;
 * the flag lives on the parent). The old code read `channel.nsfw` only, so a
 * thread inside an age-restricted channel reported `nsfw: undefined` and both
 * the worker (which skips NSFW messages) and the auto-delete enforcer treated
 * it as safe. Age-restricted channel content was being sent to the moderation
 * model and, when flagged, deleted.
 */
function resolveNsfw(
	channel: TextChannel | ThreadChannel,
): boolean | undefined {
	const self = channel as { nsfw?: unknown }
	if (typeof self.nsfw === "boolean") return self.nsfw
	if (channel.isThread?.()) {
		const parent = (channel as ThreadChannel).parent as {
			nsfw?: unknown
		} | null
		if (parent && typeof parent.nsfw === "boolean") return parent.nsfw
	}
	return undefined
}

export function getMessageLocation(message: Message): MessageLocation {
	const channel = message.channel as TextChannel | ThreadChannel
	const safetyChannel = channel as TextChannel & {
		nsfw?: boolean
		nsfwLevel?: string | null
	}
	const topic = resolveTopic(channel)
	const nsfw = resolveNsfw(channel)
	if (!channel.isThread?.()) {
		return {
			channelId: message.channelId,
			threadId: null,
			threadName: null,
			channelName: "name" in channel ? channel.name : null,
			topic,
			nsfw,
			nsfwLevel:
				typeof safetyChannel.nsfwLevel === "string"
					? safetyChannel.nsfwLevel
					: null,
			ageRestricted: nsfw,
		}
	}

	return {
		channelId: channel.parentId ?? message.channelId,
		threadId: channel.id,
		threadName: channel.name,
		channelName: channel.parent?.name ?? null,
		topic,
		nsfw,
		nsfwLevel:
			typeof safetyChannel.nsfwLevel === "string"
				? safetyChannel.nsfwLevel
				: null,
		ageRestricted: nsfw,
	}
}

export function getStickerMetadata(
	message: Message,
): RichMessageMetadata["stickers"] {
	return Array.from(message.stickers.values()).map((sticker) => ({
		id: sticker.id,
		name: sticker.name,
		url: sticker.url,
		format: sticker.format ?? null,
		// A sticker's name alone is weak evidence; the description a human wrote
		// for it is usually the actual joke, and it was being thrown away.
		description: sticker.description ?? null,
		packId: sticker.packId ?? null,
		type: sticker.type ?? null,
		tags: sticker.tags ?? null,
	}))
}

/**
 * Extract custom emoji references from message content.
 * Builds Discord CDN URLs for each emoji so they can be downloaded
 * and sent to the vision model for analysis.
 */
export function getCustomEmojiMetadata(
	message: Message,
): RichMessageMetadata["customEmojis"] {
	const CUSTOM_EMOJI_PATTERN = /<(a)?:([a-zA-Z0-9_]+):(\d+)>/g
	const emojis: CustomEmojiEvidence[] = []
	const matches = [...message.content.matchAll(CUSTOM_EMOJI_PATTERN)]
	for (const match of matches) {
		const [, animated, name, id] = match
		const ext = animated ? "gif" : "png"
		emojis.push({
			id,
			name,
			animated: animated === "a",
			url: `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128`,
			// The custom-emoji collection is populated from the guild cache, so
			// presence here means "uploaded to this server".
			guildId: message.guildId ?? null,
		})
	}
	return emojis
}

export function getAttachmentMetadata(
	message: Message,
): RichMessageMetadata["attachments"] {
	return Array.from(message.attachments.values()).map((attachment) => ({
		id: attachment.id,
		name: attachment.name || "unknown",
		url: attachment.url,
		contentType: attachment.contentType ?? null,
		size: attachment.size,
		// Everything below is already on the object discord.js parsed; it was
		// simply never read. Dimensions decide whether the vision model can see
		// the image at all, and the description is frequently the only text.
		width: attachment.width ?? null,
		height: attachment.height ?? null,
		duration: attachment.duration ?? null,
		description: attachment.description ?? null,
		spoiler: Boolean(attachment.spoiler),
		flags: attachment.flags
			? (Object.keys(attachment.flags.toJSON?.() ?? {}) as string[])
			: undefined,
	}))
}

export function getEmbedMetadata(
	message: Message,
): RichMessageMetadata["embeds"] {
	return message.embeds.map((embed) => ({
		title: embed.title ?? null,
		description: embed.description ?? null,
		url: embed.url ?? null,
		color: embed.color ?? null,
		image: embed.image?.url ?? null,
		thumbnail: embed.thumbnail?.url ?? null,
		author: embed.author
			? {
					name: embed.author.name ?? null,
					url: embed.author.url ?? null,
					iconURL: embed.author.iconURL ?? null,
				}
			: null,
		footer: embed.footer
			? {
					text: embed.footer.text ?? null,
					iconURL: embed.footer.iconURL ?? null,
				}
			: null,
		fields: embed.fields.map((field) => ({
			name: field.name,
			value: field.value,
			inline: Boolean(field.inline),
		})),
		type: embed.type ?? null,
		timestamp: embed.timestamp ?? null,
		video: embed.video
			? {
					url: embed.video.url ?? null,
					width: embed.video.width ?? null,
					height: embed.video.height ?? null,
				}
			: null,
		provider: embed.provider
			? { name: embed.provider.name ?? null, url: embed.provider.url ?? null }
			: null,
	}))
}

type ReferencedMessageContent = {
	content: string
	username: string
	userId: string
	attachments: AttachmentEvidence[]
	authorIsBot: boolean
}

/** Normalise one raw discord.js attachment into the stored evidence shape. */
function toAttachmentEvidence(raw: unknown): AttachmentEvidence {
	const a = raw as {
		id: string
		name: string | null
		url: string
		contentType: string | null
		size: number
		width?: number | null
		height?: number | null
	}
	return {
		id: a.id,
		name: a.name || "unknown",
		url: a.url,
		contentType: a.contentType ?? null,
		size: a.size,
		width: a.width ?? null,
		height: a.height ?? null,
	}
}

/**
 * A cached reply target and a forward snapshot expose the same fields
 * (`content`, `author`, attachments), so both are reduced to one shape here.
 * The attachments are passed in already iterated because the two sources
 * reach them differently — and differ on whether a missing collection is an
 * error (cache) or just empty (snapshot).
 */
function toReferencedMessage(
	source: {
		content?: string | null
		author?: { username?: string; id?: string; bot?: boolean } | null
	},
	attachments: Iterable<unknown>,
): ReferencedMessageContent {
	return {
		content: source.content ?? "",
		username: source.author?.username ?? "Unknown",
		userId: source.author?.id ?? "",
		attachments: Array.from(attachments).map(toAttachmentEvidence),
		authorIsBot: Boolean(source.author?.bot),
	}
}

/**
 * Try to get referenced message content from the channel cache or message snapshots.
 * For replies, Discord sends `referenced_message` in the API, which
 * discord.js-selfbot-v13 caches in the channel's message manager.
 * For forwards, Discord sends `message_snapshots` which discord.js-selfbot-v13
 * stores in `message.messageSnapshots` as a Collection of partial Message objects.
 * Returns null if the message can't be resolved from either source.
 */
function getReferencedMessageContent(
	message: Message,
): ReferencedMessageContent | null {
	const ref = message.reference
	if (!ref?.messageId) return null

	// 1. Channel cache — works for same-channel replies/forwards
	try {
		const cached = (message.channel as any)?.messages?.cache?.get(ref.messageId)
		if (cached) {
			return toReferencedMessage(
				cached,
				(cached.attachments as { values: () => Iterable<unknown> }).values(),
			)
		}
	} catch {
		// Cache may not be available or message not in it
	}

	// 2. messageSnapshots — works for cross-channel/cross-server forwards
	//    Discord API sends message_snapshots for FORWARD type messages,
	//    and discord.js-selfbot-v13 stores them in message.messageSnapshots.
	try {
		const snapshot = message.messageSnapshots?.get(ref.messageId)
		if (snapshot) {
			return toReferencedMessage(
				snapshot as any,
				(
					snapshot as { attachments?: { values: () => Iterable<unknown> } }
				).attachments?.values() ?? [],
			)
		}
	} catch {
		// Snapshots may not be available
	}

	return null
}

/**
 * Decode a MessageFlags bitfield into names.
 *
 * The numeric value is stored as well, so a flag Discord adds later is
 * preserved in the metadata even though this list predates it. Without the
 * names the raw bitfield is unreadable in a prompt.
 */
export function decodeMessageFlags(flags: unknown): {
	raw: number
	names: string[]
} {
	const raw = typeof flags === "number" ? flags : 0
	const names: string[] = []
	if (raw === 0) return { raw, names }

	const KNOWN: Array<[number, string]> = [
		[1 << 0, "CROSSPOSTED"],
		[1 << 1, "IS_CROSSPOST"],
		[1 << 2, "SUPPRESS_EMBEDS"],
		[1 << 3, "SOURCE_MESSAGE_DELETED"],
		[1 << 4, "URGENT"],
		[1 << 5, "HAS_THREAD"],
		[1 << 6, "EPHEMERAL"],
		[1 << 7, "LOADING"],
		[1 << 8, "FAILED_TO_MENTION_SOME_ROLES_IN_THREAD"],
		[1 << 9, "SUPPRESS_NOTIFICATIONS"],
		[1 << 12, "IS_VOICE_MESSAGE"],
		[1 << 13, "HAS_SNAPSHOT"],
		[1 << 14, "IS_COMPONENTS_V2"],
		[1 << 15, "IS_FORWARD"],
	]
	for (const [bit, name] of KNOWN) {
		if (raw & bit) names.push(name)
	}
	return { raw, names }
}

/**
 * Read a member's effective permissions as plain names.
 *
 * Guild-wide permissions, not per-channel: it is the cheapest available
 * signal for "is this person a moderator", which decides whether a message is
 * an escalation or a routine one. `toArray()` throws on unknown bits on
 * older discord.js, so it is guarded — a throw here would drop the whole
 * message.
 */
export function getMemberPermissionNames(
	permissions: { toArray?: () => string[] } | null | undefined,
): string[] {
	if (!permissions || typeof permissions.toArray !== "function") return []
	try {
		const list = permissions.toArray()
		return Array.isArray(list) ? list.filter((p) => typeof p === "string") : []
	} catch {
		return []
	}
}

export function getMessageMetadata(message: Message): RichMessageMetadata {
	const member = message.member
	const referenceContent = getReferencedMessageContent(message)
	const ref = message.reference
	const flagInfo = decodeMessageFlags(message.flags?.bitfield ?? 0)

	return {
		stickers: getStickerMetadata(message),
		embeds: getEmbedMetadata(message),
		attachments: getAttachmentMetadata(message),
		customEmojis: getCustomEmojiMetadata(message),
		mentionedRoles: Array.from(message.mentions?.roles?.values() ?? []).map(
			(role) => ({
				id: role.id,
				name: role.name,
				position: role.position ?? null,
				isEveryone: role.id === message.guildId,
			}),
		),
		mentionedUsers: Array.from(message.mentions?.users?.values() ?? []).map(
			(user) => ({
				id: user.id,
				username: user.username,
				bot: Boolean(user.bot),
				displayName: (user as { displayName?: string }).displayName ?? null,
				globalName: (user as { globalName?: string | null }).globalName ?? null,
			}),
		),
		mentionedChannels: Array.from(
			message.mentions?.channels?.values() ?? [],
		).map((channel) => ({
			id: channel.id,
			name:
				"name" in channel
					? ((channel as { name?: string }).name ?? null)
					: null,
			type: (channel as { type?: string }).type ?? null,
		})),
		author: {
			id: message.author.id,
			username: message.author.username,
			tag: "tag" in message.author ? message.author.tag : null,
			avatarURL: message.author.avatarURL() ?? null,
			bot: Boolean(message.author.bot),
			displayName: message.author.displayName ?? null,
			globalName: message.author.globalName ?? null,
			// Bitfield, not the resolved object: UserFlags resolves lazily and can
			// be null on a partial user, and the raw value always survives.
			flags: message.author.flags?.bitfield ?? null,
			accountCreatedTimestamp: message.author.createdTimestamp ?? null,
			system: Boolean((message.author as { system?: boolean }).system),
		},
		member: member
			? {
					displayName: member.displayName ?? null,
					roles: member.roles.cache.map((role) => ({
						id: role.id,
						name: role.name,
						// Role position is what turns a verdict into a decision: the same
						// word from an admin and from a drive-by are not the same event.
						position: role.position,
						isEveryone: role.id === member.guild?.id,
						color: role.color ?? null,
						hoist: Boolean(role.hoist),
						managed: Boolean(role.managed),
						mentionable: Boolean(role.mentionable),
					})),
					joinedTimestamp: member.joinedTimestamp ?? null,
					nickname: member.nickname ?? null,
					permissions: getMemberPermissionNames(member.permissions),
					communicationDisabledUntil:
						member.communicationDisabledUntilTimestamp ?? null,
					premiumSince: member.premiumSinceTimestamp ?? null,
					pending: Boolean(member.pending),
				}
			: null,
		channel: getMessageLocation(message),
		reference: ref
			? {
					messageId: ref.messageId ?? null,
					channelId: ref.channelId ?? null,
					guildId: ref.guildId ?? null,
					type: (ref.type as unknown as string | undefined) ?? null,
					content: referenceContent?.content ?? null,
					repliedUsername: referenceContent?.username ?? null,
					repliedUserId: referenceContent?.userId || null,
					attachments: referenceContent?.attachments ?? [],
					authorId: referenceContent?.userId || null,
					authorIsBot: referenceContent?.authorIsBot ?? null,
				}
			: null,
		isCrosspost: message.flags?.has(1 << 1) ?? false,
		// @everyone / @here, which the old metadata could not express at all:
		// `mentions.roles` never contains it, so a mass ping looked like a
		// message with no role mentions.
		mentionsEveryone: Boolean(message.mentions?.everyone),
		flags: flagInfo.raw,
		flagNames: flagInfo.names,
		webhookId: message.webhookId ?? null,
		applicationId: message.applicationId ?? null,
		pinned: Boolean(message.pinned),
		tts: Boolean(message.tts),
		system: Boolean(message.system),
		editedTimestamp: message.editedTimestamp ?? null,
		position: message.position ?? null,
		hasThread: Boolean(message.hasThread),
		poll: getPollMetadata(message),
		// `components` is a plain array on a full message but absent on a partial
		// one. Array.isArray() collapsed both cases to 0; read the length
		// defensively so a real component row is never reported as "none".
		componentCount: Array.isArray(message.components)
			? message.components.length
			: ((message as { components?: { length?: number } }).components?.length ??
				0),
	}
}

/**
 * Poll metadata, or null.
 *
 * A poll is often the whole message: "who wants to bet $500" is four words and
 * a poll, and without this the moderator saw an empty body.
 */
function getPollMetadata(message: Message): PollEvidence | null {
	const poll = message.poll
	if (!poll) return null
	try {
		return {
			question: poll.question?.text ?? null,
			allowMultiselect: Boolean(poll.allowMultiselect),
			durationHours: Number.isFinite(poll.expiresTimestamp)
				? Math.max(
						0,
						Math.round((poll.expiresTimestamp - Date.now() / 1000) / 3600),
					)
				: null,
			answers: Array.from(poll.answers.values()).map((answer) => {
				// `answer.emoji` is an Emoji object, not a string. JSON.stringify of
				// that is a whole object graph in the metadata column, so flatten it
				// to the token a human would read.
				const emoji = answer.emoji as {
					name?: string | null
					id?: string | null
					animated?: boolean
				} | null
				return {
					id: answer.id,
					text: answer.text ?? null,
					// PollAnswer exposes the media through the parent poll's question
					// shape; the durable per-answer signal is the text.
					pollMediaType: answer.text != null ? "TEXT" : "EMOJI",
					emoji: emoji
						? emoji.id
							? `<${emoji.animated ? "a" : ""}:${emoji.name ?? "_"}:${emoji.id}>`
							: (emoji.name ?? null)
						: null,
				}
			}),
		}
	} catch {
		// A partially-populated poll must not cost us the whole metadata object.
		return null
	}
}

export function parseRichMessageMetadata(
	metadata: string | null | undefined,
): RichMessageMetadata | null {
	if (!metadata) return null

	try {
		const parsed = JSON.parse(metadata) as Partial<RichMessageMetadata>
		return {
			stickers: Array.isArray(parsed.stickers) ? parsed.stickers : [],
			embeds: Array.isArray(parsed.embeds) ? parsed.embeds : [],
			attachments: Array.isArray(parsed.attachments) ? parsed.attachments : [],
			customEmojis: Array.isArray(parsed.customEmojis)
				? parsed.customEmojis
				: [],
			mentionedRoles: Array.isArray(parsed.mentionedRoles)
				? parsed.mentionedRoles
				: [],
			mentionedUsers: Array.isArray(parsed.mentionedUsers)
				? parsed.mentionedUsers
				: [],
			// Optional keys pass through only when present, so a row captured
			// before these fields existed still parses — and still round-trips
			// without inventing values it never had.
			mentionedChannels: Array.isArray(parsed.mentionedChannels)
				? parsed.mentionedChannels
				: [],
			author: parsed.author as RichMessageMetadata["author"],
			member: (parsed.member ?? null) as RichMessageMetadata["member"],
			channel: parsed.channel as RichMessageMetadata["channel"],
			reference: (parsed.reference ?? null) as RichMessageMetadata["reference"],
			isCrosspost: Boolean(parsed.isCrosspost),
			...(typeof parsed.mentionsEveryone === "boolean"
				? { mentionsEveryone: parsed.mentionsEveryone }
				: {}),
			...(typeof parsed.flags === "number" ? { flags: parsed.flags } : {}),
			...(Array.isArray(parsed.flagNames)
				? { flagNames: parsed.flagNames }
				: {}),
			...(parsed.webhookId !== undefined
				? { webhookId: parsed.webhookId }
				: {}),
			...(parsed.applicationId !== undefined
				? { applicationId: parsed.applicationId }
				: {}),
			...(typeof parsed.pinned === "boolean" ? { pinned: parsed.pinned } : {}),
			...(typeof parsed.tts === "boolean" ? { tts: parsed.tts } : {}),
			...(typeof parsed.system === "boolean" ? { system: parsed.system } : {}),
			...(parsed.editedTimestamp !== undefined
				? { editedTimestamp: parsed.editedTimestamp }
				: {}),
			...(parsed.position !== undefined ? { position: parsed.position } : {}),
			...(typeof parsed.hasThread === "boolean"
				? { hasThread: parsed.hasThread }
				: {}),
			...(parsed.poll !== undefined ? { poll: parsed.poll } : {}),
			...(typeof parsed.componentCount === "number"
				? { componentCount: parsed.componentCount }
				: {}),
		}
	} catch {
		return null
	}
}

/**
 * Attachments recorded on a stored row, for comparing a live message against
 * its persisted copy. Returns [] for a row captured before attachments were
 * recorded, so the caller sees "no attachments" rather than throwing.
 */
export function getAttachmentsFromMetadata(
	metadata: string | null | undefined,
): AttachmentEvidence[] {
	return parseRichMessageMetadata(metadata)?.attachments ?? []
}

export function extractMessageMediaEvidence(
	metadata: string | null | undefined,
): MessageMediaEvidence {
	const parsed = parseRichMessageMetadata(metadata)
	return {
		stickers: parsed?.stickers ?? [],
		embeds: parsed?.embeds ?? [],
		attachments: parsed?.attachments ?? [],
		customEmojis: parsed?.customEmojis ?? [],
	}
}

// ─── Prompt-safe escaping ─────────────────────────────────────────────────────
//
// These live here, not in the moderation worker, because this module is the
// one that turns a captured message into prompt text. The worker re-exports
// them so existing importers keep working.

/**
 * Escape a value for use inside an XML attribute.
 *
 * Author names are user-controlled, so they must be escaped — but not wrapped
 * in CDATA, which is only valid for element bodies and corrupts attributes.
 */
export function escapeXmlAttr(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&apos;")
}

/**
 * Escape a message body for inclusion in the prompt.
 *
 * A CDATA wrapper would be the wrong tool here: message content is
 * attacker-controlled and routinely contains the literal sequence `]]>`, which
 * closes a CDATA section early and lets the rest of the message escape into
 * the prompt as markup. Plain entity-escaping has no such terminator, so the
 * model always sees the text as text.
 */
export function escapeMessageBody(value: string, maxLen = 3000): string {
	const capped =
		value.length > maxLen ? `${value.slice(0, maxLen)}…[truncated]` : value
	return capped
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
}

// ─── Link ↔ embed pairing ─────────────────────────────────────────────────────

/** Every `http(s)` URL in the text, in order, de-duplicated. */
export function extractPostedUrls(
	content: string | null | undefined,
): string[] {
	if (!content) return []
	const found = content.match(/https?:\/\/[^\s<>")\]]+/g) ?? []
	return [...new Set(found.map((u) => u.replace(/[.,;:!?]+$/, "")))]
}

/**
 * Comparable form of a URL: no scheme, no `www.`, no trailing slash.
 *
 * Discord wraps every posted link in `t.co`, so the URL in the body is almost
 * never the URL the embed resolved to — a raw string comparison pairs
 * nothing, which is why this normalisation exists.
 */
function normalizeUrl(url: string): string {
	return url
		.trim()
		.toLowerCase()
		.replace(/^https?:\/\//, "")
		.replace(/^www\./, "")
		.replace(/\/+$/, "")
}

export interface LinkEmbedPair {
	/** The URL the author actually wrote, as it appears in the message. */
	postedUrl: string
	/** The destination the link resolved to, when known. */
	resolvedUrl: string | null
	/** The embed Discord produced for it — the actual content. */
	embed: EmbedEvidence | null
}

/**
 * Pair each posted link with the embed that resolved it.
 *
 * The moderator must judge the link and its preview as ONE message, and it
 * cannot do that from the two separately: the body carries a `t.co` wrapper
 * and no information, and everything the user actually saw is in the embed.
 *
 * Pairing is best-effort in three steps, because the embed URL is not always
 * the posted URL:
 *   1. exact match on the URL,
 *   2. match on the normalised form (scheme / `www.` / trailing slash),
 *   3. links and embeds matched positionally, in order — the common case,
 *      because the body holds a `t.co` wrapper that matches nothing.
 */
export function pairLinksWithEmbeds(
	content: string | null | undefined,
	metadata: string | null | undefined,
): LinkEmbedPair[] {
	const posted = extractPostedUrls(content)
	const embeds = parseRichMessageMetadata(metadata)?.embeds ?? []

	// An embed with no matching link in the body is still evidence. A bot that
	// posts rich media (image + reactions + caption) sends a message whose
	// `content` is empty and whose only link lives in `embed.url`, so pairing
	// strictly on posted URLs dropped every such message on the floor — which is
	// what produced "empty message with no content" for a message that plainly
	// had a picture on it.
	if (posted.length === 0) {
		return embeds.map((embed) => ({
			postedUrl: "",
			resolvedUrl: embed.url ?? null,
			embed,
		}))
	}

	const pairs: LinkEmbedPair[] = posted.map((postedUrl) => {
		const normalized = normalizeUrl(postedUrl)
		const match = embeds.find(
			(e) =>
				e.url != null &&
				(e.url === postedUrl || normalizeUrl(e.url) === normalized),
		)
		return { postedUrl, resolvedUrl: null, embed: match ?? null }
	})

	// A URL match still leaves `resolvedUrl` unset: the posted URL is often a
	// t.co wrapper, so the destination is the embed's own `url`.
	for (const pair of pairs) {
		if (pair.embed) pair.resolvedUrl = pair.embed.url ?? null
	}

	const spare = embeds.filter((e) => !pairs.some((p) => p.embed === e))
	let next = 0
	for (const pair of pairs) {
		if (pair.embed) continue
		const leftover = spare[next]
		if (!leftover) break
		pair.embed = leftover
		pair.resolvedUrl = leftover.url ?? null
		next += 1
	}
	return pairs
}

/**
 * True when the message says nothing of its own — the body is only links.
 *
 * The judgement that matters is a bare link post: the body carries no words to
 * weigh, so a verdict on it rests entirely on the linked content. That makes
 * it the shape where a model guessing from the domain does the most damage,
 * and it is why the auto-delete gate treats it specially.
 */
export function isLinkOnlyPost(
	content: string | null | undefined,
	metadata: string | null | undefined,
): boolean {
	const urls = extractPostedUrls(content)
	if (urls.length === 0) return false
	const residue = (content ?? "")
		.replace(/https?:\/\/[^\s<>")\]]+/g, " ")
		.replace(/<a?:\w+:\d+>/g, " ")
		.trim()
	if (residue.length > 0) return false
	// A link post that also carries its own media is not a bare link: there is
	// something else for the model to weigh.
	const media = parseRichMessageMetadata(metadata)
	if ((media?.attachments?.length ?? 0) > 0) return false
	if ((media?.stickers?.length ?? 0) > 0) return false
	return true
}

/** The embed body as prompt elements, escaped. */
function renderEmbedBody(embed: EmbedEvidence): string {
	const rows: string[] = []
	const add = (tag: string, value: string, max: number): void => {
		rows.push(`  <${tag}>${escapeMessageBody(value, max)}</${tag}>`)
	}
	if (embed.provider?.name) add("site", embed.provider.name, 200)
	if (embed.title) add("title", embed.title, 400)
	if (embed.description) add("description", embed.description, 1500)
	for (const field of embed.fields.slice(0, 12)) {
		const name = String(field.name ?? "").slice(0, 120)
		rows.push(
			`  <field name="${escapeXmlAttr(name)}">` +
				`${escapeMessageBody(String(field.value ?? ""), 500)}</field>`,
		)
	}
	if (embed.footer?.text) add("footer", embed.footer.text, 200)
	// The image URL matters: a link whose preview is a picture carries all of
	// its content in the picture, not in the text fields.
	if (embed.image) add("image", embed.image, 600)
	// A gifv preview has NO `image` — Discord puts the still in `thumbnail`
	// and the animation in `video`. Rendering only `image` therefore dropped
	// the picture from every GIF link (Klipy/Tenor/Giphy), leaving the model a
	// bare title and an mp4 URL it cannot watch.
	if (embed.thumbnail) add("thumbnail", embed.thumbnail, 600)
	// The type separates a plain link preview from a GIF/animation, which is
	// the difference between "someone shared a page" and "someone shared a
	// clip" — the policy's animation rules key off it.
	if (embed.type) add("type", embed.type, 40)
	if (embed.video?.url) add("video", embed.video.url, 600)
	if (rows.length === 0) {
		return "  <preview>(embed ada tapi tidak ada field yang bisa dibaca)</preview>"
	}
	return rows.join("\n")
}

/**
 * The unified link block for the prompt.
 *
 * WHY THIS EXISTS
 * The moderation prompt interpolated only `message.content`, and the claim
 * query did not even select `metadata`. Everything the author actually posted
 * — the Facebook/Instagram title, description, image and site name that
 * Discord's link-preview bot resolved — was captured, stored, and then never
 * shown to the model. So it judged a bare `t.co` string and invented a verdict
 * from the domain alone, and an empty-bodied message (content `""` because
 * `getDisplayContent` ran before the embed resolved) came back as "empty
 * message with no content".
 *
 * WHAT IT CHANGES
 * One `<link>` element per posted link, carrying the posted URL, the resolved
 * destination and the embed body together, so the model can only judge the
 * combination. A link with no resolved embed says so explicitly, which is what
 * stops it guessing page content from a domain name.
 */
export function formatLinkEvidenceForPrompt(
	content: string | null | undefined,
	metadata: string | null | undefined,
): string {
	const pairs = pairLinksWithEmbeds(content, metadata)
	if (pairs.length === 0) return ""

	const parts = pairs.map((pair) => {
		const head =
			(pair.postedUrl ? ` posted="${escapeXmlAttr(pair.postedUrl)}"` : "") +
			(pair.resolvedUrl
				? ` resolved="${escapeXmlAttr(pair.resolvedUrl)}"`
				: ' resolved=""')
		const body = pair.embed
			? renderEmbedBody(pair.embed)
			: "  <preview>(tidak ada: Discord tidak membuat pratinjau untuk link ini)</preview>"
		return `<link${head}>\n${body}\n </link>`
	})

	return `\n<link_evidence>\n${parts.join("\n")}\n</link_evidence>`
}

// ─── Channel purpose ──────────────────────────────────────────────────────────

/** Longest channel topic rendered into the prompt. */
const MAX_TOPIC_CHARS = 300

/**
 * The channel's own name, topic and thread name, as `<message>` attributes.
 *
 * WHY THIS EXISTS
 * The model is asked to judge whether a message suits the channel it was
 * posted in, and until now the prompt never said what that channel IS. It saw
 * `<message id=… author=… ts=…>` and nothing else, so "is this on topic here?"
 * was answered by guessing from the channel's name — or, when even the name was
 * absent, from nothing at all.
 *
 * `getMessageLocation` captures `channelName`, `topic` and `threadName` with
 * every single message, so the answer was in `messages.metadata` the whole
 * time, stored and never rendered. The concrete damage: a Discord invite posted
 * in the channel whose topic is "share external communities" came back flagged
 * as spam for "promotion without permission, unrelated to the channel's topic"
 * — a verdict about a channel the model had never been shown, and the message
 * was auto-deleted on it.
 *
 * Attributes rather than a sibling block, deliberately: a `<message>`-shaped
 * element would invite the model to return a verdict for it, and the topic is
 * admin-written free text, so it must not sit where a `message_id` is expected.
 * Reuse `parseRichMessageMetadata` rather than reading `metadata` directly: a
 * row captured before this change carries no `channel` key at all, so the
 * lookup has to degrade to an empty string and leave the prompt exactly as it
 * was.
 */
export function formatChannelContextForPrompt(
	metadata: string | null | undefined,
): string {
	const channel = parseRichMessageMetadata(metadata)?.channel
	if (!channel) return ""

	const attr = (name: string, value: string | null | undefined): string =>
		value?.trim()
			? ` ${name}="${escapeXmlAttr(value.trim().slice(0, MAX_TOPIC_CHARS))}"`
			: ""

	return (
		attr("channel", channel.channelName) +
		attr("topic", channel.topic) +
		attr("thread", channel.threadName)
	)
}

// ─── Author identity ─────────────────────────────────────────────────────────

/**
 * A message author's names, as captured in `messages.metadata`.
 *
 * Every field is optional because the metadata column is nullable and older
 * rows predate some of these keys. `userId` is always known — it is the claim
 * query's own column, not something read out of the blob.
 */
export type PromptAuthor = {
	/** Snowflake. Kept for exact identification when no name was captured. */
	userId: string
	/** Discord's login name, unique account-wide — "budi_dev". */
	username: string | null
	/** The user's chosen display name — "Budi S." */
	globalName: string | null
	/** Per-guild display name, i.e. the nickname when one is set. */
	serverName: string | null
	/** Discord's legacy discriminator, when the account still has one. */
	tag: string | null
}

/**
 * Flatten the captured metadata blob into the author names the prompt uses.
 *
 * `username` is the account-wide name and `member.nickname` the server-scoped
 * one, and both matter: the prompt's `author` attribute has to carry every name
 * a message could be referred to by, or a moderator reading "Zul" cannot tie it
 * to `zulfik_dev`. Kept separate from the formatters below so the mapping is
 * testable on its own. A missing block yields nulls rather than an invented
 * name — an author called "Budi" when the capture held only an id is worse than
 * one that admits it knows the id.
 */
export function extractPromptAuthor(
	authorId: string,
	metadata: string | null | undefined,
): PromptAuthor {
	const empty: PromptAuthor = {
		userId: authorId,
		username: null,
		globalName: null,
		serverName: null,
		tag: null,
	}
	if (!metadata) return empty

	let parsed: unknown
	try {
		parsed = JSON.parse(metadata)
	} catch {
		return empty
	}
	if (typeof parsed !== "object" || parsed === null) return empty

	const root = parsed as {
		author?: Record<string, unknown>
		member?: Record<string, unknown> | null
	}
	const a = root.author ?? {}
	const m = root.member ?? {}
	const str = (v: unknown): string | null =>
		typeof v === "string" && v.trim().length > 0 ? v.trim() : null

	// `member.displayName` IS the nickname on a guild message, so it is the
	// server-scoped name. `author.globalName` is the account-wide display name,
	// which is what this library populates on the author object.
	return {
		userId: authorId,
		username: str(a.username),
		globalName: str(a.globalName),
		serverName: str(m.nickname) ?? str(m.displayName),
		tag: str(a.tag),
	}
}

/**
 * Render an author for the `<message author="…">` attribute.
 *
 * Carries every name the capture knows, deduplicated, because that string is
 * the only thing tying the message in front of the model to a human being. The
 * snowflake always closes it, so an id-only author is still distinguishable and
 * never renders as an empty attribute.
 *
 * Escaped for an XML attribute — display names are user-controlled.
 */
export function formatAuthorForPrompt(author: PromptAuthor): string {
	const parts = [author.username, author.globalName, author.serverName].filter(
		(n): n is string => Boolean(n?.trim()),
	)
	parts.push(author.userId)
	return escapeXmlAttr([...new Set(parts)].join(" | "))
}

/**
 * True when the sender set `SUPPRESS_EMBEDS` on the message.
 *
 * Discord omits the embed array entirely for such a message, so there is
 * nothing to read and nothing that will ever arrive later — a `messageUpdate`
 * does not bring it back. It is NOT a capture failure: the same gateway
 * captures embeds from other bots at 100% (Jockie Music 129/129), so the
 * difference is this flag on the sender's side.
 *
 * The verdict for such a message has to be "cannot judge", not "empty" and
 * never a delete. Judging from nothing is what deleted the Facebook shares.
 */
export function hasSuppressedEmbeds(
	metadata: string | null | undefined,
): boolean {
	const parsed = parseRichMessageMetadata(metadata)
	if (!parsed) return false
	const flags = (parsed as { flagNames?: unknown }).flagNames
	if (Array.isArray(flags)) {
		return flags.some(
			(f) => typeof f === "string" && f.toUpperCase() === "SUPPRESS_EMBEDS",
		)
	}
	return false
}

export function getDisplayContent(message: Message): string {
	if (message.content.trim().length > 0) return message.content

	const stickers = getStickerMetadata(message)
	if (stickers.length > 0) {
		return stickers.map((sticker) => `[Sticker: ${sticker.name}]`).join(" ")
	}

	const attachments = getAttachmentMetadata(message)
	if (attachments.length > 0) {
		return attachments
			.map((attachment) => `[Attachment: ${attachment.name}]`)
			.join(" ")
	}

	const embeds = getEmbedMetadata(message)
	if (embeds.length > 0) {
		return embeds
			.map((embed) => embed.title || embed.description || "[Embed]")
			.join(" ")
	}

	return ""
}
