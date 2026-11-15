import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { formatNumber } from "#/libs/format"
import type { IQueueOverview } from "#/libs/types"

type TStationTone = "live" | "warn" | "bad" | "done"

interface IStation {
	key: string
	label: string
	value: number
	/** What the node looks like when the count is non-zero. */
	tone: TStationTone
	/** One plain sentence, for readers who do not know the word. */
	gloss: string
}

const NODE: Record<TStationTone, string> = {
	live: "pipe-node-live",
	warn: "pipe-node-warn",
	bad: "pipe-node-bad",
	done: "pipe-node-done",
}

/**
 * Queue health as a flow: stations along a dashed line, each carrying its count.
 *
 * It replaced a ranked-bar list, which ranked pipeline states against each other
 * as though "Queued" and "Abandoned" were competing categories. They are
 * positions on a path, and the path is the point: a message is captured, queued,
 * analysed, and judged — and the three stations at the right are where it can
 * fall off.
 *
 * A node is hollow at zero and filled when something is in it, so a quiet
 * pipeline reads as an empty line, not as a row of green. The fill colour is the
 * state's own tone: lime for work in flight, amber for retrying, coral for the
 * one state that means "the worker gave up and nobody will ever judge this".
 *
 * `dead` is called out separately in words below: folding it into "queued" would
 * hide a stuck pipeline behind a healthy-looking backlog. Nothing here waits on
 * a person — the pipeline is full-auto — so this is a health signal, not a work
 * queue.
 */
export function PipelineFlow({
	queue,
	className,
}: {
	queue: IQueueOverview | undefined
	className?: string
}) {
	if (!queue) return null

	const stations: IStation[] = [
		{
			key: "pending",
			label: "Queued",
			value: queue.pending,
			tone: "live",
			gloss: "Captured, waiting for the model",
		},
		{
			key: "claimed",
			label: "Analyzing",
			value: queue.claimed,
			tone: "live",
			gloss: "The model is reading it now",
		},
		{
			key: "retry_wait",
			label: "Retrying",
			value: queue.retry_wait,
			tone: "warn",
			gloss: "Failed once, will try again",
		},
		{
			key: "dead",
			label: "Abandoned",
			value: queue.dead,
			tone: "bad",
			gloss: "Retries ran out; no verdict will come",
		},
		{
			key: "skipped",
			// Terminal like `analyzed`. Not an alert: the channel is exempt on
			// purpose.
			label: "Not moderated",
			value: queue.skipped,
			tone: "done",
			gloss: "Channel is exempt by design",
		},
		{
			key: "error",
			label: "Errored verdict",
			value: queue.error,
			tone: "warn",
			gloss: "The model could not read it",
		},
	]

	return (
		<div className={cn("space-y-5", className)}>
			<ol className="relative grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 xl:grid-cols-6">
				{/* The path. Only drawn where the six stations share one row; when the
            grid wraps the line would run through the gap between rows. */}
				<span className="pipe-line hidden xl:block" aria-hidden />
				{stations.map((s) => (
					<li key={s.key} className="relative min-w-0">
						<span
							className={cn("pipe-node relative", s.value > 0 && NODE[s.tone])}
							aria-hidden
						/>
						<p className="metric mt-3 text-4xl leading-none text-ink">
							{formatNumber(s.value)}
						</p>
						<p className="mt-2 text-sm font-bold text-ink">{s.label}</p>
						<p className="mt-0.5 max-w-40 text-xs leading-snug text-ink-muted">
							{s.gloss}
						</p>
					</li>
				))}
			</ol>

			{queue.dead > 0 && (
				<p className="border-l-4 border-vermilion bg-surface py-2.5 pr-3 pl-3 text-xs text-ink-soft">
					<span className="font-bold text-vermilion">
						{formatNumber(queue.dead)} message{queue.dead === 1 ? "" : "s"}
					</span>{" "}
					exhausted their retries and will not be judged automatically.{" "}
					<Link
						to="/messages"
						search={{ status: "dead" }}
						className="font-bold underline underline-offset-2"
					>
						Inspect them
					</Link>
					.
				</p>
			)}
		</div>
	)
}
