import { cn } from "cn"
import { EmptyState } from "#/components/ui/states"
import { formatNumber, formatPercent } from "#/libs/format"

export type TSpectrumKind = "clean" | "deleted" | "error" | "none"

export interface ISpectrumSegment {
	label: string
	value: number
	kind: TSpectrumKind
}

const SEG: Record<TSpectrumKind, string> = {
	clean: "seg-clean",
	deleted: "seg-deleted",
	error: "seg-error",
	none: "seg-none",
}

const DOT: Record<TSpectrumKind, string> = {
	clean: "verdict-dot-clean",
	deleted: "verdict-dot-deleted",
	error: "verdict-dot-error",
	none: "",
}

/**
 * The whole population as one bar, split by how each message was judged.
 *
 * This replaced a four-row ranked list. Verdict mix is a PROPORTION question —
 * "how much of everything was removed?" — and a single bar that sums to the
 * whole answers it at a glance, where four bars each scaled to their own max do
 * not (a 1% slice and a 90% slice looked like a long bar and a short one, with
 * the percentages relegated to small print).
 *
 * `none` ("no verdict yet") is hatched rather than coloured. Unjudged is an
 * absence, and PRODUCT.md is explicit that it must never be painted as clean.
 *
 * Segment widths arrive as `--seg-grow`, read by `.spectrum-seg`, because the
 * design gate rejects inline widths. A zero-value segment is not rendered at
 * all, so a verdict that has never happened is not a sliver.
 */
export function VerdictSpectrum({
	segments,
	emptyLabel = "Nothing captured yet",
	className,
}: {
	segments: ISpectrumSegment[]
	emptyLabel?: string
	className?: string
}) {
	const total = segments.reduce((sum, s) => sum + s.value, 0)

	if (total === 0) return <EmptyState title={emptyLabel} />

	return (
		<div className={cn("space-y-5", className)}>
			<div
				className="spectrum"
				role="img"
				aria-label={segments
					.map((s) => `${s.label} ${formatPercent((s.value / total) * 100)}`)
					.join(", ")}
			>
				{segments
					.filter((s) => s.value > 0)
					.map((s) => (
						<div
							key={s.label}
							className={cn("spectrum-seg", SEG[s.kind])}
							style={{ "--seg-grow": s.value } as React.CSSProperties}
							title={`${s.label}: ${formatNumber(s.value)}`}
						/>
					))}
			</div>

			<dl className="grid grid-cols-2 gap-x-6 gap-y-5 sm:grid-cols-4">
				{segments.map((s) => (
					<div key={s.label} className="min-w-0 border-l-2 border-rule pl-3">
						<dt className="field-label flex items-center gap-2">
							<span className={cn("verdict-dot", DOT[s.kind])} aria-hidden />
							<span className="truncate">{s.label}</span>
						</dt>
						<dd className="metric mt-1.5 text-3xl leading-none text-ink">
							{formatPercent((s.value / total) * 100)}
						</dd>
						<dd className="mt-1.5 font-mono text-xs text-ink-muted">
							{formatNumber(s.value)}
						</dd>
					</div>
				))}
			</dl>
		</div>
	)
}
