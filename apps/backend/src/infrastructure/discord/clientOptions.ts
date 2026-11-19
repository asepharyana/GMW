import { type ClientOptions, Options } from "discord.js-selfbot-v13"

/**
 * Cache ceilings for the client.
 *
 * WHY THE EXPLICIT ENTRIES MATTER: `cacheWithLimits` returns an UNBOUNDED
 * `Collection` for any manager it has no setting for — it does not fall back to
 * a sane default. `Options.defaultMakeCacheSettings` lists only
 * MessageManager, ChannelManager, GuildChannelManager and ThreadManager, so
 * every other manager was previously unlimited.
 *
 * That is what killed the service. `GuildMemberManager` was one of the
 * unlimited ones: every member of every guild the account is in stayed cached
 * for the life of the process, each holding its roles, permission bitfield and
 * avatar URL, and member events kept adding to it. Live heap climbed to the V8
 * ceiling — 560MB, because Node sizes the heap from the unit's `MemoryMax=1G` —
 * and the process aborted with "Reached heap limit Allocation failed -
 * JavaScript heap out of memory", which systemd restarted into the same wall 12
 * times in 10 minutes.
 *
 * The limits below are sized for what this service actually does: it moderates
 * messages and needs the AUTHOR of a message (cached on demand and kept briefly
 * by `members.fetch`) plus the bot's own member. It does not need the whole
 * roster resident.
 */
export function createDiscordClientOptions(): ClientOptions {
	return {
		makeCache: Options.cacheWithLimits({
			...Options.defaultMakeCacheSettings,
			MessageManager: 25,
			ReactionManager: 0,
			ReactionUserManager: 0,
			// Presence events are captured and forwarded, never read back out of
			// the cache.
			PresenceManager: 0,
			// The leak. Bounded rather than removed: a message author's member
			// object is read on every moderation verdict, so a working set of
			// recently-seen members is worth keeping — just not the entire guild.
			GuildMemberManager: 500,
			// Users are created per member and per author; left unbounded they
			// duplicate what GuildMemberManager already retains.
			UserManager: 1000,
			// Voice state is captured from events and never read from cache.
			VoiceStateManager: 0,
			// Emoji/sticker objects are attached to every message that uses them,
			// so they are worth a working set but not an unbounded one.
			GuildEmojiManager: 200,
			GuildStickerManager: 200,
			// Thread members are captured from events, never read back.
			ThreadMemberManager: 0,
			// Invites and scheduled events are not read at all.
			GuildInviteManager: 0,
			GuildScheduledEventManager: 0,
			StageInstanceManager: 0,
		}),
		partials: ["USER", "CHANNEL", "GUILD_MEMBER", "MESSAGE"],
		sweepers: {
			messages: { interval: 300, lifetime: 600 },
			threads: { interval: 3600, lifetime: 14400 },
			// Members are the cache that actually grew without bound, so it gets
			// a sweep as well as a ceiling: `members.fetch` on an old author
			// re-populates the entry, so evicting it costs one REST call, not
			// correctness. The filter returns `true` because `maxSize` already
			// enforces the ceiling; the sweep exists to release entries nothing
			// has touched, which the library decides from its own lifetime.
			guildMembers: { interval: 3600, filter: () => () => true },
			users: { interval: 3600, filter: () => () => true },
		},
		restRequestTimeout: 15_000,
		retryLimit: 2,
		restGlobalRateLimit: 45,
	}
}
