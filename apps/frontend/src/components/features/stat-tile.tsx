import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ArrowUpRight } from "lucide-react"
import { formatNumber } from "#/libs/format"
import { Ticker } from "#/libs/motion"

/**
 * Readout.
 *
 * A readout is a label, a number and a hint — and nothing around them. It sits
 * in a `StatGrid`, which divides readouts with 1px rules instead of putting a
 * box round each one.
 *
 * -- Why `to` exists (W2) ----------------------------------------------
 * A headline number is a claim about a list. "In queue 419" is only useful if
 * 419 is one click from the 419 rows that make it up, and every readout on the
 * dashboard used to be inert text -- including the one existing drill-down link
 * in the app, which pointed at a filter the target view did not read.
 *
 * So a readout WITH a `to` renders as a `Link` and becomes a control; one
 * WITHOUT stays a `div`. The arrow appears only in the navigable case, because
 * an affordance that shows on a non-interactive element teaches the user that
 * affordances here mean nothing. It is always visible rather than revealed on
 * hover, because a touch screen has no hover.
 *
 * -- Why `value` is a number and not a string ---------------------------
 * A readout whose figure changes under a WS push has to show that it changed,
 * or the reader cannot tell a fresh number from a stale one. Taking the raw
 * number plus a formatter is what lets the value tick to its new state
 * (`Ticker`). A readout whose value is not a number at all — a clock hour, a
 * date — passes a string instead and renders plainly.
 *
 * The `hint` is folded into the accessible name so a screen reader announces
 * the context, not just the number.
 */
export function StatTile({
	label,
	value,
	format = formatNumber,
	placeholder = "—",
	hint,
	tone = "neutral",
	to,
	/** The exact, unabbreviated number. See "Why `exact` exists" below. */
	exact,
	className,
}: {
	label: string
	/** Raw value: a number ticks, a string renders as given, null is a placeholder. */
	value: number | string | null | undefined
	format?: (n: number) => string
	placeholder?: string
	hint?: string
	tone?: "neutral" | "positive" | "warning" | "danger"
	/** When set, the whole readout becomes a link to this route. */
	to?: string
	/**
	 * The exact value behind an abbreviated `value`, e.g. `"49.724"` for
	 * `"49,7 rb"`. Rendered as a native tooltip on the number and announced
	 * after it for assistive tech.
	 */
	exact?: string
	className?: string
}) {
	const valueTone = {
		neutral: "text-ink",
		positive: "text-signal",
		warning: "text-amber",
		danger: "text-vermilion",
	}[tone]

	const display =
		value == null
			? placeholder
			: typeof value === "number"
				? format(value)
				: value

	// A formatter returns "—" for a missing value, so an `exact` built from the
	// same data would attach a tooltip and an sr-only "(—)" to a readout that
	// has nothing to say. Only carry it when there is a number behind it.
	const exactText = value == null ? undefined : exact

	const body = (
		<>
			<p className="field-label flex items-center justify-between gap-2">
				<span className="truncate">{label}</span>
				{/* aria-hidden because the link's own accessible name already carries
            label + value + hint. */}
				{to && (
					<ArrowUpRight
						className="size-3.5 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5 group-hover:text-signal"
						aria-hidden
					/>
				)}
			</p>
			{/*
        `exact` exists because the headline numbers are abbreviated with
        `Intl.NumberFormat("id-ID")` compact notation, which renders 49,724 as
        "49,7 rb" — "rb" being *ribu*, Indonesian for thousand. That is correct
        localisation and correct at a glance, but it is a real comprehension
        barrier for anyone who does not read the suffix, and it is the one thing
        on this dashboard that stops a number from being verifiable at a glance.

        The exact figure goes in `title` (hover, and the native tooltip on
        keyboard focus) and in `sr-only` text, so it reaches both sighted users
        and screen readers without making the visual value any longer. Only
        emitted when the caller actually has a different string to show, so a
        readout that is not abbreviated does not gain a redundant tooltip.
      */}
			<p
				className={cn("metric-xl mt-5", valueTone)}
				{...(exactText ? { title: exactText } : {})}
			>
				{typeof value === "number" ? (
					<Ticker value={value} format={format} placeholder={placeholder} />
				) : (
					display
				)}
				{exactText && <span className="sr-only"> ({exactText})</span>}
			</p>
			{hint && <p className="mt-2 truncate text-xs text-ink-muted">{hint}</p>}
		</>
	)

	if (to) {
		return (
			<Link
				to={to}
				className={cn(
					"group block min-w-0 bg-canvas px-4 pt-3.5 pb-4 transition-colors hover:bg-surface-2",
					className,
				)}
				aria-label={`${label}: ${display}${exactText ? ` (${exactText})` : ""}${hint ? `. ${hint}` : ""}`}
			>
				{body}
			</Link>
		)
	}

	return (
		<div className={cn("min-w-0 bg-canvas px-4 pt-3.5 pb-4", className)}>
			{body}
		</div>
	)
}

/**
 * A row of readouts. Ruled, not boxed: the 1px `gap-px` over a hairline ground
 * draws the dividers, which keeps them correct when the grid wraps to two
 * columns on a phone (a `border-left` on every cell does not).
 */
export function StatGrid({
	children,
	cols = 4,
	className,
}: {
	children: React.ReactNode
	cols?: 2 | 3 | 4
	className?: string
}) {
	const grid = {
		2: "grid-cols-2",
		3: "grid-cols-2 lg:grid-cols-3",
		4: "grid-cols-2 lg:grid-cols-4",
	}[cols]

	return (
		<div
			className={cn(
				"grid gap-px border-y border-rule bg-hairline",
				grid,
				className,
			)}
		>
			{children}
		</div>
	)
}
