import { cn } from "cn"
import { AlertCircle, Inbox, Loader2, RefreshCw, SearchX } from "lucide-react"
import { Button } from "#/components/ui/button"

/**
 * Loading / empty / error states.
 *
 * The contract every view follows: an error is ALWAYS paired with a retry that
 * calls the hook's `mutate`. An `ErrorState` without `onRetry` strands the user
 * on a dead panel until they reload the whole page by hand — that was the
 * default in the previous frontend, and it is why `onRetry` is required by type
 * rather than optional.
 *
 * None of these is a box. An empty or failed region is a ruled strip with the
 * message set left, so it reads as part of the page instead of as a second,
 * smaller card sitting inside it.
 */
export function LoadingState({
	label = "Loading",
	className,
}: {
	label?: string
	className?: string
}) {
	return (
		<div
			className={cn(
				"flex items-center gap-3 border-y border-rule py-10 font-mono text-xs tracking-widest text-ink-muted uppercase",
				className,
			)}
			role="status"
		>
			<Loader2 className="size-4 animate-spin text-signal" aria-hidden />
			<span>{label}…</span>
		</div>
	)
}

export function ErrorState({
	error,
	onRetry,
	className,
}: {
	error: unknown
	onRetry?: () => void
	className?: string
}) {
	const message =
		error instanceof Error
			? error.message
			: typeof error === "string"
				? error
				: "Unknown error"

	return (
		<div
			className={cn(
				"flex flex-wrap items-center gap-x-4 gap-y-3 border-l-4 border-vermilion bg-surface py-4 pr-4 pl-4",
				className,
			)}
			role="alert"
		>
			<AlertCircle className="size-5 shrink-0 text-vermilion" aria-hidden />
			<div className="min-w-0 flex-1 space-y-0.5">
				<p className="text-sm font-bold text-ink">Failed to load</p>
				<p className="max-w-md text-xs break-words text-ink-muted">{message}</p>
			</div>
			{onRetry && (
				<Button variant="outline" size="sm" onClick={onRetry}>
					<RefreshCw aria-hidden />
					Retry
				</Button>
			)}
		</div>
	)
}

/** Nothing matched — distinct from "failed to load". */
export function EmptyState({
	title = "Nothing here yet",
	description,
	action,
	className,
}: {
	title?: string
	description?: string
	action?: React.ReactNode
	className?: string
}) {
	return (
		<div
			className={cn(
				"flex items-start gap-3 border-y border-dashed border-hairline py-5",
				className,
			)}
		>
			<Inbox className="mt-0.5 size-4 shrink-0 text-ink-faint" aria-hidden />
			<div className="min-w-0 space-y-1">
				<p className="text-sm text-ink-soft">{title}</p>
				{description && (
					<p className="max-w-md text-xs text-ink-muted">{description}</p>
				)}
				{action}
			</div>
		</div>
	)
}

export function NoResultsState({ query }: { query: string }) {
	return (
		<div className="flex items-center gap-3 border-y border-dashed border-hairline py-5">
			<SearchX className="size-4 shrink-0 text-ink-faint" aria-hidden />
			<p className="text-sm text-ink-soft">No matches for “{query}”</p>
		</div>
	)
}
