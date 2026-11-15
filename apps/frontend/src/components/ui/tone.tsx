import { cn } from "cn"

/**
 * Status chip for moderation state.
 *
 * Maps the dashboard's four semantic tones onto the `verdict-chip` treatment
 * from styles.css: a square-cornered hairline, a mono caps label, and a dot in
 * the tone colour. The chip is a SMALL FACT, not a button, which is why it is no
 * longer built on the shadcn pill `Badge` — a pill reads as something to click.
 *
 * The tone colour lives on the dot and the label, never on the border or the
 * fill: a verdict colour is only allowed to be a fill on a 7px dot.
 */
export type TTone = "neutral" | "positive" | "warning" | "danger"

const TONE_DOT = {
	neutral: "bg-ink-faint",
	positive: "bg-success",
	warning: "bg-amber",
	danger: "bg-vermilion",
} as const satisfies Record<TTone, string>

const TONE_TEXT = {
	neutral: "text-ink-muted",
	positive: "text-ink-soft",
	warning: "text-amber",
	danger: "text-vermilion",
} as const satisfies Record<TTone, string>

export function Badge({
	children,
	tone = "neutral",
	className,
}: {
	children: React.ReactNode
	tone?: TTone
	className?: string
}) {
	return (
		<span className={cn("verdict-chip", TONE_TEXT[tone], className)}>
			<span
				className={cn("size-1.5 rounded-full", TONE_DOT[tone])}
				aria-hidden
			/>
			{children}
		</span>
	)
}
