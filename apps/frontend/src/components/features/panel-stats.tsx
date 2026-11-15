import { cn } from "cn"

/**
 * A small `dl` of labelled numbers for inside a section.
 *
 * Distinct from `StatTile` on purpose: a readout is a headline claim about a
 * list and links to it, while these are supporting figures for the section they
 * sit in — "12 480 edits across 3 402 messages" above the editor ranking. They
 * are not interactive and not linked, so they must not wear the readout's arrow;
 * an affordance that leads nowhere teaches the reader that affordances here mean
 * nothing.
 *
 * `value` is a STRING, pre-formatted by the caller. These figures are not
 * ticking on a socket push the way a headline counter is, and taking a
 * pre-formatted string keeps the formatter (number, percent, bytes, relative
 * time) in the section that knows which one it means.
 */
export interface IPanelStat {
	label: string
	value: string
	hint?: string
	tone?: "neutral" | "positive" | "warning" | "danger"
}

export function PanelStats({
	items,
	cols = 3,
	className,
}: {
	items: IPanelStat[]
	cols?: 2 | 3 | 4
	className?: string
}) {
	const grid = {
		2: "grid-cols-2",
		3: "grid-cols-2 sm:grid-cols-3",
		4: "grid-cols-2 sm:grid-cols-4",
	}[cols]

	const tone = {
		neutral: "text-ink",
		positive: "text-signal",
		warning: "text-amber",
		danger: "text-vermilion",
	}

	return (
		<dl className={cn("grid gap-x-6 gap-y-5", grid, className)}>
			{items.map((item) => (
				<div key={item.label} className="min-w-0 border-l-2 border-rule pl-3">
					<dt className="field-label truncate">{item.label}</dt>
					<dd
						className={cn(
							"metric mt-1.5 truncate text-3xl leading-none",
							tone[item.tone ?? "neutral"],
						)}
					>
						{item.value}
					</dd>
					{item.hint && (
						<p className="mt-1.5 truncate text-xs text-ink-muted">
							{item.hint}
						</p>
					)}
				</div>
			))}
		</dl>
	)
}
