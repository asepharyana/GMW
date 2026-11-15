import { cn } from "cn"
import { useMemo } from "react"
import { EmptyState } from "#/components/ui/states"
import { formatCompact, formatNumber } from "#/libs/format"

export interface IBarDatum {
	label: string
	value: number
	/** Optional secondary figure shown on the right of the row. */
	secondary?: string
}

/**
 * Horizontal ranked bar list.
 *
 * The bar width arrives as a CSS custom property (`--meter-width`) which
 * styles.css reads in `.meter-fill`. That is what keeps the components free of
 * inline width/opacity declarations — the oxlint `shadcn/no-inline-styles` rule
 * enforces it, and it also means the per-bar value lives in exactly one place.
 */
export function RankedBars({
	data,
	max: providedMax,
	emptyLabel = "No data in this window",
	showRank = false,
	className,
}: {
	data: IBarDatum[]
	max?: number
	emptyLabel?: string
	showRank?: boolean
	className?: string
}) {
	const max = useMemo(
		() => providedMax ?? Math.max(1, ...data.map((d) => d.value)),
		[data, providedMax],
	)

	if (data.length === 0) {
		return <EmptyState title={emptyLabel} />
	}

	return (
		<ol className={cn("space-y-2", className)}>
			{data.map((datum, index) => {
				const pct = Math.min(100, (datum.value / max) * 100)
				return (
					<li key={`${datum.label}-${index}`} className="space-y-1">
						<div className="flex items-baseline gap-2 text-xs">
							{showRank && (
								<span className="w-4 shrink-0 font-mono text-ink-faint">
									{index + 1}
								</span>
							)}
							<span className="min-w-0 flex-1 truncate text-ink-soft">
								{datum.label}
							</span>
							<span className="reactor-count shrink-0 text-ink-muted">
								{datum.secondary ?? formatCompact(datum.value)}
							</span>
						</div>
						{/* 5px, and the track is a mix of ink rather than `surface-2`: on a
                dark panel a 4px bar in the same surface step as its own background
                is invisible, which made a ranked list look like a text list. */}
						<div className="bar-track">
							<div
								className="bar-fill meter-fill"
								style={{ "--meter-width": `${pct}%` } as React.CSSProperties}
							/>
						</div>
					</li>
				)
			})}
		</ol>
	)
}

/**
 * Hour-of-day heatmap: 24 columns, intensity from a token colour.
 *
 * Cell colour also goes through a custom property (`.heat-cell` →
 * `--heat-color`) for the same no-inline-styles reason, and because the value
 * must sit on the token ramp (`--color-surface-2` → `--color-signal`) rather
 * than an arbitrary hue.
 */
export function HourHeatmap({
	values,
	className,
	/** Accessible description. The panel that renders it owns the wording. */
	label = "Moderation actions by hour of day",
	emptyLabel = "No moderation activity in this window",
	/** What one cell counts, for the tooltip. */
	unit = "actions",
}: {
	values: Array<{ hour: number; total: number }>
	className?: string
	label?: string
	emptyLabel?: string
	unit?: string
}) {
	const max = Math.max(1, ...values.map((v) => v.total))
	const hasAny = values.some((v) => v.total > 0)

	if (!hasAny) {
		return <EmptyState title={emptyLabel} />
	}

	return (
		<div className={cn("space-y-2", className)}>
			<div className="flex items-end gap-0.5" role="img" aria-label={label}>
				{values.map((bucket) => {
					// Intensity travels as an OPACITY, not a colour: the cell is painted
					// with the `--color-signal` token and faded. Interpolating a
					// colour-mix in JS would hardcode a colour per cell, which the design
					// gate rejects and which would not follow a theme change.
					const intensity = bucket.total / max

					return (
						<div
							key={bucket.hour}
							className="heat-cell h-8 flex-1 rounded-sm"
							style={
								{
									"--heat-intensity": intensity.toFixed(3),
								} as React.CSSProperties
							}
							title={`${String(bucket.hour).padStart(2, "0")}:00 — ${formatNumber(bucket.total)} ${unit}`}
						/>
					)
				})}
			</div>
			<div className="flex justify-between font-mono text-micro text-ink-faint">
				<span>00</span>
				<span>06</span>
				<span>12</span>
				<span>18</span>
				<span>23</span>
			</div>
		</div>
	)
}
