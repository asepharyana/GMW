// Explicit ReactNode import: this file used `ReactNode` with no React
// import, relying on the @types/react UMD global leaking in. That compiles only
// while nothing else forces a value import — name the type directly instead.

import { cn } from "cn"
import type { ReactNode } from "react"

/**
 * A section of the page: a heavy rule, a heading, a body. No box.
 *
 * The previous panel wore a hairline on four sides, a title bar and a hover
 * border, and ten of them in a grid is what made the dashboard read as a
 * template. A section is now divided from its neighbours by a single ink rule
 * (`desk-section` in styles.css) and the reader's eye is led by type size and
 * whitespace instead of by containers.
 *
 * Two layouts, chosen by where the section sits:
 *
 *  - `stack`  — heading above body. For a section inside a column (the
 *               default, and what `SectionGrid` children want).
 *  - `split`  — heading in a left margin column, body on the right, from `lg`.
 *               For a full-width section; the margin is where the explanation
 *               lives, so the body gets the whole measure.
 *
 * `index` is the outlined folio ("02"). It is optional because a section
 * nested inside another one should not number itself.
 */
export function Section({
	title,
	description,
	action,
	children,
	className,
	bodyClassName,
	index,
	layout = "stack",
}: {
	title?: string
	description?: string
	action?: ReactNode
	children: ReactNode
	className?: string
	bodyClassName?: string
	index?: string
	layout?: "stack" | "split"
}) {
	const hasHeader = Boolean(title || action || index)

	const header = hasHeader && (
		<header
			className={cn(
				"min-w-0",
				layout === "split" ? "lg:pr-2" : "mb-5 flex items-start gap-4",
			)}
		>
			{index && <p className="folio shrink-0">{index}</p>}
			<div
				className={cn(
					"min-w-0",
					layout === "split" ? "mt-3 lg:mt-4" : "flex-1 pt-0.5",
				)}
			>
				{title && (
					<h2 className="text-title leading-tight font-extrabold tracking-tight text-ink">
						{title}
					</h2>
				)}
				{description && (
					<p className="mt-1.5 max-w-prose text-xs leading-relaxed text-ink-muted">
						{description}
					</p>
				)}
				{action && layout === "split" && <div className="mt-3">{action}</div>}
			</div>
			{action && layout === "stack" && <div className="shrink-0">{action}</div>}
		</header>
	)

	if (layout === "split") {
		return (
			<section
				className={cn(
					"desk-section grid grid-cols-1 gap-x-10 gap-y-5 lg:grid-cols-[14rem_minmax(0,1fr)]",
					className,
				)}
			>
				{header}
				<div className={cn("min-w-0", bodyClassName)}>{children}</div>
			</section>
		)
	}

	return (
		<section className={cn("desk-section", className)}>
			{header}
			<div className={cn("min-w-0", bodyClassName)}>{children}</div>
		</section>
	)
}

/** A responsive grid of sections. `cols` is the desktop column count. */
export function SectionGrid({
	children,
	cols = 2,
	className,
}: {
	children: ReactNode
	cols?: 1 | 2 | 3 | 4
	className?: string
}) {
	const gridCols = {
		1: "lg:grid-cols-1",
		2: "lg:grid-cols-2",
		3: "lg:grid-cols-3",
		4: "lg:grid-cols-2 xl:grid-cols-4",
	}[cols]

	return (
		<div
			className={cn(
				// `items-start` so a section is as tall as its own content. The default
				// `stretch` forced every section in a row to the height of the tallest,
				// which left a short ranked list sitting above a long empty run.
				"grid grid-cols-1 items-start gap-x-12 gap-y-12 md:grid-cols-2",
				gridCols,
				className,
			)}
		>
			{children}
		</div>
	)
}
