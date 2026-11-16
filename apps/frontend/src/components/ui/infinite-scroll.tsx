import { Loader2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

/**
 * Auto-loads the next page when this sentinel scrolls into view.
 *
 * WHY AN INTERSECTION OBSERVER AND NOT A SCROLL HANDLER
 *
 * The obvious version listens to `scroll` on a container and compares
 * `scrollTop + clientHeight >= scrollHeight`. That fires on every frame of a
 * trackpad gesture, forces layout on each one to read `scrollHeight`, and needs
 * the scroll container threaded in from whatever ancestor happens to scroll. An
 * IntersectionObserver is none of those: the browser does the geometry, the
 * callback fires only on an actual threshold crossing, and it watches a
 * viewport-relative rect, so it works no matter which ancestor scrolls.
 *
 * WHY `rootMargin` IS POSITIVE
 *
 * A zero-margin observer fires when the sentinel is merely *visible*, which on a
 * short page starts the next fetch before the user has finished reading — and on
 * a page shorter than the viewport it fires immediately, repeatedly, until the
 * backend runs out of rows. Loading one viewport-height early means the data is
 * usually already there when the sentinel truly reaches the bottom, so the list
 * never visibly stalls.
 *
 * WHY THE STRICT-INTERSECTION GUARD
 *
 * `isIntersecting` stays true for as long as the sentinel overlaps the
 * viewport, and `fetchNextPage()` can be in flight for that whole time. Without
 * the `cancelled` latch guarding the callback, every re-render while the
 * sentinel is on screen fires another request for the same page — the classic
 * "infinite scroll hammers the API" bug. `isFetching` covers the in-flight case;
 * the local `cancelled` ref covers the window between one fetch settling and
 * React re-rendering with the new `isFetching` value.
 */
export function InfiniteScrollSentinel({
	onLoadMore,
	hasMore,
	isFetching,
	/** Distinguishes concurrent lists so each observer targets its own node. */
	label,
}: {
	onLoadMore: () => void
	hasMore: boolean
	isFetching: boolean
	label: string
}) {
	const ref = useRef<HTMLDivElement | null>(null)
	const cancelled = useRef(false)

	// Reset the latch whenever a fetch settles, so the next approach to the
	// bottom is allowed to request again. Tied to `isFetching` because the
	// callback cannot know when the request it started has actually finished.
	useEffect(() => {
		if (!isFetching) cancelled.current = false
	}, [isFetching])

	useEffect(() => {
		const node = ref.current
		// No observer when there is no more data: leaving one attached would keep
		// calling `onLoadMore`, and Query would treat it as an attempt to fetch a
		// page that does not exist.
		if (!node || !hasMore) return

		const observer = new IntersectionObserver(
			(entries) => {
				const entry = entries[0]
				if (!entry?.isIntersecting) return
				if (cancelled.current || isFetching) return
				cancelled.current = true
				onLoadMore()
			},
			{
				// One viewport-height of head start. See the note above.
				rootMargin: "100% 0px 0px 0px",
				threshold: 0,
			},
		)

		observer.observe(node)
		return () => observer.disconnect()
	}, [hasMore, isFetching, onLoadMore])

	if (!hasMore) return null

	return (
		<div
			ref={ref}
			className="flex items-center justify-center py-4"
			role="status"
			aria-live="polite"
			data-testid={`infinite-sentinel-${label}`}
		>
			{isFetching ? (
				<span className="inline-flex items-center gap-2 text-xs text-ink-muted">
					<Loader2 className="size-3.5 animate-spin" aria-hidden />
					Loading more…
				</span>
			) : (
				// Announced to screen readers so the list is not a dead end for anyone
				// not scrolling visually; the visual affordance is the cards themselves.
				<span className="sr-only">Scroll to load more</span>
			)}
		</div>
	)
}

/**
 * Imperative fallback for keyboard and screen-reader users.
 *
 * IntersectionObserver only fires on scroll geometry. A keyboard user tabbing
 * through the list may never scroll the viewport at all, so an observer-only
 * list is unreachable past page one for them. This button is visually subtle but
 * focusable, and it is what keeps the pagination operable without a mouse.
 */
export function LoadMoreFallback({
	onLoadMore,
	hasMore,
	isFetching,
	label,
}: {
	onLoadMore: () => void
	hasMore: boolean
	isFetching: boolean
	label: string
}) {
	if (!hasMore) return null
	return (
		<button
			type="button"
			onClick={onLoadMore}
			disabled={isFetching}
			className="mx-auto mt-2 block rounded-md border border-border px-3 py-1.5 text-xs text-ink-muted transition-colors hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 disabled:opacity-50"
		>
			{isFetching ? "Loading…" : "Load more"}
			<span className="sr-only"> {label}</span>
		</button>
	)
}

/**
 * Everything that sits under a paged list: an optional progress line, the
 * scroll sentinel, and the keyboard fallback button. Each list names its
 * sentinel and its fallback separately because the sentinel `label` identifies
 * the observer node, while the fallback `label` is read aloud by screen readers.
 */
export function PagedFooter({
	onLoadMore,
	hasMore,
	isFetching,
	sentinelLabel,
	fallbackLabel,
	progressLabel,
}: {
	onLoadMore: () => void
	hasMore: boolean
	isFetching: boolean
	sentinelLabel: string
	fallbackLabel: string
	/** Text from `usePagedCount`; omit to render no progress line. */
	progressLabel?: string
}) {
	return (
		<>
			{progressLabel !== undefined && (
				<p className="mt-4 text-center font-mono text-micro text-ink-muted uppercase">
					{progressLabel}
				</p>
			)}
			<InfiniteScrollSentinel
				onLoadMore={onLoadMore}
				hasMore={hasMore}
				isFetching={isFetching}
				label={sentinelLabel}
			/>
			<LoadMoreFallback
				onLoadMore={onLoadMore}
				hasMore={hasMore}
				isFetching={isFetching}
				label={fallbackLabel}
			/>
		</>
	)
}

/**
 * Scrolls the window to the top whenever `token` changes.
 *
 * Paging appends to the bottom of the list, so switching guild or channel leaves
 * the viewport parked wherever the previous, much longer list ended — which
 * reads as "nothing loaded". Resetting on the filter identity fixes that without
 * the view having to thread a ref through to the document.
 */
export function useScrollReset(token: string) {
	const first = useRef(true)
	// `first` is a ref, so it is stable for the component's lifetime and adding
	// it to the deps would be a lie to the linter rather than a correctness win —
	// it cannot change between renders, and the effect must NOT re-run when it
	// flips. `token` is the real trigger.
	useEffect(() => {
		if (first.current) {
			first.current = false
			return
		}
		window.scrollTo({ top: 0, behavior: "auto" })
	}, [token])
}

/** Progress readout: how many rows are loaded, and whether more exist. */
export function usePagedCount(rows: unknown[], hasMore: boolean) {
	const [announced, setAnnounced] = useState(0)
	useEffect(() => {
		setAnnounced(rows.length)
	}, [rows.length])
	return {
		loaded: announced,
		label: hasMore
			? `${announced} loaded, more available`
			: `${announced} total`,
	}
}
