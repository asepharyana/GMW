import { cn } from "cn"

/**
 * A small `dl` of labelled numbers for inside a panel.
 *
 * Distinct from `StatTile` on purpose: a tile is a headline claim about a list
 * and links to it, while these are supporting figures for the panel they sit
 * in — "12 480 edits across 3 402 messages" above the editor ranking. They are
 * not interactive and not linked, so they must not wear the tile's chevron or
 * hover treatment; an affordance that leads nowhere teaches the reader that
 * affordances here mean nothing.
 *
 * `value` is a STRING, pre-formatted by the caller. These figures are not
 * ticking on a socket push the way a headline counter is, and taking a
 * pre-formatted string keeps the formatter (number, percent, bytes, relative
 * time) in the panel that knows which one it means.
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
		<dl className={cn("grid gap-3", grid, className)}>
			{items.map((item) => (
				<div key={item.label} className="min-w-0">
					<dt className="field-label truncate">{item.label}</dt>
					<dd
						className={cn(
							"metric mt-1 truncate text-title",
							tone[item.tone ?? "neutral"],
						)}
					>
						{item.value}
					</dd>
					{item.hint && (
						<p className="mt-0.5 truncate text-xs text-ink-faint">
							{item.hint}
						</p>
					)}
				</div>
			))}
		</dl>
	)
}
