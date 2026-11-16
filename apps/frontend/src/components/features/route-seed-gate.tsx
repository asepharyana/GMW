import type { ReactNode } from "react"
import { ErrorState, LoadingState } from "#/components/ui/states"
import { type ISeedEntry, useRouteSeed } from "#/hooks/use-route-seed"

/**
 * Holds a route's render until its seed fetch lands: Loading → content, or
 * Error (with retry) → content. Every `_authenticated/*` route used to repeat
 * the same `useRouteSeed` + `ErrorState` + `LoadingState` ladder; this is that
 * ladder, once.
 *
 * `children` receives the fetched data and renders the view. Each route still
 * owns its own page component, so React keeps a distinct component instance per
 * route and a view's local state resets on navigation.
 */
export function RouteSeedGate<T>({
	fetcher,
	prime,
	loadingLabel,
	children,
}: {
	fetcher: () => Promise<T>
	/** Cache entries to prime from the fetched data — see `useRouteSeed`. */
	prime: (result: T) => ISeedEntry<unknown>[]
	loadingLabel: string
	children: (data: T) => ReactNode
}) {
	const seed = useRouteSeed(fetcher, prime)

	if (seed.error) {
		return <ErrorState error={seed.error} onRetry={seed.retry} />
	}

	if (seed.isPending || !seed.data) {
		return <LoadingState label={loadingLabel} />
	}

	return <>{children(seed.data)}</>
}
