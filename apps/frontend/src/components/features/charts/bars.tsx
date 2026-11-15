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
 * Ranked list, set as a highlighted ledger.
 *
 * The magnitude is the row's own background: a lime wash that runs from the left
 * edge to `value / max` of the width, closed off by a 2px rule. The label and the
 * figure sit on top of it on one baseline. That replaces the old thin progress
 * line under each label, which read as a text list with decoration.
 *
 * The fill width arrives as a CSS custom property (`--meter-width`) which
 * styles.css reads in `.rank-fill`. That is what keeps the components free of
 * inline width/opacity declarations — the oxlint `shadcn/no-inline-styles` rule
 * enforces it, and it also means the per-bar value lives in exactly one place.
 *
 * Rank numerals are outlined, so the filled label is read first.
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
		<ol className={cn("border-t border-hairline", className)}>
			{data.map((datum, index) => {
				const pct = Math.min(100, (datum.value / max) * 100)
				return (
					<li key={`${datum.label}-${index}`} className="rank-row">
						<span
							className="rank-fill"
							style={{ "--meter-width": `${pct}%` } as React.CSSProperties}
							aria-hidden
						/>
						{showRank && (
							<span className="rank-num relative" aria-hidden>
								{index + 1}
							</span>
						)}
						<span className="relative min-w-0 flex-1 truncate text-sm text-ink">
							{datum.label}
						</span>
						<span className="reactor-count relative shrink-0 font-mono text-xs text-ink-soft">
							{datum.secondary ?? formatCompact(datum.value)}
						</span>
					</li>
				)
			})}
		</ol>
	)
}

const DIAL = {
	size: 220,
	center: 110,
	/** Inner radius: where every spoke starts. */
	inner: 46,
	/** Outer radius a spoke at the peak reaches. */
	outer: 90,
	label: 102,
} as const

/** Angle of an hour on the dial, in radians. 00:00 is at the top, clockwise. */
function hourAngle(hour: number): number {
	return (hour / 24) * Math.PI * 2 - Math.PI / 2
}

/**
 * Hour-of-day dial: 24 spokes on a ring, 00:00 at the top, clockwise.
 *
 * Length carries the count, and the peak hour is drawn in the signal colour and
 * named in the middle, so the dial answers "when" without a legend. A row of 24
 * identical cells answered the same question but gave the eye nothing to hold.
 *
 * Spoke colour is a token class on an SVG `line` (`stroke-ink`, `stroke-signal`)
 * and intensity is the `strokeOpacity` attribute, not an inline style or a
 * computed colour: the design gate rejects both, and a computed colour would
 * not follow a theme change.
 *
 * Every spoke carries a `<title>`, which is the native tooltip on hover and the
 * only per-hour readout the dial has — hence it spells out the hour and count.
 */
export function HourHeatmap({
	values,
	className,
	/** Accessible description. The panel that renders it owns the wording. */
	label = "Moderation actions by hour of day",
	emptyLabel = "No moderation activity in this window",
	/** What one spoke counts, for the tooltip. */
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

	const peak = values.reduce((best, v) => (v.total > best.total ? v : best))

	const spokes = values.map((bucket) => {
		const angle = hourAngle(bucket.hour)
		const intensity = bucket.total / max
		const reach =
			bucket.total > 0
				? DIAL.inner + 6 + intensity * (DIAL.outer - DIAL.inner - 6)
				: DIAL.inner + 2
		return {
			bucket,
			intensity,
			x1: DIAL.center + Math.cos(angle) * DIAL.inner,
			y1: DIAL.center + Math.sin(angle) * DIAL.inner,
			x2: DIAL.center + Math.cos(angle) * reach,
			y2: DIAL.center + Math.sin(angle) * reach,
		}
	})

	const ticks = [0, 6, 12, 18].map((hour) => ({
		hour,
		x: DIAL.center + Math.cos(hourAngle(hour)) * DIAL.label,
		y: DIAL.center + Math.sin(hourAngle(hour)) * DIAL.label,
	}))

	return (
		<div
			className={cn("flex flex-wrap items-center gap-x-8 gap-y-4", className)}
		>
			<svg
				viewBox={`0 0 ${DIAL.size} ${DIAL.size}`}
				className="dial shrink-0"
				role="img"
				aria-label={label}
			>
				<circle
					cx={DIAL.center}
					cy={DIAL.center}
					r={DIAL.inner - 4}
					className="fill-none stroke-hairline"
					strokeWidth="1"
					strokeDasharray="2 3"
				/>
				{spokes.map(({ bucket, intensity, x1, y1, x2, y2 }) => {
					const isPeak = bucket.hour === peak.hour
					return (
						<line
							key={bucket.hour}
							x1={x1}
							y1={y1}
							x2={x2}
							y2={y2}
							strokeWidth="5"
							className={
								bucket.total === 0
									? "stroke-hairline"
									: isPeak
										? "stroke-signal"
										: "stroke-ink"
							}
							strokeOpacity={bucket.total === 0 ? 1 : 0.3 + intensity * 0.7}
						>
							<title>
								{`${String(bucket.hour).padStart(2, "0")}:00 — ${formatNumber(bucket.total)} ${unit}`}
							</title>
						</line>
					)
				})}
				{ticks.map((tick) => (
					<text
						key={tick.hour}
						x={tick.x}
						y={tick.y}
						textAnchor="middle"
						dominantBaseline="central"
						fontSize="9"
						className="fill-ink-faint font-mono"
					>
						{String(tick.hour).padStart(2, "0")}
					</text>
				))}
				<text
					x={DIAL.center}
					y={DIAL.center - 4}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize="22"
					fontWeight="800"
					letterSpacing="-1"
					className="fill-ink"
				>
					{String(peak.hour).padStart(2, "0")}:00
				</text>
				<text
					x={DIAL.center}
					y={DIAL.center + 14}
					textAnchor="middle"
					dominantBaseline="central"
					fontSize="8"
					className="fill-ink-muted font-mono"
				>
					PEAK
				</text>
			</svg>

			<dl className="min-w-0 space-y-3 text-sm">
				<div>
					<dt className="field-label">Busiest hour</dt>
					<dd className="metric text-2xl text-ink">
						{String(peak.hour).padStart(2, "0")}:00
					</dd>
					<dd className="text-xs text-ink-muted">
						{formatNumber(peak.total)} {unit}
					</dd>
				</div>
				<div>
					<dt className="field-label">Quiet hours</dt>
					<dd className="metric text-2xl text-ink">
						{values.filter((v) => v.total === 0).length}
						<span className="ml-1 text-sm font-normal text-ink-muted">
							of 24
						</span>
					</dd>
				</div>
			</dl>
		</div>
	)
}
