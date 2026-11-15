import {
	and,
	count,
	countDistinct,
	desc,
	eq,
	gte,
	inArray,
	sql,
} from "drizzle-orm"
import { buildInsights } from "../../domain/dashboard/insights.js"
import { buildLeaderboards } from "../../domain/dashboard/leaderboards.js"
import {
	rawChannelName,
	readChannelName,
} from "../../domain/utils/channelName.js"
import { localDay, localHour } from "../../domain/utils/localTime.js"
import type { DatabaseHandle } from "../database/handle.js"
import {
	attachmentsTable,
	messageEditsTable,
	messagesTable,
	reactionsTable,
	userProfilesTable,
	verdictsTable,
} from "../database/schema.js"

export class DashboardRepository {
	constructor(private readonly db: DatabaseHandle) {}

	async getStats() {
		const oneDayAgo = Date.now() - 86400000

		// Total messages, with the moderation OUTCOME broken out from the joined
		// `verdicts` table and the PIPELINE position from messages.ai_status.
		//
		// These used to be `ai_status = 'flagged' / 'clean' / 'warn' / 'error' /
		// 'processing'`. Since the rewrite the worker only ever writes `analyzed`
		// to that column, so every one of those counters was permanently 0 and the
		// dashboard reported a clean, quiet guild regardless of what the model
		// actually decided.
		//
		// `flagged`/`warned` both count the actionable verdict (`deleted`), which is
		// the only non-pass outcome left now that the status enum is
		// clean|deleted|error. The two response keys are kept so the frontend
		// contract does not shift; they are the same number by construction.
		//
		// The old query was a single pass of `COUNT(*) FILTER (...)` over the
		// messages x verdicts join. Prisma has no FILTER, so the two dimensions are
		// counted separately: verdict statuses from `verdicts.groupBy` (one row per
		// message, since message_id is that table's primary key) and pipeline states
		// from `messages.groupBy`. An unanalysed message has no verdict row, so the
		// verdict groups sum to fewer rows than `total_messages` -- exactly as they
		// did under the LEFT JOIN.
		const [
			verdictGroups,
			pipelineGroups,
			totalMessages,
			allUsers,
			recent,
			recentFlagged,
			recentUsers,
		] = await Promise.all([
			this.db
				.select({ status: verdictsTable.status, n: count() })
				.from(verdictsTable)
				.groupBy(verdictsTable.status),
			this.db
				.select({ ai_status: messagesTable.ai_status, n: count() })
				.from(messagesTable)
				.groupBy(messagesTable.ai_status),
			this.db.select({ n: count() }).from(messagesTable),
			// `distinct: ["user_id"]` becomes COUNT(DISTINCT …): the same number,
			// one row instead of N.
			this.db
				.select({ n: countDistinct(messagesTable.user_id) })
				.from(messagesTable),
			this.db
				.select({ n: count() })
				.from(messagesTable)
				.where(gte(messagesTable.created_at, oneDayAgo)),
			// The nested `messages: {created_at: …}` filter becomes an EXISTS, so a
			// deleted verdict is counted once no matter how the join is written.
			this.db
				.select({ n: count() })
				.from(verdictsTable)
				.where(
					and(
						eq(verdictsTable.status, "deleted"),
						sql`EXISTS (SELECT 1 FROM ${messagesTable} m WHERE m.id = ${verdictsTable.message_id} AND m.created_at >= ${oneDayAgo})`,
					),
				),
			this.db
				.select({ n: countDistinct(messagesTable.user_id) })
				.from(messagesTable)
				.where(gte(messagesTable.created_at, oneDayAgo)),
		])

		const byVerdictStatus: Record<string, number> = {}
		for (const g of verdictGroups) {
			byVerdictStatus[String(g.status)] = g.n ?? 0
		}
		const byPipeline: Record<string, number> = {}
		for (const g of pipelineGroups) {
			byPipeline[String(g.ai_status)] = g.n ?? 0
		}

		const totalFlagged = byVerdictStatus.deleted ?? 0
		const totalClean = byVerdictStatus.clean ?? 0
		const totalError = byVerdictStatus.error ?? 0
		// Terminal: captured but deliberately never analysed, because the channel
		// is on the skip list. Never backlog, never a human's job.
		const totalSkipped = byPipeline.skipped ?? 0

		// AI user profiles. `total_voice_recordings` used to be counted here from
		// a second query against `voice_recordings` — a table with no writer
		// since the voice feature was removed, so the counter was structurally
		// pinned at 0 and the field was rendered nowhere.
		const profileCount = await this.db
			.select({ n: count() })
			.from(userProfilesTable)

		// Top channels by message count. The old WHERE was `metadata IS NOT NULL AND
		// metadata != ''`, and the GROUP BY keyed on the resolved channel name, so
		// rows with and without a name land in one bucket when they share a
		// channel_id.
		const topChannelRows = await this.db
			.select({
				channel_id: messagesTable.channel_id,
				metadata: messagesTable.metadata,
			})
			.from(messagesTable)
			.where(sql`${messagesTable.metadata} IS NOT NULL`)
		// The old SQL keyed the GROUP BY on (channel_id, raw `->>` channelName),
		// so a real name, an empty string, and a missing key are three groups for
		// one channel_id. Grouping on the same raw key keeps the counts identical;
		// only the DISPLAYED name applies the NULLIF/COALESCE fallback.
		const channelCounts = new Map<
			string,
			{ channel_id: string; rawName: string | undefined; count: number }
		>()
		for (const r of topChannelRows) {
			if (r.metadata === "") continue
			const rawName = rawChannelName(r.metadata)
			const key = `${r.channel_id}\u0000${rawName === undefined ? "\u0001" : rawName}`
			const entry = channelCounts.get(key) ?? {
				channel_id: r.channel_id,
				rawName,
				count: 0,
			}
			entry.count += 1
			channelCounts.set(key, entry)
		}
		const topChannels = [...channelCounts.values()]
			.map((v) => ({
				channel_id: v.channel_id,
				channel_name:
					v.rawName === undefined || v.rawName === ""
						? v.channel_id
						: v.rawName,
				message_count: v.count,
			}))
			.sort((a, b) => b.message_count - a.message_count)
			.slice(0, 10)

		return {
			total_messages: totalMessages[0]?.n ?? 0,
			total_users: allUsers[0]?.n ?? 0,
			total_flagged: totalFlagged,
			total_clean: totalClean,
			total_error: totalError,
			// Pipeline states, hoisted to the top level so the dashboard can show
			// them without digging into moderation_overview.
			total_pending: byPipeline.pending ?? 0,
			total_claimed: byPipeline.claimed ?? 0,
			total_retry_wait: byPipeline.retry_wait ?? 0,
			total_dead: byPipeline.dead ?? 0,
			total_skipped: totalSkipped,
			total_profiles: profileCount[0]?.n ?? 0,
			today_messages: recent[0]?.n ?? 0,
			today_flagged: recentFlagged[0]?.n ?? 0,
			active_users_24h: recentUsers[0]?.n ?? 0,
			top_channels: topChannels.map((c) => ({
				channel_id: c.channel_id,
				channel_name: c.channel_name ? c.channel_name : null,
				message_count: c.message_count,
			})),
			// Queue health, using the real pipeline vocabulary. `processing` was
			// aliased to total_processing — a column the rewrite renamed, so it
			// resolved to undefined and always rendered 0 — and the states that
			// actually exist now (claimed, retry_wait, dead) were never surfaced at
			// all. `dead` is the one that matters: it is the only state needing a
			// human.
			moderation_overview: {
				pending: byPipeline.pending ?? 0,
				claimed: byPipeline.claimed ?? 0,
				retry_wait: byPipeline.retry_wait ?? 0,
				dead: byPipeline.dead ?? 0,
				skipped: totalSkipped,
				error: totalError,
			},
		}
	}

	async getActivity(days: number) {
		const sinceMs = BigInt(Date.now() - days * 86400000)
		const dayAgoMs = BigInt(Date.now() - 86400000)

		// Daily buckets (last N days). "flagged" is the verdict, joined in.
		//
		// `to_char(to_timestamp(created_at / 1000), 'YYYY-MM-DD')` bucketed in the
		// DATABASE timezone, not UTC -- see `localDay`. The rows are aggregated here
		// rather than in SQL because Prisma has no date-bucket expression, and the
		// active-user count needs a DISTINCT per bucket that groupBy cannot express
		// across a computed key.
		const dailyRows = await this.db
			.select({
				created_at: messagesTable.created_at,
				user_id: messagesTable.user_id,
				verdict_status: verdictsTable.status,
			})
			.from(messagesTable)
			.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
			.where(gte(messagesTable.created_at, Number(sinceMs)))

		const dailyBuckets = new Map<
			string,
			{ messages: number; flagged: number; users: Set<string> }
		>()
		for (const r of dailyRows) {
			const day = localDay(r.created_at)
			const entry = dailyBuckets.get(day) ?? {
				messages: 0,
				flagged: 0,
				users: new Set<string>(),
			}
			entry.messages += 1
			if (r.verdict_status === "deleted") entry.flagged += 1
			entry.users.add(r.user_id)
			dailyBuckets.set(day, entry)
		}

		const daily = [...dailyBuckets.entries()]
			.map(([day, v]) => ({
				day,
				messages: v.messages,
				flagged: v.flagged,
				active_users: v.users.size,
			}))
			.sort((a, b) => a.day.localeCompare(b.day))

		// Hourly distribution (last 24h)
		const hourlyRows = await this.db
			.select({
				created_at: messagesTable.created_at,
				verdict_status: verdictsTable.status,
			})
			.from(messagesTable)
			.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
			.where(gte(messagesTable.created_at, Number(dayAgoMs)))
		const hourlyBuckets = new Map<
			number,
			{ messages: number; flagged: number }
		>()
		for (const r of hourlyRows) {
			const hour = localHour(r.created_at)
			const entry = hourlyBuckets.get(hour) ?? { messages: 0, flagged: 0 }
			entry.messages += 1
			if (r.verdict_status === "deleted") entry.flagged += 1
			hourlyBuckets.set(hour, entry)
		}

		const hourly = [...hourlyBuckets.entries()]
			.map(([hour, v]) => ({ hour, ...v }))
			.sort((a, b) => a.hour - b.hour)

		return {
			days,
			daily,
			hourly,
		}
	}

	/**
	 * Leaderboards: who the model deletes, who posts most, which channels carry
	 * it.
	 *
	 * One flat scan of messages LEFT JOIN verdicts, reduced in `domain/`. The
	 * obvious alternative — a GROUP BY per ranking — cannot resolve a channel
	 * name, because the name lives inside `messages.metadata` and the fallback
	 * rule belongs to `readChannelName`. Grouping on (channel_id, raw name) to
	 * work around that would split one channel into two rows: the split that
	 * `getStats().top_channels` reproduces on purpose (it mirrors the old GROUP
	 * BY key exactly) and that a leaderboard must not inherit.
	 *
	 * `ORDER BY created_at DESC` is part of the contract, not decoration. The
	 * reduction keeps the newest name per member and per channel using a strict
	 * `>`, so equal timestamps resolve to whichever row came back first — and
	 * newest-first is what makes that the current name.
	 */
	async getLeaderboards(limit: number) {
		const rows = await this.db
			.select({
				user_id: messagesTable.user_id,
				username: messagesTable.username,
				channel_id: messagesTable.channel_id,
				metadata: messagesTable.metadata,
				created_at: messagesTable.created_at,
				verdict_status: verdictsTable.status,
			})
			.from(messagesTable)
			.leftJoin(verdictsTable, eq(verdictsTable.message_id, messagesTable.id))
			.orderBy(desc(messagesTable.created_at))

		return buildLeaderboards(rows, limit)
	}

	async getTopReactions(limit: number) {
		const cap = Math.min(Math.max(limit || 20, 1), 50)

		// Top messages by net reactions (adds minus removes), joined to message
		// content. `message_reactions.message_id` has no foreign key to messages,
		// so reactions are grouped on their own and the messages are fetched
		// afterwards by id.
		const reactionRows = await this.db
			.select({
				message_id: reactionsTable.message_id,
				reaction_type: reactionsTable.reaction_type,
			})
			.from(reactionsTable)
		const netByMessage = new Map<string, number>()
		for (const r of reactionRows) {
			netByMessage.set(
				r.message_id,
				(netByMessage.get(r.message_id) ?? 0) +
					(r.reaction_type === "add"
						? 1
						: r.reaction_type === "remove"
							? -1
							: 0),
			)
		}

		const ranked = [...netByMessage.entries()]
			.filter(([, net]) => net > 0)
			.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
			.slice(0, cap)
		if (ranked.length === 0) return []

		const ids = ranked.map(([id]) => id)
		const messages = await this.db
			.select({
				id: messagesTable.id,
				content: messagesTable.content,
				username: messagesTable.username,
				channel_id: messagesTable.channel_id,
				created_at: messagesTable.created_at,
				metadata: messagesTable.metadata,
			})
			.from(messagesTable)
			.where(inArray(messagesTable.id, ids))
		const messageById = new Map(messages.map((m) => [m.id, m]))

		// The old query was an INNER JOIN on messages, so reactions pointing at a
		// message row that no longer exists were dropped, not rendered blank.
		const live = ranked.filter(([id]) => messageById.has(id))
		const liveIds = live.map(([id]) => id)

		// Top emoji per message (adds only) for the breakdown
		const emojiRows = await this.db
			.select({
				message_id: reactionsTable.message_id,
				emoji: reactionsTable.emoji,
			})
			.from(reactionsTable)
			.where(
				and(
					eq(reactionsTable.reaction_type, "add"),
					inArray(reactionsTable.message_id, liveIds),
				),
			)
		const emojiByMessage = new Map<string, { emoji: string; count: number }[]>()
		for (const e of emojiRows) {
			const list = emojiByMessage.get(e.message_id) ?? []
			const hit = list.find((x) => x.emoji === e.emoji)
			if (hit) hit.count += 1
			else list.push({ emoji: e.emoji, count: 1 })
			emojiByMessage.set(e.message_id, list)
		}
		for (const list of emojiByMessage.values()) {
			list.sort((a, b) => b.count - a.count)
		}

		return live.map(([id, net]) => {
			const m = messageById.get(id)
			return {
				message_id: id,
				content: m?.content ?? "",
				username: m?.username ?? null,
				channel_id: m?.channel_id ?? "",
				channel_name: m ? (readChannelName(m.metadata) ?? m.channel_id) : null,
				created_at: m ? Number(m.created_at) : null,
				reaction_count: net,
				top_emojis: (emojiByMessage.get(id) ?? []).slice(0, 3),
			}
		})
	}

	/**
	 * Insights: categories, confidence, enforcement follow-through, edits, the
	 * media archive, and pipeline freshness.
	 *
	 * Four reads in parallel, each one already at the granularity its reduction
	 * needs — the alternative (a GROUP BY per panel) cannot express any of these
	 * shapes without a cast: `verdicts.categories` is an array to unnest, the
	 * confidence histogram is a computed bucket, and "newest username per member"
	 * is not an aggregate.
	 *
	 * The verdict scan feeds FOUR panels (categories, confidence, enforcement,
	 * last verdict time) so it is paid for once. It reads `confidence` and
	 * `categories` for every verdict — bounded by messages judged, not by
	 * messages captured, and the worker only ever writes one verdict per message.
	 */
	async getInsights(limit: number) {
		const cap = Math.min(Math.max(limit || 8, 1), 25)

		const [verdictRows, editRows, mediaRows, messageAgg] = await Promise.all([
			this.db
				.select({
					status: verdictsTable.status,
					confidence: verdictsTable.confidence,
					categories: verdictsTable.categories,
					auto_delete_state: verdictsTable.auto_delete_state,
					updated_at: verdictsTable.updated_at,
				})
				.from(verdictsTable),
			// Newest-first is part of the contract, not decoration: the reduction
			// keeps the newest name per member with a strict `>`, so equal
			// timestamps resolve to whichever row came back first — and
			// newest-first is what makes that the current name.
			this.db
				.select({
					message_id: messageEditsTable.message_id,
					edited_at: messageEditsTable.edited_at,
					user_id: messagesTable.user_id,
					username: messagesTable.username,
					created_at: messagesTable.created_at,
				})
				.from(messageEditsTable)
				// LEFT JOIN, not INNER: retention purges `messages` and
				// `message_edits` has no foreign key, so an edit can outlive its
				// message. An INNER JOIN would silently shrink the edit total the
				// Edits tab reports.
				.leftJoin(
					messagesTable,
					eq(messagesTable.id, messageEditsTable.message_id),
				)
				.orderBy(desc(messagesTable.created_at)),
			this.db
				.select({
					status: attachmentsTable.upload_status,
					n: count(),
					// `size` is integer but SUM() widens to bigint, which pg hands
					// back as a string; `buildMediaArchive` coerces.
					bytes: sql<number>`coalesce(sum(${attachmentsTable.size}), 0)`,
				})
				.from(attachmentsTable)
				.groupBy(attachmentsTable.upload_status),
			// Freshness in one pass over `messages`. Three aggregates, because
			// three different rows carry the three timestamps: the newest message,
			// the newest deletion, and the OLDEST still-waiting message. `FILTER`
			// keeps the third out of a second query.
			this.db
				.select({
					last_message_at: sql<number | null>`max(${messagesTable.created_at})`,
					last_deletion_at: sql<
						number | null
					>`max(${messagesTable.deleted_at})`,
					oldest_waiting_at: sql<
						number | null
					>`min(${messagesTable.created_at}) FILTER (WHERE ${messagesTable.ai_status} IN ('pending', 'retry_wait'))`,
				})
				.from(messagesTable),
		])

		return buildInsights(
			{
				verdicts: verdictRows.map((v) => ({
					status: String(v.status),
					confidence: Number(v.confidence),
					categories: v.categories ?? [],
					auto_delete_state: v.auto_delete_state,
					updated_at: Number(v.updated_at),
				})),
				edits: editRows,
				media: mediaRows.map((m) => ({
					status: String(m.status),
					count: m.n,
					bytes: Number(m.bytes),
				})),
				messages: messageAgg[0] ?? {
					last_message_at: null,
					last_deletion_at: null,
					oldest_waiting_at: null,
				},
			},
			cap,
		)
	}

	async getTopReactors(limit: number) {
		const cap = Math.min(Math.max(limit || 20, 1), 50)

		// Top users by net reactions given (adds minus removes). The distinct
		// counts (messages, emojis) cannot be expressed through Prisma's groupBy,
		// so this is a fetch and reduce. Grouping is by (user_id, username): a user
		// whose name changed appears twice.
		const rows = await this.db
			.select({
				user_id: reactionsTable.user_id,
				username: reactionsTable.username,
				message_id: reactionsTable.message_id,
				emoji: reactionsTable.emoji,
				reaction_type: reactionsTable.reaction_type,
			})
			.from(reactionsTable)

		interface ReactorAgg {
			user_id: string
			username: string
			net_count: number
			adds_count: number
			messages: Set<string>
			emojis: Set<string>
		}
		const byReactor = new Map<string, ReactorAgg>()
		for (const r of rows) {
			const key = `${r.user_id}\u0000${r.username}`
			const entry = byReactor.get(key) ?? {
				user_id: r.user_id,
				username: r.username,
				net_count: 0,
				adds_count: 0,
				messages: new Set<string>(),
				emojis: new Set<string>(),
			}
			if (r.reaction_type === "add") {
				entry.net_count += 1
				entry.adds_count += 1
			} else if (r.reaction_type === "remove") {
				entry.net_count -= 1
			}
			entry.messages.add(r.message_id)
			entry.emojis.add(r.emoji)
			byReactor.set(key, entry)
		}

		return [...byReactor.values()]
			.sort(
				(a, b) =>
					b.net_count - a.net_count ||
					a.user_id.localeCompare(b.user_id) ||
					a.username.localeCompare(b.username),
			)
			.slice(0, cap)
			.map((r) => ({
				user_id: r.user_id,
				username: r.username || "unknown",
				net_count: r.net_count,
				adds_count: r.adds_count,
				messages_reacted: r.messages.size,
				emojis_used: r.emojis.size,
			}))
	}
}
