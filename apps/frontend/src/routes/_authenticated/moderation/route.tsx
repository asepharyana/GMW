import { createFileRoute } from "@tanstack/react-router"

import { RouteSeedGate } from "#/components/features/route-seed-gate"
import { qk } from "#/hooks/use-data"
import { browserApi } from "#/libs/api/browser"
import type {
	ICoverage,
	IFlaggedChannel,
	IFlaggedDomain,
	IHourBucket,
	IModerationActionPage,
	IModerationStats,
	IModerationTrends,
} from "#/libs/types"
import { ModerationView } from "./_components/view.tsx"

const DAYS = 30

async function fetchSeed() {
	const [stats, actions, trends, domains, flaggedChannels, hourly, coverage] =
		await Promise.all([
			browserApi.moderation.stats() as unknown as Promise<IModerationStats>,
			browserApi.moderation.actions({
				limit: 50,
			}) as unknown as Promise<IModerationActionPage>,
			browserApi.moderation.trends(
				DAYS,
			) as unknown as Promise<IModerationTrends>,
			browserApi.moderation.topDomains(DAYS) as unknown as Promise<
				IFlaggedDomain[]
			>,
			browserApi.moderation.topChannels(DAYS) as unknown as Promise<
				IFlaggedChannel[]
			>,
			browserApi.moderation.byHour(DAYS) as unknown as Promise<IHourBucket[]>,
			browserApi.moderation.coverage(DAYS) as unknown as Promise<ICoverage>,
		])

	return {
		stats,
		actions,
		trends,
		domains: domains ?? [],
		flaggedChannels: flaggedChannels ?? [],
		hourly: hourly ?? [],
		coverage,
	}
}

// Seven hooks read seven keys; all seven are primed here so the view mounts
// onto the seed instead of re-issuing the whole batch a frame later.
// `actions` is keyed with the unfiltered (empty-string) status/actionType the
// view starts on — anything else and the first render would fetch the
// filtered table while the seed sits unused in the cache.
function prime(r: Awaited<ReturnType<typeof fetchSeed>>) {
	return [
		{ key: qk.modStats, data: r.stats },
		{ key: qk.modActions("", ""), data: r.actions },
		{ key: qk.modTrends(DAYS), data: r.trends },
		{ key: qk.domains(DAYS), data: r.domains },
		{ key: qk.flaggedChannels(DAYS), data: r.flaggedChannels },
		{ key: qk.hourly(DAYS), data: r.hourly },
		{ key: qk.coverage(DAYS), data: r.coverage },
	]
}

/**
 * Client route for /moderation — was a server component issuing seven parallel
 * oRPC calls. The `Promise.all` and every prop are unchanged.
 */
export function ModerationPage() {
	return (
		<RouteSeedGate
			fetcher={fetchSeed}
			prime={prime}
			loadingLabel="Loading moderation"
		>
			{() => <ModerationView days={DAYS} />}
		</RouteSeedGate>
	)
}

/**
 * /moderation
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
export const Route = createFileRoute("/_authenticated/moderation")({
	// Same drill-down contract as /messages: these two keys are what the
	// dashboard's stat tiles link with. Read as `string | undefined` and left to
	// `filterFromUrl`'s allow-list inside the view, so an unknown value degrades
	// to "unfiltered" instead of erroring the router.
	// Optional keys — see the same note in `messages/route.tsx`: without the
	// annotation this infers a REQUIRED key holding `undefined`, which makes
	// TanStack demand a `search` prop on every <Link to="/moderation">.
	validateSearch: (
		search: Record<string, unknown>,
	): { status?: string; actionType?: string } => ({
		status: typeof search.status === "string" ? search.status : undefined,
		actionType:
			typeof search.actionType === "string" ? search.actionType : undefined,
	}),
	component: ModerationPage,
})
