import { useNavigate, useSearch } from "@tanstack/react-router"
import {
	useCallback,
	useEffect,
	useMemo,
	useState,
	useSyncExternalStore,
} from "react"
import { MessageFeedCard } from "#/components/features/message-feed-card"
import { ChannelPicker, GuildPicker } from "#/components/features/pickers"
import {
	InfiniteScrollSentinel,
	LoadMoreFallback,
	usePagedCount,
	useScrollReset,
} from "#/components/ui/infinite-scroll"
import { Input } from "#/components/ui/input"
import { EmptyState, ErrorState, NoResultsState } from "#/components/ui/states"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "#/components/ui/tabs"
import {
	flattenPages,
	useEditFeed,
	useGuilds,
	useMessageFeed,
	useReviewFeed,
	useTextChannels,
} from "#/hooks/use-data"
import {
	filterFromUrl,
	PIPELINE_STATUSES,
	VERDICT_STATUSES,
} from "#/libs/ai-status"
import { formatRelative, humanize } from "#/libs/format"
import { Reveal } from "#/libs/motion"
import type { IMessage, IMessageEdit } from "#/libs/types"
import { useWsEvent } from "#/libs/ws/context"

/**
 * Sentinel for "no filter". The URL layer and the state both speak it, and it is
 * mapped back to undefined before it reaches the backend. It is never shown to
 * the user: the "All" chip renders its own label.
 */
const ANY = "__any__"
const FEED_LIMIT = 50
const REVIEW_LIMIT = 20
// The edit log is the densest of the three (one row per edit, often several per
// message in a cleanup spree), so a smaller page keeps the first paint fast
// while the sentinel keeps making more reachable.
const EDIT_LIMIT = 25

/**
 * A single-choice filter, as a row of toggle chips.
 *
 * These were two `Select`s. A select hides its options behind a click, which is
 * the wrong trade for a filter with three or six values: the reader should see
 * that "Error" exists without opening anything. `aria-pressed` makes each chip a
 * real toggle for assistive tech, and the group is a `fieldset` so the legend is
 * its name.
 */
function ChipFilter({
	legend,
	value,
	options,
	onChange,
}: {
	legend: string
	value: string
	options: ReadonlyArray<{ value: string; label: string }>
	onChange: (value: string) => void
}) {
	return (
		<fieldset className="min-w-0 space-y-2">
			<legend className="field-label mb-2">{legend}</legend>
			<div className="flex flex-wrap gap-1.5">
				{options.map((option) => (
					<button
						key={option.value}
						type="button"
						className="chip-toggle"
						aria-pressed={value === option.value}
						onClick={() => onChange(option.value)}
					>
						{option.label}
					</button>
				))}
			</div>
		</fieldset>
	)
}

/**
 * `lg` and up, where the filters live in a sticky margin and are always open.
 * Below it they are a fold-out, so a phone gets the feed in its first screen
 * instead of two screens of chips. Read through `useSyncExternalStore` so the
 * value is correct on the first client render and follows a window resize.
 */
const DESKTOP_QUERY = "(width >= 64rem)"

function useIsDesktop(): boolean {
	return useSyncExternalStore(
		(notify) => {
			const mql = window.matchMedia(DESKTOP_QUERY)
			mql.addEventListener("change", notify)
			return () => mql.removeEventListener("change", notify)
		},
		() => window.matchMedia(DESKTOP_QUERY).matches,
		() => true,
	)
}

const PIPELINE_OPTIONS = [
	{ value: ANY, label: "All" },
	...PIPELINE_STATUSES.map((status) => ({
		value: status,
		label: humanize(status),
	})),
]

const VERDICT_OPTIONS = [
	{ value: ANY, label: "All" },
	...VERDICT_STATUSES.map((verdict) => ({
		value: verdict,
		label: humanize(verdict),
	})),
]

export function MessagesView({
	defaultGuildId,
}: {
	defaultGuildId: string | null
}) {
	// Drill-down filters arrive in the URL (W2). Every readout on the dashboard
	// links here with `?status=` or `?verdict=`, so the view has to seed its
	// filter state from the query string -- otherwise the link lands on an
	// unfiltered list, which is what made the app's one pre-existing drill-down
	// (`/messages?status=dead`) a dead link.
	const navigate = useNavigate()
	// `from` pins the search shape to this route, so a hand-edited or unknown
	// `?status=` cannot smuggle a value past the filter below.
	const urlSearch = useSearch({ from: "/_authenticated/messages" })
	const urlStatus = filterFromUrl(urlSearch.status, PIPELINE_STATUSES, ANY)
	const urlVerdict = filterFromUrl(urlSearch.verdict, VERDICT_STATUSES, ANY)

	const [guildId, setGuildId] = useState<string | null>(defaultGuildId)
	const [channelId, setChannelId] = useState<string | null>(null)
	const [search, setSearch] = useState("")
	const [pipelineFilter, setPipelineFilter] = useState<string>(urlStatus)
	const [verdictFilter, setVerdictFilter] = useState<string>(urlVerdict)
	const isDesktop = useIsDesktop()
	const [filtersOpen, setFiltersOpen] = useState(false)
	const showFilters = isDesktop || filtersOpen
	// What the fold-out button reports while it is closed, so a collapsed filter
	// bar never hides the fact that the list is filtered.
	const activeFilters =
		(pipelineFilter !== ANY ? 1 : 0) +
		(verdictFilter !== ANY ? 1 : 0) +
		(channelId ? 1 : 0)

	// Keep the address bar in step with the filters so a reload -- or a shared
	// link -- reproduces the same list. Written back only when something
	// actually changed, otherwise every filter change would push a history entry.
	useEffect(() => {
		if (pipelineFilter === urlStatus && verdictFilter === urlVerdict) return
		// `replace: true` is LOAD-BEARING. TanStack's `navigate` PUSHES by default,
		// so without it every filter toggle would add a history entry and Back
		// would walk through the user's own filtering. The react-router version
		// passed `{replace: true}` for the same reason.
		void navigate({
			to: "/messages",
			search: (prev: Record<string, unknown>) => ({
				...prev,
				...(pipelineFilter !== ANY ? { status: pipelineFilter } : {}),
				...(verdictFilter !== ANY ? { verdict: verdictFilter } : {}),
			}),
			replace: true,
		})
	}, [pipelineFilter, verdictFilter, urlStatus, urlVerdict, navigate])

	const guilds = useGuilds()
	const channels = useTextChannels(guildId)

	const messageQuery = useMemo(
		() => ({
			// The backend rejects a list with neither guild nor channel, so only ask
			// once a guild is actually selected.
			channelId: channelId ?? undefined,
			guildId: channelId ? undefined : (guildId ?? undefined),
			limit: FEED_LIMIT,
			status: pipelineFilter === ANY ? undefined : (pipelineFilter as never),
			verdict: verdictFilter === ANY ? undefined : (verdictFilter as never),
		}),
		[channelId, guildId, pipelineFilter, verdictFilter],
	)

	// `initial*` seeds come from the route, which blocked its own render on them.
	// They are handed to Query as the first page's data rather than as SWR
	// `fallbackData`, so the cache and the rendered list cannot disagree about
	// whether page one exists.
	const messages = useMessageFeed(messageQuery, Boolean(guildId))
	const review = useReviewFeed(channelId ?? undefined, REVIEW_LIMIT)
	const edits = useEditFeed(channelId ?? undefined, EDIT_LIMIT)

	// Switching scope changes what every tab is showing, and paging appends to the
	// bottom — without this the viewport stays parked at the end of the previous,
	// much longer list, which reads as "the new filter loaded nothing".
	useScrollReset(`${guildId ?? ""}:${channelId ?? ""}`)

	// A new message arrives: revalidate the feed. A verdict arriving changes a
	// row in place, so refresh that too rather than showing a stale "unjudged".
	//
	// `refetch` and not a cache write: the WS payload is a notification, not the
	// row. Trusting it as data would mean reimplementing the mapping the backend
	// already does, and any drift would show as a permanently wrong row instead
	// of a momentarily stale one.
	useWsEvent("message_created", () => {
		void messages.refetch()
	})
	useWsEvent("message_analyzed", () => {
		void messages.refetch()
		void review.refetch()
	})
	useWsEvent("message_deleted", () => {
		void messages.refetch()
	})
	useWsEvent("message_updated", () => {
		void edits.refetch()
	})

	const onGuildChange = useCallback((next: string) => {
		setGuildId(next)
		setChannelId(null)
	}, [])

	// A page reports "there is more" by handing back a cursor; a null cursor on
	// the LAST page is the only end-of-list signal, so `hasNextPage` is derived
	// rather than counted.
	const feedRows = useMemo(
		() => flattenPages<IMessage>(messages.data?.pages, "data"),
		[messages.data?.pages],
	)
	const reviewRows = useMemo(
		() => flattenPages<IMessage>(review.data?.pages, "results"),
		[review.data?.pages],
	)
	const editRows = useMemo(
		() => flattenPages<IMessageEdit>(edits.data?.pages, "results"),
		[edits.data?.pages],
	)

	// The tab counts are what is LOADED, not what the backend holds — a count
	// reading 400 on a 12-row list was the tell that this data used to be
	// unpaginated.
	const reviewCount = reviewRows.length
	const editCount = editRows.length

	const feed = useMemo(() => {
		const q = search.trim().toLowerCase()
		if (!q) return feedRows
		// Client-side over LOADED rows only. The backend has no text search on this
		// endpoint, so filtering everything here would silently lie about the total;
		// filtering the loaded window keeps the visible list honest and the
		// placeholder says "loaded messages".
		return feedRows.filter(
			(m) =>
				m.content.toLowerCase().includes(q) ||
				m.username.toLowerCase().includes(q),
		)
	}, [feedRows, search])

	return (
		<Reveal className="space-y-10">
			<header className="grid items-end gap-x-12 gap-y-4 lg:grid-cols-[minmax(0,1fr)_auto]">
				<div className="min-w-0">
					<p className="field-label">Captured traffic</p>
					<h1 className="mega-md mt-4 text-ink">Messages</h1>
				</div>
				<p className="max-w-xs text-sm leading-relaxed text-ink-muted">
					Live feed, enforcement log, and edit history.{" "}
					<span className="marker font-bold whitespace-nowrap">
						{feedRows.length} loaded
					</span>
				</p>
			</header>

			{/*
        Two columns from `lg`: the filters in a sticky margin, the wire to the
        right. The filters used to be a toolbar above the list, which meant they
        scrolled away exactly when the list got long enough to need them.
      */}
			<div className="grid gap-x-12 gap-y-8 lg:grid-cols-[15rem_minmax(0,1fr)]">
				<aside
					className="desk-section min-w-0 space-y-6 self-start lg:sticky lg:top-20"
					aria-label="Filters"
				>
					{!isDesktop && (
						<button
							type="button"
							className="flex min-h-11 w-full items-center justify-between gap-3 text-left"
							aria-expanded={filtersOpen}
							aria-controls="message-filters"
							onClick={() => setFiltersOpen((open) => !open)}
						>
							<span className="field-label text-ink">
								Filters
								{activeFilters > 0 ? ` · ${activeFilters} active` : ""}
							</span>
							<span className="font-mono text-sm text-ink" aria-hidden>
								{filtersOpen ? "−" : "+"}
							</span>
						</button>
					)}

					<div id="message-filters" hidden={!showFilters} className="space-y-6">
						<div className="space-y-2">
							<p className="field-label">Scope</p>
							<GuildPicker
								guilds={guilds.data ?? []}
								value={guildId}
								onChange={onGuildChange}
							/>
							<ChannelPicker
								channels={channels.data ?? []}
								value={channelId}
								onChange={setChannelId}
								disabled={!guildId}
							/>
						</div>

						<div className="space-y-2">
							<label htmlFor="message-filter" className="field-label">
								Find
							</label>
							<Input
								id="message-filter"
								value={search}
								onChange={(event) => setSearch(event.target.value)}
								placeholder="Filter loaded messages…"
								className="w-full"
							/>
						</div>

						<ChipFilter
							legend="Verdict"
							value={verdictFilter}
							options={VERDICT_OPTIONS}
							onChange={setVerdictFilter}
						/>
						<ChipFilter
							legend="Queue state"
							value={pipelineFilter}
							options={PIPELINE_OPTIONS}
							onChange={setPipelineFilter}
						/>
					</div>
				</aside>

				<Tabs defaultValue="feed" className="min-w-0">
					<TabsList variant="line" className="tabs-touch">
						<TabsTrigger value="feed">Feed</TabsTrigger>
						<TabsTrigger value="enforced">
							Enforced
							{reviewCount > 0 && (
								<span className="font-mono text-micro text-ink-muted">
									{reviewCount}
								</span>
							)}
						</TabsTrigger>
						<TabsTrigger value="edits">
							Edits
							{editCount > 0 && (
								<span className="font-mono text-micro text-ink-muted">
									{editCount}
								</span>
							)}
						</TabsTrigger>
					</TabsList>

					<TabsContent value="feed" className="mt-6">
						{messages.error && !messages.data ? (
							<ErrorState
								error={messages.error}
								onRetry={() => void messages.refetch()}
							/>
						) : !guildId ? (
							<EmptyState
								title="Select a guild"
								description="The message archive is empty until the gateway captures its first message."
							/>
						) : feed.length === 0 ? (
							search ? (
								<NoResultsState query={search} />
							) : (
								<EmptyState title="No messages match these filters" />
							)
						) : (
							<>
								<ul
									className="border-t border-rule"
									aria-busy={messages.isFetching || undefined}
								>
									{feed.map((message) => (
										<li key={message.id}>
											<MessageFeedCard message={message} />
										</li>
									))}
								</ul>
								{/* The sentinel only renders while another page exists, so
                    there is nothing to scroll past the last page. */}
								<InfiniteScrollSentinel
									onLoadMore={() => void messages.fetchNextPage()}
									hasMore={messages.hasNextPage}
									isFetching={messages.isFetchingNextPage}
									label="feed"
								/>
								<LoadMoreFallback
									onLoadMore={() => void messages.fetchNextPage()}
									hasMore={messages.hasNextPage}
									isFetching={messages.isFetchingNextPage}
									label="messages"
								/>
							</>
						)}
					</TabsContent>

					<TabsContent value="enforced" className="mt-6">
						<EnforcementLog
							messages={reviewRows}
							loading={review.isFetching}
							error={review.error}
							onRetry={() => void review.refetch()}
							hasMore={review.hasNextPage}
							onLoadMore={() => void review.fetchNextPage()}
							isLoadingMore={review.isFetchingNextPage}
						/>
					</TabsContent>

					<TabsContent value="edits" className="mt-6">
						<EditHistory
							edits={editRows}
							loading={edits.isFetching}
							error={edits.error}
							onRetry={() => void edits.refetch()}
							hasMore={edits.hasNextPage}
							onLoadMore={() => void edits.fetchNextPage()}
							isLoadingMore={edits.isFetchingNextPage}
						/>
					</TabsContent>
				</Tabs>
			</div>
		</Reveal>
	)
}

/**
 * The enforcement log: what the pipeline already acted on.
 *
 * THIS IS NOT A HUMAN REVIEW QUEUE. Nothing here is waiting for a person to
 * approve it — the gateway's auto-delete enforcer (`autoDeleteEligibility.ts`)
 * decides and deletes on its own, and `verdicts.status` is `clean | deleted |
 * error` with no review tier between them. The endpoint kept its historical
 * name (`messages.review`) on the backend, which is where the old wording
 * leaked in from.
 *
 * What it actually lists, from `messages.review`'s filter: verdicts that called
 * for the message to go (`verdict = deleted`), PLUS messages stuck in `dead`,
 * where the worker exhausted its retries and so will never be judged at all.
 * Those two are shown together because they are the two ways a message ends up
 * removed or unhandled — the "what did the bot do, and what did it fail to do"
 * view.
 *
 * An earlier version filtered `ai_status IN ('warn','flagged')` — values the
 * database CHECK constraint forbids, so the query matched nothing and this
 * panel was permanently empty while moderation was working fine.
 *
 * Paged because the log is unbounded in principle: every removed message
 * accumulates, and a busy week holds more than any fixed page can.
 */
function EnforcementLog({
	messages,
	loading,
	error,
	onRetry,
	hasMore,
	onLoadMore,
	isLoadingMore,
}: {
	messages: IMessage[]
	loading: boolean
	error: unknown
	onRetry: () => void
	hasMore: boolean
	onLoadMore: () => void
	isLoadingMore: boolean
}) {
	const progress = usePagedCount(messages, hasMore)

	if (error && messages.length === 0) {
		return <ErrorState error={error} onRetry={onRetry} />
	}
	if (messages.length === 0) {
		return (
			<EmptyState
				title="Nothing removed yet"
				description="Messages the pipeline deleted, plus any it failed to judge, appear here."
			/>
		)
	}

	return (
		<>
			<ul className="border-t border-rule" aria-busy={loading || undefined}>
				{messages.map((message) => (
					<li key={message.id}>
						<MessageFeedCard message={message} />
					</li>
				))}
			</ul>
			<p className="mt-4 text-center font-mono text-micro text-ink-muted uppercase">
				{progress.label}
			</p>
			<InfiniteScrollSentinel
				onLoadMore={onLoadMore}
				hasMore={hasMore}
				isFetching={isLoadingMore}
				label="enforced messages"
			/>
			<LoadMoreFallback
				onLoadMore={onLoadMore}
				hasMore={hasMore}
				isFetching={isLoadingMore}
				label="enforcement log entries"
			/>
		</>
	)
}

/**
 * Recent edits, newest first, each set as a before/after diff.
 *
 * Worth its own tab because an edit that changes a message AFTER it was
 * judged is the signature of someone cleaning up before a moderator looks.
 * The `−` and `+` gutters make the direction of the change legible without
 * colour: the removed text is also struck through, so it survives a monochrome
 * screenshot and a colour-blind reader.
 */
function EditHistory({
	edits,
	loading,
	error,
	onRetry,
	hasMore,
	onLoadMore,
	isLoadingMore,
}: {
	edits: IMessageEdit[]
	loading: boolean
	error: unknown
	onRetry: () => void
	hasMore: boolean
	onLoadMore: () => void
	isLoadingMore: boolean
}) {
	const progress = usePagedCount(edits, hasMore)

	if (error && edits.length === 0) {
		return <ErrorState error={error} onRetry={onRetry} />
	}
	if (edits.length === 0) {
		return <EmptyState title="No recent edits" />
	}

	return (
		<>
			<ul className="border-t border-rule" aria-busy={loading || undefined}>
				{edits.map((edit) => (
					<li key={edit.id} className="border-b border-hairline py-4">
						<div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
							<span className="text-sm font-bold text-ink">
								{edit.username ?? "unknown"}
							</span>
							<span className="text-xs text-ink-muted">
								in {edit.channel_name ?? `#${edit.channel_id}`}
							</span>
							<span className="ml-auto font-mono text-micro-lg text-ink-muted">
								{formatRelative(edit.edited_at)}
							</span>
						</div>
						<div className="mt-3 space-y-1.5 font-mono text-xs">
							<p className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 break-words text-vermilion line-through">
								<span aria-hidden className="no-underline">
									−
								</span>
								<span>{edit.old_content}</span>
							</p>
							<p className="grid grid-cols-[1rem_minmax(0,1fr)] gap-2 break-words text-ink">
								<span aria-hidden className="text-signal">
									+
								</span>
								<span>{edit.new_content}</span>
							</p>
						</div>
					</li>
				))}
			</ul>
			<p className="mt-4 text-center font-mono text-micro text-ink-muted uppercase">
				{progress.label}
			</p>
			<InfiniteScrollSentinel
				onLoadMore={onLoadMore}
				hasMore={hasMore}
				isFetching={isLoadingMore}
				label="edits"
			/>
			<LoadMoreFallback
				onLoadMore={onLoadMore}
				hasMore={hasMore}
				isFetching={isLoadingMore}
				label="edit history entries"
			/>
		</>
	)
}
