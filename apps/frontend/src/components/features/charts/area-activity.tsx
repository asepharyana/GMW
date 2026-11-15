import { cn } from "cn"
import { useMemo } from "react"
import { EmptyState } from "#/components/ui/states"
import { formatCompact, formatNumber } from "#/libs/format"

export interface ISeriesPoint {
	label: string
	value: number
	flagged?: number
}

/**
 * Daily volume as columns, in two lanes.
 *
 * The export keeps its old name (`AreaChart`) because the dashboard imports it,
 * but it is no longer an area: it is one column per day, which reads as "a
 * count per day" without asking the reader to interpret a slope.
 *
 * TWO LANES, EACH ON ITS OWN SCALE. The first version drew deletions as a dashed
 * line over the message area, scaled to its own peak, and said so in a footer.
 * On the message axis a deletion is 1-2% of a day's volume, so sharing a scale
 * would flatten it to a pixel above the baseline — but an unlabelled dual axis
 * is how a chart lies, and a footnote is easy to miss. Two lanes make the
 * separation structural: each has its own heading with its own peak, and no
 * shape in one can be compared by height with a shape in the other.
 *
 * The busiest day is the lime column. Heights travel as a `--bar-h` custom
 * property read by `.col-bar`, because the design gate rejects inline heights.
 */
export function AreaChart({
	data,
	height = 144,
	className,
}: {
	data: ISeriesPoint[]
	height?: number
	className?: string
}) {
	const geometry = useMemo(() => {
		if (data.length === 0) return null
		const max = Math.max(1, ...data.map((d) => d.value))
		const flaggedMax = Math.max(0, ...data.map((d) => d.flagged ?? 0))
		const total = data.reduce((sum, d) => sum + d.value, 0)
		const flaggedTotal = data.reduce((sum, d) => sum + (d.flagged ?? 0), 0)
		let peak = 0
		data.forEach((d, i) => {
			if (d.value > (data[peak]?.value ?? 0)) peak = i
		})
		return { max, flaggedMax, total, flaggedTotal, peak }
	}, [data])

	if (!geometry || data.length === 0) {
		return <EmptyState title="No activity in this window" />
	}

	return (
		<div
			className={cn("space-y-5", className)}
			role="img"
			aria-label={
				geometry.flaggedMax > 0
					? `Messages per day, peak ${formatCompact(geometry.max)}, with daily deletions in a second lane, deleted peak ${formatCompact(geometry.flaggedMax)}`
					: `Messages per day, peak ${formatCompact(geometry.max)}`
			}
		>
			<div>
				<div className="mb-2 flex items-baseline justify-between gap-3">
					<span className="field-label">Messages per day</span>
					<span className="text-xs text-ink-muted">
						Peak{" "}
						<span className="font-mono text-ink">
							{formatCompact(geometry.max)}
						</span>
						<span className="ml-3 font-mono text-micro text-ink-faint">
							{formatCompact(geometry.total)} total
						</span>
					</span>
				</div>
				<div
					className="col-lane"
					style={{ "--lane-height": `${height}px` } as React.CSSProperties}
				>
					{data.map((d, i) => (
						<div
							key={d.label}
							className="col-cell"
							title={`${d.label} — ${formatNumber(d.value)} messages`}
						>
							<div
								className={cn("col-bar", i === geometry.peak && "col-bar-hot")}
								style={
									{
										"--bar-h": `${(d.value / geometry.max) * 100}%`,
									} as React.CSSProperties
								}
							/>
						</div>
					))}
				</div>
			</div>

			{geometry.flaggedMax > 0 && (
				<div>
					<div className="mb-2 flex items-baseline justify-between gap-3">
						<span className="field-label">Deleted per day</span>
						<span className="text-xs text-ink-muted">
							Peak{" "}
							<span className="font-mono text-ink">
								{formatCompact(geometry.flaggedMax)}
							</span>
							<span className="ml-3 font-mono text-micro text-ink-faint">
								{formatCompact(geometry.flaggedTotal)} total · own scale
							</span>
						</span>
					</div>
					<div
						className="col-lane"
						style={{ "--lane-height": "3.25rem" } as React.CSSProperties}
					>
						{data.map((d) => (
							<div
								key={d.label}
								className="col-cell"
								title={`${d.label} — ${formatNumber(d.flagged ?? 0)} deleted`}
							>
								<div
									className="col-bar col-bar-del"
									style={
										{
											"--bar-h": `${((d.flagged ?? 0) / geometry.flaggedMax) * 100}%`,
										} as React.CSSProperties
									}
								/>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Axis labels only at the ends and middle: on a narrow screen more than
          three labels collide, and the peak above now carries the magnitude. */}
			<div className="flex justify-between font-mono text-micro text-ink-faint">
				<span>{data[0]?.label}</span>
				<span>{data[Math.floor(data.length / 2)]?.label}</span>
				<span>{data[data.length - 1]?.label}</span>
			</div>
		</div>
	)
}
