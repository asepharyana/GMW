import { cn } from "cn"

/**
 * A moderation record, as a dossier.
 *
 * This was "the Record Office" (paper, oxblood stamp), then a hairline slip with
 * a coloured left tab. It is now a full-height page-within-the-page: the
 * verdict is the largest word on it, the message is quoted, and the evidence
 * follows. The evidence model did not change, and it is still the point.
 *
 * PRODUCT.md makes the evidence trail the product's positioning: a deletion is
 * only defensible in public if nothing in it is unexplained. So this renders the
 * things a member needs to judge the call themselves — the message as posted,
 * the policy clause it was judged against, and the reason the model gave — and
 * it never collapses them into a single "status" word.
 *
 * TWO DIFFERENT QUESTIONS, TWO DIFFERENT PLACES. `ai_status` is where a message
 * sits in the queue and `verdicts.status` is what was decided. A dossier shows
 * the decision; the queue lives in the band beneath it. Rendering both in one
 * pill is the flattening PRODUCT.md forbids.
 *
 * An `error` verdict is NOT a soft delete: it means the model could not read
 * the message, so nothing was removed. The record is honest about that rather
 * than quietly showing a deletion — the headline reads "Not judged" and the
 * reason fields are withheld.
 */

/** Verdict statuses, exactly as the backend emits them. */
export type TSlipVerdict = "clean" | "deleted" | "error"

/**
 * The verdict colour per outcome. Coral is spent only on `deleted`, slate on
 * `clean` (nothing was done, which is not praise), and `error` takes the muted
 * ink — an unread message is not an alert, it is an absence. Each is a named
 * token class, never a raw hex: `shadcn/no-raw-colors` forbids one at the JSX
 * site.
 */
const VERDICT_BAR: Record<TSlipVerdict, string> = {
	deleted: "bg-vermilion",
	clean: "bg-success",
	error: "bg-ink-faint",
}

const VERDICT_TEXT: Record<TSlipVerdict, string> = {
	deleted: "text-vermilion",
	clean: "text-success",
	error: "text-ink-muted",
}

/**
 * Plain-language status line. PRODUCT.md's reader is the public membership, not
 * a trained moderation team, so `error` must never surface as the bare word:
 * the honest sentence is that nothing was removed, and why.
 */
const VERDICT_COPY: Record<TSlipVerdict, string> = {
	deleted: "Removed",
	clean: "Kept — no rule matched",
	error: "Not judged — nothing was removed",
}

/** The headline word on the dossier. Shorter than the status line on purpose. */
const VERDICT_HEADLINE: Record<TSlipVerdict, string> = {
	deleted: "Removed",
	clean: "Kept",
	error: "Not judged",
}

function SlipStatus({
	verdict,
	className,
}: {
	verdict: TSlipVerdict
	className?: string
}) {
	return (
		<span className={cn("inline-flex items-center gap-1.5", className)}>
			<span
				aria-hidden
				className={cn("size-1.5 shrink-0 rounded-full", VERDICT_BAR[verdict])}
			/>
			<span className="font-medium">{VERDICT_COPY[verdict]}</span>
		</span>
	)
}

/**
 * One labelled field on a dossier. `value` is rendered as given: this component
 * never fabricates a missing field, so callers pass an explicit "—" or an
 * honest sentence rather than letting an empty cell imply the field was blank
 * on the record.
 *
 * The label sits above the value, not in a fixed column: the longest label
 * ("Reason given by the model") is 198px of tracked mono, wider than any sane
 * label column, and stacking it lets the value take the full measure.
 */
function SlipField({
	label,
	value,
	mono = false,
}: {
	label: string
	value: string
	mono?: boolean
}) {
	return (
		<div className="border-t border-hairline py-3 first:border-t-0">
			<dt className="field-label">{label}</dt>
			<dd
				className={cn(
					"mt-1.5 text-sm leading-relaxed text-ink-soft",
					mono && "font-mono text-xs tracking-wide",
				)}
			>
				{value}
			</dd>
		</div>
	)
}

/**
 * A 0..1 confidence on a ruled scale, with an optional delete-threshold mark.
 *
 * A bare "0.92" asks the reader to know whether that is high; the scale puts it
 * against the ends, and the coral tick puts it against the line the auto-delete
 * actually used. Positions travel as custom properties (`--gauge-pos`,
 * `--gauge-threshold`), because the design gate rejects inline widths.
 */
function ConfidenceGauge({
	confidence,
	threshold,
}: {
	confidence: number
	threshold: number | null | undefined
}) {
	const clamp = (n: number) => Math.min(100, Math.max(0, n * 100))
	return (
		<div className="border-t border-hairline py-3">
			<p className="field-label">Confidence</p>
			<div
				className="gauge-track mt-3"
				style={
					{ "--gauge-pos": `${clamp(confidence)}%` } as React.CSSProperties
				}
				role="img"
				aria-label={`Confidence ${confidence.toFixed(2)} out of 1`}
			>
				<div className="gauge-fill" />
				{threshold != null && (
					<div
						className="gauge-mark"
						style={
							{
								"--gauge-threshold": `${clamp(threshold)}%`,
							} as React.CSSProperties
						}
					/>
				)}
			</div>
			<div className="mt-1.5 flex justify-between font-mono text-micro text-ink-faint">
				<span>0</span>
				<span>1</span>
			</div>
			<p className="mt-1 font-mono text-xs tracking-wide text-ink-soft">
				{threshold != null
					? `${confidence.toFixed(2)} · delete threshold ${threshold.toFixed(2)}`
					: confidence.toFixed(2)}
			</p>
		</div>
	)
}

/**
 * The consulted record: the one the reader has opened.
 *
 * `active` marks it as the page's subject — it takes a lime rule under the
 * header, and nothing else on the page does, so "what am I reading" is answered
 * before the type is.
 */
export function RecordSlip({
	caseId,
	channel,
	verdict,
	message,
	reason,
	clause,
	evidence,
	confidence,
	threshold,
	decidedAt,
	active = false,
	className,
}: {
	/** The record number a member quotes back. Stable, human-quotable. */
	caseId: string
	channel: string
	verdict: TSlipVerdict
	/** The message as it was posted. Omitted when no text was captured. */
	message?: string | null
	/** Why the model decided this. Empty is rendered honestly, never hidden. */
	reason: string | null | undefined
	/** The policy clause it was judged against, e.g. "3.4 Scam links". */
	clause: string | null | undefined
	/** Quoted spans the model cited. Evidence, not decoration. */
	evidence: string[] | null | undefined
	confidence: number | null | undefined
	/** The auto-delete threshold this call was measured against. */
	threshold: number | null | undefined
	decidedAt: string
	active?: boolean
	className?: string
}) {
	return (
		<article className={cn("desk-section", className)}>
			<header
				className={cn(
					"flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 pb-3",
					active && "border-b-4 border-lime",
				)}
			>
				<p className="case-id">{caseId}</p>
				<p className="case-id">{decidedAt}</p>
			</header>

			<div className="pt-6">
				<p className="field-label">{channel}</p>
				{/*
				 * The verdict is the largest word on the dossier. A member who arrived
				 * to ask "was my message removed?" gets the answer before reading
				 * anything else — and the three states are three different words, not
				 * a colour change on one.
				 */}
				<p className={cn("mega-md mt-3", VERDICT_TEXT[verdict])}>
					{VERDICT_HEADLINE[verdict]}
				</p>
				{/* The headline already says "Removed"; repeating it as a status line
				    is noise. The other two verdicts need their sentence, because
				    "Kept" and "Not judged" are not self-explanatory to a member. */}
				{verdict !== "deleted" && (
					<p className="mt-3 text-sm text-ink-muted">
						<SlipStatus verdict={verdict} />
					</p>
				)}
			</div>

			{message && (
				<figure className="mt-8">
					<figcaption className="field-label">The message</figcaption>
					<blockquote className="mt-2 border-l-4 border-rule py-1 pl-4 text-lg leading-snug break-words whitespace-pre-wrap text-ink">
						{message}
					</blockquote>
				</figure>
			)}

			<div className="mt-8">
				{/*
				 * Three verdicts need three different questions, not two.
				 *
				 * "Why was it kept" is wrong for an UNJUDGED record: nothing was
				 * judged, so nothing was kept — the message is still in the channel
				 * and no rule was ever applied to it. Asking why it was kept
				 * invites the reader to believe a decision was made that never was,
				 * which is the exact flattening PRODUCT.md forbids.
				 */}
				<h3 className="text-base font-extrabold tracking-tight text-ink">
					{verdict === "deleted"
						? "Why this message was removed"
						: verdict === "clean"
							? "Why this message was kept"
							: "Why this message was not judged"}
				</h3>
				<p
					className={cn(
						"mt-2 max-w-prose text-sm leading-relaxed",
						verdict === "error" ? "text-ink-muted" : "text-ink-soft",
					)}
				>
					{verdict === "error"
						? "The model could not read this message, so no rule was applied and nothing was removed. It is still in the channel."
						: (reason ?? "—")}
				</p>

				<dl className="mt-5">
					{/*
					 * The clause and the reason are the two fields a member needs to
					 * challenge the call, so they come first.
					 *
					 * On an unjudged record neither exists: no rule was applied, and
					 * the model that could not read the message gave no reason. Both
					 * rows are withheld rather than filled with a placeholder — a
					 * "—" under "Reason given by the model" asserts a reason exists,
					 * which is what the sentence directly above says did not happen.
					 * What the attempt DID hit is shown instead, because that is the
					 * real, actionable fact.
					 */}
					{verdict !== "error" ? (
						<>
							<SlipField label="Policy clause" value={clause ?? "—"} />
							<SlipField
								label="Reason given by the model"
								value={reason ?? "—"}
							/>
						</>
					) : (
						<SlipField
							label="What stopped it"
							value={reason ?? "The message was not read."}
						/>
					)}
				</dl>
				{verdict !== "error" && confidence != null && (
					<ConfidenceGauge confidence={confidence} threshold={threshold} />
				)}
			</div>

			{/* Evidence is quoted spans the model cited. Rendered as text, never
			    as HTML: message content is author-supplied and React escapes it. */}
			{evidence && evidence.length > 0 && (
				<div className="mt-6 border-t border-hairline pt-4">
					<p className="field-label">Evidence kept</p>
					<ul className="mt-3 space-y-2">
						{evidence.map((span) => (
							<li key={span} className="font-mono text-xs leading-relaxed">
								<span className="marker break-words">{span}</span>
							</li>
						))}
					</ul>
				</div>
			)}
		</article>
	)
}

/**
 * The index of decided records. The consulted one stays in the list, marked, so
 * the reader never loses their place among its neighbours.
 */
export function RecordDrawer({
	children,
	activeCaseId,
	className,
}: {
	children: React.ReactNode
	/** The case id currently consulted. */
	activeCaseId?: string
	className?: string
}) {
	return (
		<div
			className={cn("border-t border-rule", className)}
			data-active-case-id={activeCaseId}
		>
			{children}
		</div>
	)
}

/**
 * An index row: enough to recognise a record and see its outcome, never so much
 * that it competes with the dossier. The whole row is a button, so a keyboard
 * reaches every record. The active row is the lime block — the same "you are
 * here" mark the navigation uses.
 */
export function RecordSlipCompact({
	caseId,
	channel,
	verdict,
	summary,
	decidedAt,
	onSelect,
	isActive,
}: {
	caseId: string
	channel: string
	verdict: TSlipVerdict
	summary: string
	decidedAt: string
	onSelect: () => void
	isActive: boolean
}) {
	return (
		<button
			type="button"
			onClick={onSelect}
			aria-current={isActive || undefined}
			className={cn(
				"grid w-full grid-cols-[0.375rem_minmax(0,1fr)] gap-3 border-b border-hairline py-3 pr-3 pl-0 text-left transition-colors",
				isActive ? "bg-lime text-lime-ink" : "hover:bg-surface-2",
			)}
		>
			<span
				aria-hidden
				className={cn("block self-stretch", VERDICT_BAR[verdict])}
			/>
			<span className="min-w-0">
				<span className="flex items-baseline justify-between gap-2">
					<span className={cn("case-id", isActive && "text-lime-ink")}>
						{caseId}
					</span>
					<span
						className={cn(
							"font-mono text-micro-lg tabular-nums",
							isActive ? "text-lime-ink" : "text-ink-faint",
						)}
					>
						{decidedAt}
					</span>
				</span>
				<span
					className={cn(
						"mt-1 block truncate text-sm",
						isActive ? "text-lime-ink" : "text-ink",
					)}
				>
					{summary}
					{/*
          The separator is a SEPARATOR, so it may not lead the line. When the
          summary is the "nothing was typed" fallback there is no left-hand part
          to separate from, and rendering it unconditionally put an orphan "·"
          at the start of the row — the visible scar of a message whose only
          content was a gateway placeholder.
        */}
					{summary ? <span className="mx-1.5 opacity-60">·</span> : null}
					<span className={isActive ? "text-lime-ink" : "text-ink-muted"}>
						{channel}
					</span>
				</span>
				<span
					className={cn(
						"mt-1 block text-micro-lg",
						isActive ? "text-lime-ink" : "text-ink-muted",
					)}
				>
					<SlipStatus verdict={verdict} />
				</span>
			</span>
		</button>
	)
}

/**
 * The queue band. Its own ruled strip, below the records, for one reason:
 * `ai_status` answers "where is this in the queue", which is a DIFFERENT
 * question from the verdict above. A member reading a `deleted` dossier should
 * never have to wonder whether the number beside it is part of that decision.
 */
export function QueueBand({
	waiting,
	states,
	className,
}: {
	waiting: number
	/** Label/count pairs for every queue state, in the backend's own order. */
	states: { label: string; value: number }[]
	className?: string
}) {
	return (
		<section
			className={cn(
				"flex flex-wrap items-end justify-between gap-x-10 gap-y-4 border-y border-rule py-5",
				className,
			)}
			aria-label="Message queue"
		>
			<div className="flex items-end gap-5">
				<p className="mega-md ghost-numeral">{waiting}</p>
				<div className="pb-1">
					<h2 className="text-base font-extrabold tracking-tight text-ink">
						Message queue
					</h2>
					<p className="mt-0.5 max-w-xs text-xs text-ink-muted">
						Position in the queue is not a decision
					</p>
				</div>
			</div>
			<ul className="flex flex-wrap gap-x-8 gap-y-3">
				{states.map((state) => (
					<li key={state.label} className="border-l-2 border-rule pl-3">
						<p className="field-label">{state.label}</p>
						<p className="metric mt-1 text-2xl leading-none text-ink tabular-nums">
							{state.value}
						</p>
					</li>
				))}
			</ul>
		</section>
	)
}
