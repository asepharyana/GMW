import { createFileRoute } from "@tanstack/react-router"

import { useCallback } from "react"
import { ErrorState, LoadingState } from "#/components/ui/states"
import { qk } from "#/hooks/use-data"
import { useRouteSeed } from "#/hooks/use-route-seed"
import { browserApi } from "#/libs/api/browser"
import type {
	IDashboardActivity,
	IDashboardInsights,
	IDashboardLeaderboards,
	IDashboardStats,
	ITopReaction,
	ITopReactor,
} from "#/libs/types"
import { DashboardView } from "./_components/view.tsx"

const DAYS = 14
/** How many ranked rows each member/channel/editor list carries. */
const LIMIT = 8

/**
 * Client route for /dashboard — was an async React Server Component that
 * fetched its seed from `#/libs/api/server` at render time.
 *
 * The fetch list, the parallel Promise.all, and the props handed to the view
 * are unchanged; only the transport and the timing moved. `useRouteSeed` holds
 * the render until all four resolve, so `DashboardView` still receives real
 * numbers on its first render exactly as it did under SSR.
 */
export function DashboardPage() {
	const fetcher = useCallback(async () => {
		// Independent reads, so they go in parallel rather than in sequence.
		const [stats, activity, leaderboards, reactions, reactors, insights] =
			await Promise.all([
				browserApi.dashboard.stats(),
				browserApi.dashboard.activity(DAYS),
				browserApi.dashboard.leaderboards(LIMIT),
				browserApi.dashboard.reactions(10),
				browserApi.dashboard.reactors(10),
				browserApi.dashboard.insights(LIMIT),
			])

		return {
			stats: stats as unknown as IDashboardStats,
			activity: activity as unknown as IDashboardActivity,
			leaderboards: leaderboards as unknown as IDashboardLeaderboards,
			reactions: reactions as unknown as ITopReaction[],
			reactors: reactors as unknown as ITopReactor[],
			insights: insights as unknown as IDashboardInsights,
		}
	}, [])

	// Prime the cache under the exact keys `useStats` / `useActivity` /
	// `useLeaderboards` / `useTopReactions` / `useTopReactors` / `useInsights`
	// read, so those hooks mount onto this data instead of firing six identical
	// requests one frame later.
	const prime = useCallback(
		(r: {
			stats: IDashboardStats
			activity: IDashboardActivity
			leaderboards: IDashboardLeaderboards
			reactions: ITopReaction[]
			reactors: ITopReactor[]
			insights: IDashboardInsights
		}) => [
			{ key: qk.stats, data: r.stats },
			{ key: qk.activity(DAYS), data: r.activity },
			{ key: qk.leaderboards(LIMIT), data: r.leaderboards },
			{ key: qk.reactions(10), data: r.reactions },
			{ key: qk.reactors(10), data: r.reactors },
			{ key: qk.insights(LIMIT), data: r.insights },
		],
		[],
	)

	const seed = useRouteSeed(fetcher, prime)

	if (seed.error) {
		return <ErrorState error={seed.error} onRetry={seed.retry} />
	}

	if (seed.isPending || !seed.data) {
		return <LoadingState label="Loading overview" />
	}

	return <DashboardView days={DAYS} />
}

/**
 * /dashboard
 *
 * The page body and the route module are one file: the old Next.js
 * `src/app/(dashboard)/<feature>/page.tsx` was folded in here when that tree was
 * retired. The view it renders sits beside this file at `_components/view.tsx`,
 * which `routeFileIgnorePattern` keeps out of the generated route tree.
 *
 * A distinct module per route gives a distinct component INSTANCE per route,
 * which is the second invariant the old `router.tsx` doc comment warned about.
 * Hoisting a page into a shared const reused across routes would make React
 * reconcile by component type, and MessagesView's local
 * guildId/channelId/search/tab state would survive navigation instead of
 * resetting.
 */
export const Route = createFileRoute("/_authenticated/dashboard")({
	component: DashboardPage,
})
