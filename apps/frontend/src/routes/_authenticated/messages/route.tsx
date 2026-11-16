import { createFileRoute } from "@tanstack/react-router"

import { RouteSeedGate } from "#/components/features/route-seed-gate"
import { type ICursorPage, qk } from "#/hooks/use-data"
import type { ISeedEntry } from "#/hooks/use-route-seed"
import { browserApi } from "#/libs/api/browser"
import type {
	IGuild,
	IMessageEdit,
	IMessagePage,
	IReviewResult,
	ITextChannel,
} from "#/libs/types"
import { MessagesView } from "./_components/view.tsx"

/**
 * Client route for /messages — was a server component.
 *
 * Two things the server did that no SWR hook can reproduce, both reproduced
 * here in the same order:
 *
 *  1. `guildId` is derived as `guilds[0]?.id ?? defaultGuildId` and seeded into
 *     the view's `useState`. It is the root of the guild → channels → messages
 *     chain, and `useTextChannels` keys on `guildId ? … : null`, so a null
 *     guildId means the channel picker never fetches at all.
 *
 *  2. `getMessages` REQUIRES a guild or channel id. When the archive is empty
 *     (no `messages.guilds` row yet) the server skipped the call entirely
 *     rather than issuing a request the backend rejects with a
 *     ValidationError. That guard is preserved — see `EMPTY_PAGE`.
 */
const REVIEW_LIMIT = 20
const FEED_LIMIT = 50
// Must match `EDIT_LIMIT` in `./_components/view`, or the seed would fetch a different page
// size than the hook's infinite query asks for and the first render would show
// a list the very next fetch immediately replaces.
const EDIT_LIMIT = 25

async function fetchSeed() {
	const guilds = (await browserApi.messages.guilds()) as unknown as IGuild[]
	const defaultGuildId = await browserApi.config.defaultGuildId()
	const guildId = guilds?.[0]?.id ?? defaultGuildId

	const [channels, review, edits] = await Promise.all([
		guildId
			? (browserApi.messages.textChannels(guildId) as unknown as Promise<
					ITextChannel[]
				>)
			: Promise.resolve([] as ITextChannel[]),
		browserApi.messages.review({
			limit: REVIEW_LIMIT,
		}) as unknown as Promise<IReviewResult>,
		browserApi.messages.editHistory({
			limit: EDIT_LIMIT,
		}) as unknown as Promise<ICursorPage<IMessageEdit> | IMessageEdit[]>,
	])

	// Same guard as the server version: never call messages.list without a
	// scope, or the backend throws ValidationError.
	const EMPTY_PAGE: IMessagePage = { data: [], nextCursor: null }
	const messages = guildId
		? ((await browserApi.messages.list({
				guildId,
				limit: FEED_LIMIT,
			})) as unknown as IMessagePage)
		: EMPTY_PAGE

	// The PAGES are returned whole, cursor included — not `.data` / `.results`.
	// `prime` below writes each one as page 0 of an infinite query, and a page
	// stripped of its cursor reads as "this is the last page", which would
	// silently disable the very scrolling this route exists for.
	return {
		guilds: guilds ?? [],
		channels: channels ?? [],
		messages,
		review,
		edits,
		defaultGuildId: guildId ?? null,
	}
}

// Prime all three paged queries with the seed, so the view's infinite
// queries mount onto page one instead of re-requesting it.
//
// THE KEY SHAPES MATTER AND ARE NOT INTERCHANGEABLE. An infinite query's
// cache entry is `{ pages: [page0], pageParams: [undefined] }`, not the bare
// page — seeding `IMessagePage` directly would render `data.pages` as
// `undefined` and crash the list. And the cursor must be carried through, or
// `getNextPageParam` sees `nextCursor: null`, concludes there is no page 2,
// and the scroll the user came here for silently does nothing.
function prime(r: Awaited<ReturnType<typeof fetchSeed>>) {
	const scope = r.messages
	const first: ISeedEntry<unknown>[] = [
		{
			key: qk.guilds,
			data: r.guilds,
		},
		{
			key: qk.textChannels(r.defaultGuildId ?? ""),
			data: r.channels,
		},
		{
			key: [
				...qk.messagePage({
					guildId: r.defaultGuildId ?? undefined,
					limit: FEED_LIMIT,
				}),
			],
			data: {
				pages: [scope],
				pageParams: [undefined],
			},
		},
		{
			key: [...qk.review(undefined), REVIEW_LIMIT],
			data: { pages: [r.review], pageParams: [undefined] },
		},
		{
			key: [...qk.edits(undefined), EDIT_LIMIT],
			data: { pages: [r.edits], pageParams: [undefined] },
		},
	]
	return first
}

export function MessagesPage() {
	return (
		<RouteSeedGate
			fetcher={fetchSeed}
			prime={prime}
			loadingLabel="Loading messages"
		>
			{(data) => <MessagesView defaultGuildId={data.defaultGuildId} />}
		</RouteSeedGate>
	)
}

/**
 * /messages
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
 *
 * `validateSearch` types the drill-down contract. Every stat tile on the
 * dashboard links here with `?status=` or `?verdict=`, so those keys are the
 * app's URL API — declaring them here makes a typo a compile error rather than a
 * filter that silently does nothing.
 *
 * Both values are read as `string | undefined`, NOT narrowed to an enum: the
 * allow-list check is `filterFromUrl(value, PIPELINE_STATUSES, ANY)` inside the
 * view, and it must stay there. Narrowing here would reject an unknown value
 * with a router error instead of falling back to `ANY`, which is what lets a
 * hand-edited or stale `?status=` degrade to "unfiltered" rather than erroring.
 */
export const Route = createFileRoute("/_authenticated/messages")({
	// Optional keys, deliberately. Without this annotation the return type infers
	// `{ status: string | undefined }` — a REQUIRED key that may hold undefined —
	// and TanStack's MakeRequiredSearchParams reads that as "callers must pass
	// search", so every <Link to="/messages"> demands a search prop the moment
	// the route tree is registered.
	validateSearch: (
		search: Record<string, unknown>,
	): { status?: string; verdict?: string } => ({
		status: typeof search.status === "string" ? search.status : undefined,
		verdict: typeof search.verdict === "string" ? search.verdict : undefined,
	}),
	component: MessagesPage,
})
