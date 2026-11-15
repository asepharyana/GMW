import {
	type InfiniteData,
	type UseInfiniteQueryResult,
	type UseQueryResult,
	useInfiniteQuery,
	useQuery,
	useQueryClient,
} from "@tanstack/react-query"
import { browserApi } from "#/libs/api/browser"
import type {
	IDashboardActivity,
	IDashboardInsights,
	IDashboardLeaderboards,
	IDashboardStats,
	IFlaggedChannel,
	IFlaggedDomain,
	IGuild,
	IMessageEdit,
	IMessagePage,
	IMessageQuery,
	IModerationActionPage,
	IModerationStats,
	IModerationTrends,
	IReviewResult,
	ITextChannel,
	ITopReaction,
	ITopReactor,
} from "#/libs/types"

/**
 * TanStack Query data layer — replaces the SWR hooks this file used to hold.
 *
 * WHY THIS IS A REWRITE AND NOT A SWAP
 *
 * SWR and TanStack Query disagree on the three things this app leans on most:
 * cache identity, refetch policy, and pagination. None of them is a
 * rename-and-import:
 *
 *  - **Identity.** SWR keys were hand-built template strings (`K.messagePage`
 *    interpolated the query object). Query keys here are structured arrays, so
 *    `["messages","list",{...}]` hashes the same way for equal objects and
 *    different for different ones — which is what makes a prefix invalidate a
 *    whole family.
 *  - **Refetch.** SWR's `fallbackData` was threaded through every call site as
 *    an `initialData` prop from the route seed. Query reads that from the cache
 *    instead, seeded once per route.
 *  - **Pagination.** SWR Infinite's `getKey(i, prev)` is a positional page
 *    index; this backend pages by an opaque cursor, so page 3 is not "offset
 *    150" — it is "whatever page 2's nextCursor said". The key function
 *    therefore has to read the previous page's token, and returning `null`
 *    from it is what terminates paging.
 *
 * NO POLLING, DELIBERATELY
 *
 * `refetchInterval` appears only where it did before (the live headline
 * counters). Everything else revalidates from the `/ws` socket via
 * `useInvalidate`, because a timer re-fetching the same data the socket already
 * pushes races it — which is how the review queue used to show stale verdicts.
 */
const LIVE = 30_000

const shared = {
	// Re-focusing the tab re-fetching every panel is noise on an ops dashboard
	// that is already live; matches the old `revalidateOnFocus: false`.
	refetchOnWindowFocus: false,
	retry: 3,
	retryDelay: 4_000,
} as const

/** Query-key factory. One place, so invalidation prefixes stay in sync. */
export const qk = {
	stats: ["dashboard", "stats"] as const,
	activity: (days: number) => ["dashboard", "activity", days] as const,
	reactions: (limit: number) => ["dashboard", "reactions", limit] as const,
	leaderboards: (limit: number) =>
		["dashboard", "leaderboards", limit] as const,
	reactors: (limit: number) => ["dashboard", "reactors", limit] as const,
	insights: (limit: number) => ["dashboard", "insights", limit] as const,
	guilds: ["messages", "guilds"] as const,
	textChannels: (guildId: string) =>
		["messages", "textChannels", guildId] as const,
	messagePage: (query: IMessageQuery) => ["messages", "list", query] as const,
	review: (channelId: string | undefined) =>
		["messages", "review", channelId ?? "all"] as const,
	edits: (channelId: string | undefined) =>
		["messages", "edits", channelId ?? "all"] as const,
	modStats: ["moderation", "stats"] as const,
	modActions: (status: string, actionType: string) =>
		["moderation", "actions", status, actionType] as const,
	modTrends: (days: number) => ["moderation", "trends", days] as const,
	domains: (days: number) => ["moderation", "domains", days] as const,
	flaggedChannels: (days: number) => ["moderation", "channels", days] as const,
	hourly: (days: number) => ["moderation", "hourly", days] as const,
	coverage: (days: number) => ["moderation", "coverage", days] as const,
} as const

/** A paged list whose backend hands back an opaque resume token. */
export interface ICursorPage<T> {
	results: T[]
	nextCursor: string | null
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export function useStats() {
	return useQuery({
		queryKey: qk.stats,
		queryFn: () => browserApi.dashboard.stats() as Promise<IDashboardStats>,
		...shared,
	})
}

export function useActivity(days: number) {
	return useQuery({
		queryKey: qk.activity(days),
		queryFn: () =>
			browserApi.dashboard.activity(days) as Promise<IDashboardActivity>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useLeaderboards(limit: number) {
	return useQuery({
		queryKey: qk.leaderboards(limit),
		queryFn: () =>
			browserApi.dashboard.leaderboards(
				limit,
			) as Promise<IDashboardLeaderboards>,
		...shared,
		placeholderData: (prev) => prev,
	})
}

export function useTopReactions(limit: number) {
	return useQuery({
		queryKey: qk.reactions(limit),
		queryFn: () =>
			browserApi.dashboard.reactions(limit) as Promise<ITopReaction[]>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useTopReactors(limit: number) {
	return useQuery({
		queryKey: qk.reactors(limit),
		queryFn: () =>
			browserApi.dashboard.reactors(limit) as Promise<ITopReactor[]>,
		...shared,
		refetchInterval: LIVE,
	})
}

/**
 * Insights: categories, confidence, enforcement, edits, media, freshness.
 *
 * No polling. Every one of these numbers is derived from a verdict or an
 * upload, so the socket already knows when they move — see the dashboard view's
 * `message_analyzed` handler. `placeholderData` keeps the panels populated while
 * a refetch is in flight, so a push does not blank the page.
 */
export function useInsights(limit: number) {
	return useQuery({
		queryKey: qk.insights(limit),
		queryFn: () =>
			browserApi.dashboard.insights(limit) as Promise<IDashboardInsights>,
		...shared,
		placeholderData: (prev) => prev,
	})
}

// ── Messages ────────────────────────────────────────────────────────────────

export function useGuilds() {
	return useQuery({
		queryKey: qk.guilds,
		queryFn: () => browserApi.messages.guilds() as Promise<IGuild[]>,
		...shared,
	})
}

export function useTextChannels(guildId: string | null) {
	return useQuery({
		// `enabled` is the equivalent of the old `null` SWR key: without a guild
		// the picker shows nothing instead of firing a request the backend
		// rejects. The key still has to be STABLE and distinct, hence the literal.
		queryKey: guildId
			? qk.textChannels(guildId)
			: (["messages", "textChannels", null] as const),
		queryFn: () =>
			browserApi.messages.textChannels(guildId as string) as Promise<
				ITextChannel[]
			>,
		enabled: Boolean(guildId),
		...shared,
		placeholderData: (prev) => prev,
	})
}

/**
 * The live feed, paged by cursor and growing as the user scrolls.
 *
 * `getNextPageParam` extracts the backend's resume token; a page whose
 * `nextCursor` is null yields `undefined`, which is how Query learns there is no
 * page `n+1`. The two must agree with the key function or the list either
 * stalls early or fetches the same page forever.
 */
export function useMessageFeed(
	query: IMessageQuery,
	enabled: boolean,
): UseInfiniteQueryResult<
	InfiniteData<IMessagePage, string | undefined>,
	Error
> {
	return useInfiniteQuery({
		queryKey: qk.messagePage(query),
		queryFn: ({ pageParam }) =>
			browserApi.messages.list({
				...query,
				cursor: pageParam ?? undefined,
			}) as Promise<IMessagePage>,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.nextCursor ?? undefined,
		// The backend rejects a list with neither guild nor channel, so the feed
		// stays disabled until the view has picked a scope — the same guard the
		// route seed used to apply by not issuing the call at all.
		enabled: enabled && Boolean(query.guildId || query.channelId),
		...shared,
	}) as UseInfiniteQueryResult<
		InfiniteData<IMessagePage, string | undefined>,
		Error
	>
}

/**
 * The review queue, paged. Same cursor mechanism as the feed; the backend sorts
 * it actionable-first, so paging walks down a priority ranking rather than
 * backwards through time.
 *
 * `review` answers `{ results, limit, cursor }` — the resume token is `cursor`,
 * not `nextCursor`, because that field predates this pagination.
 */
export function useReviewFeed(
	channelId: string | undefined,
	limit: number,
): UseInfiniteQueryResult<
	InfiniteData<IReviewResult, string | undefined>,
	Error
> {
	return useInfiniteQuery({
		queryKey: [...qk.review(channelId), limit],
		queryFn: ({ pageParam }) =>
			browserApi.messages.review({
				limit,
				channelId,
				cursor: pageParam ?? undefined,
			}) as Promise<IReviewResult>,
		initialPageParam: undefined as string | undefined,
		getNextPageParam: (last) => last.cursor ?? undefined,
		...shared,
	}) as UseInfiniteQueryResult<
		InfiniteData<IReviewResult, string | undefined>,
		Error
	>
}

/**
 * Recent edits, paged. The backend changed this endpoint from a bare array to
 * `{ results, nextCursor }` so all three tabs scroll the same way.
 */
export function useEditFeed(
	channelId: string | undefined,
	limit: number,
): UseInfiniteQueryResult<
	InfiniteData<ICursorPage<IMessageEdit> | IMessageEdit[], string | undefined>,
	Error
> {
	return useInfiniteQuery({
		queryKey: [...qk.edits(channelId), limit],
		queryFn: ({ pageParam }) =>
			browserApi.messages.editHistory({
				limit,
				channelId,
				cursor: pageParam ?? undefined,
			}) as unknown as Promise<ICursorPage<IMessageEdit> | IMessageEdit[]>,
		initialPageParam: undefined as string | undefined,
		// `undefined` for either shape. A bare array carries no cursor, so an older
		// backend simply yields a single page and the tab degrades to "no further
		// pages" rather than paging forever against an endpoint that ignores it.
		getNextPageParam: (last) =>
			Array.isArray(last) ? undefined : (last.nextCursor ?? undefined),
		...shared,
	}) as UseInfiniteQueryResult<
		InfiniteData<
			ICursorPage<IMessageEdit> | IMessageEdit[],
			string | undefined
		>,
		Error
	>
}

// ── Moderation ──────────────────────────────────────────────────────────────

export function useModerationStats() {
	return useQuery({
		queryKey: qk.modStats,
		queryFn: () => browserApi.moderation.stats() as Promise<IModerationStats>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useModerationActions(status: string, actionType: string) {
	return useQuery({
		queryKey: qk.modActions(status, actionType),
		queryFn: () =>
			browserApi.moderation.actions({
				limit: 50,
				status: status || undefined,
				actionType: actionType || undefined,
			}) as Promise<IModerationActionPage>,
		...shared,
		placeholderData: (prev) => prev,
	})
}

export function useModerationTrends(days: number) {
	return useQuery({
		queryKey: qk.modTrends(days),
		queryFn: () =>
			browserApi.moderation.trends(days) as Promise<IModerationTrends>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useFlaggedDomains(days: number) {
	return useQuery({
		queryKey: qk.domains(days),
		queryFn: () =>
			browserApi.moderation.topDomains(days) as Promise<IFlaggedDomain[]>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useFlaggedChannels(days: number) {
	return useQuery({
		queryKey: qk.flaggedChannels(days),
		queryFn: () =>
			browserApi.moderation.topChannels(days) as Promise<IFlaggedChannel[]>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useHourlyModeration<T>(days: number) {
	return useQuery({
		queryKey: qk.hourly(days),
		queryFn: () => browserApi.moderation.byHour(days) as Promise<T>,
		...shared,
		refetchInterval: LIVE,
	})
}

export function useCoverage<T>(days: number) {
	return useQuery({
		queryKey: qk.coverage(days),
		queryFn: () => browserApi.moderation.coverage(days) as Promise<T>,
		...shared,
		refetchInterval: LIVE,
	})
}

// ── WS-driven revalidation ──────────────────────────────────────────────────

/**
 * Invalidate a whole query family from a `/ws` event handler.
 *
 * PREFIX matching is the payoff of structured keys: invalidating `["messages"]`
 * re-fetches the feed, the review queue and the edit log at once, with no
 * enumeration of every key that embeds a channel id. The SWR code had to call
 * `.mutate()` on each hook separately, so a forgotten subscriber was easy — and
 * a forgotten subscriber is a permanently stale panel, not a crash.
 */
export function useInvalidate() {
	const client = useQueryClient()
	return (prefix: readonly unknown[]) =>
		client.invalidateQueries({ queryKey: prefix })
}

/**
 * Flatten infinite pages into one list, preserving page order.
 *
 * Takes `field` rather than assuming a page is an array, because the three
 * paged endpoints disagree: `list` answers `{ data, nextCursor }`, `review`
 * answers `{ results, limit, cursor }`, and `editHistory` answers
 * `{ results, nextCursor }`. The generic is on the ELEMENT type, not the page,
 * so callers get `IMessage[]` / `IMessageEdit[]` back rather than `unknown[]`.
 *
 * WHY A BARE PAGE IS ALSO ACCEPTED
 *
 * A page that is itself an array is treated as a single page of `field`-less
 * elements. That is not a shape any current endpoint returns — it exists
 * because the dashboard is served by whatever backend build is running, and an
 * older build answers `editHistory` with a bare array instead of
 * `{ results, nextCursor }`. Without this, a rolling deploy whose frontend is
 * newer than its backend renders "No recent edits" — a confident, plausible,
 * completely wrong empty state rather than an error. Flattening both shapes
 * makes the tab keep working across the deploy window instead of lying.
 */
export function flattenPages<T, P = unknown>(
	pages: ReadonlyArray<P> | undefined,
	field: "results" | "data",
): T[] {
	if (!pages) return []
	return pages.flatMap((page) => {
		if (Array.isArray(page)) return page as T[]
		return (
			((page as Record<string, unknown> | undefined)?.[field] as
				| T[]
				| undefined) ?? []
		)
	})
}

export type { UseInfiniteQueryResult, UseQueryResult }
