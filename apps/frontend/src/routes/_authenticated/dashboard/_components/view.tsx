import { Link } from "@tanstack/react-router"
import { cn } from "cn"
import { ArrowUpRight } from "lucide-react"
import { type ReactNode, useMemo } from "react"
import { AreaChart } from "#/components/features/charts/area-activity"
import { HourHeatmap, RankedBars } from "#/components/features/charts/bars"
import { Avatar } from "#/components/features/message-feed-card"
import { PanelStats } from "#/components/features/panel-stats"
import { PipelineFlow } from "#/components/features/pipeline-flow"
import { StatGrid, StatTile } from "#/components/features/stat-tile"
import {
	type ISpectrumSegment,
	VerdictSpectrum,
} from "#/components/features/verdict-spectrum"
import { Section, SectionGrid } from "#/components/layout/section"
import { ErrorState } from "#/components/ui/states"
import {
	useActivity,
	useInsights,
	useLeaderboards,
	useStats,
	useTopReactions,
	useTopReactors,
} from "#/hooks/use-data"
import {
	channelLabel,
	formatBytes,
	formatCompact,
	formatDay,
	formatNumber,
	formatPercent,
	formatRelative,
	humanize,
	messageLabel,
} from "#/libs/format"
import { Reveal, Ticker } from "#/libs/motion"
import type { IFreshness } from "#/libs/types"
import { useWsEvent } from "#/libs/ws/context"

/** Rows each ranked list carries — the same number the route seeds with. */
const LIMIT = 8

/**
 * The poster numbers are set at 10rem, so they get the exact figure for as long
 * as it fits and the compact one only past a million. The compact form renders
 * 49,724 as "49,7 rb" (*ribu*), which is correct localisation and a real
 * comprehension barrier at a size where nothing else on the page explains it.
 */
const formatHero = (n: number) =>
	n >= 1_000_000 ? formatCompact(n) : formatNumber(n)

export function DashboardView({ days }: { days: number }) {
	const stats = useStats()
	const activity = useActivity(days)
	const leaderboards = useLeaderboards(LIMIT)
	const reactions = useTopReactions(10)
	const reactors = useTopReactors(10)
	const insights = useInsights(LIMIT)

	// A verdict landing invalidates the headline numbers, the rankings — a
	// deletion moves a name up the offender list — and every insights panel,
	// because categories, confidence and enforcement are all reduced from the
	// same verdict rows. Revalidate rather than poll: a quiet system costs
	// nothing.
	useWsEvent("message_analyzed", () => {
		void stats.refetch()
		void activity.refetch()
		void leaderboards.refetch()
		void insights.refetch()
	})
	useWsEvent("moderation_action", () => {
		void stats.refetch()
		void insights.refetch()
	})

	const daily = activity.data?.daily ?? []
	const queue = stats.data?.moderation_overview
	const insightData = insights.data

	const backlogged = useMemo(
		() =>
			(queue?.pending ?? 0) + (queue?.claimed ?? 0) + (queue?.retry_wait ?? 0),
		[queue],
	)

	const chartData = useMemo(
		() =>
			daily.map((d) => ({
				label: d.day,
				value: d.messages,
				// The overlay: what the model deleted that day. This is the
				// verdict count, not `messages.deleted_at` — the same definition
				// the "Deleted" figure and the offender list use, so the three
				// cannot disagree about what "deleted" means.
				flagged: d.flagged,
			})),
		[daily],
	)

	// Verdict mix answers "what did the model decide", which is a different
	// question from queue health's "where is each message in the pipeline". They
	// disagree on purpose, and the gap between them — captured vs judged — is the
	// number that says whether the worker is keeping up.
	const verdictSegments = useMemo<ISpectrumSegment[]>(() => {
		const total = stats.data?.total_messages ?? 0
		if (total === 0) return []
		const clean = stats.data?.total_clean ?? 0
		const deleted = stats.data?.total_flagged ?? 0
		const errored = stats.data?.total_error ?? 0
		return [
			{ label: "Clean", value: clean, kind: "clean" },
			{ label: "Deleted", value: deleted, kind: "deleted" },
			{ label: "Errored", value: errored, kind: "error" },
			{
				label: "No verdict yet",
				value: Math.max(0, total - clean - deleted - errored),
				kind: "none",
			},
		]
	}, [stats.data])

	const judgedShare = useMemo(() => {
		const total = stats.data?.total_messages ?? 0
		if (total === 0) return null
		const judged =
			(stats.data?.total_clean ?? 0) +
			(stats.data?.total_flagged ?? 0) +
			(stats.data?.total_error ?? 0)
		return (judged / total) * 100
	}, [stats.data])

	// Busiest day is reduced from the activity series that is already on the
	// page. A second endpoint for a max() over the same buckets would be a
	// second way for the two numbers to disagree. (Peak hour is read off the dial
	// for the same reason.)
	const busiestDay = useMemo(
		() =>
			daily.reduce<{ day: string; messages: number } | null>(
				(acc, row) => (acc === null || row.messages > acc.messages ? row : acc),
				null,
			),
		[daily],
	)

	// Divided by the WINDOW, not by the days that happen to have messages: a day
	// with no messages is a day with no activity, and dividing by the non-empty
	// days would report "2 messages per day" for a guild that sent two messages
	// in a fortnight. One decimal, because a rate that rounds to 0 reads as a bug.
	const averagePerDay = useMemo(() => {
		if (daily.length === 0) return null
		const total = daily.reduce((sum, d) => sum + d.messages, 0)
		return Math.round((total / days) * 10) / 10
	}, [daily, days])

	const channelBars = useMemo(
		() =>
			(stats.data?.top_channels ?? []).map((c) => ({
				label: channelLabel(c.channel_name, c.channel_id),
				value: c.message_count,
			})),
		[stats.data?.top_channels],
	)

	const flaggedRate = useMemo(() => {
		const total = stats.data?.total_messages ?? 0
		const flagged = stats.data?.total_flagged ?? 0
		if (total === 0) return null
		return (flagged / total) * 100
	}, [stats.data])

	// The hour-of-day series is sparse — only hours with messages come back —
	// and the dial draws a fixed 24 spokes, so the empty hours are filled here
	// rather than left to shift every later bucket one spoke over.
	const hourlyHeat = useMemo(() => {
		const byHour = new Map<number, number>()
		for (const row of activity.data?.hourly ?? [])
			byHour.set(row.hour, row.messages)
		return Array.from({ length: 24 }, (_, hour) => ({
			hour,
			total: byHour.get(hour) ?? 0,
		}))
	}, [activity.data?.hourly])

	const categoryBars = useMemo(
		() =>
			(insightData?.categories ?? []).map((c) => ({
				label: humanize(c.name),
				value: c.count,
			})),
		[insightData?.categories],
	)

	const confidenceBars = useMemo(() => {
		const c = insightData?.confidence
		// Five all-zero buckets would render as five empty bars, which reads as
		// "every bucket is empty" instead of "nothing has been judged yet".
		if (!c || c.judged === 0) return []
		return c.buckets.map((b) => ({
			label: `${b.min}–${b.max}%`,
			value: b.count,
			secondary: `${formatNumber(b.deleted)} deleted`,
		}))
	}, [insightData?.confidence])

	const enforcementBars = useMemo(() => {
		const e = insightData?.enforcement
		// Nothing was deleted, so there is nothing to enforce: an empty state is
		// the honest render, not four zero-length bars.
		if (!e || e.deleted_total === 0) return []
		return [
			{ label: "Enforced", value: e.enforced },
			{ label: "Failed", value: e.failed },
			{ label: "In flight", value: e.in_flight },
			{ label: "Queued", value: e.queued },
		]
	}, [insightData?.enforcement])

	if (stats.error && !stats.data) {
		return (
			<ErrorState error={stats.error} onRetry={() => void stats.refetch()} />
		)
	}

	return (
		<Reveal className="space-y-16">
			{/*
        THE FRONT PAGE. One number at poster scale, a second beside it in outline,
        and the sentence that says what they are. The old page opened with eight
        equal tiles, which answered nothing first; this one answers "is moderation
        happening, and how much" before anything else is read.

        Every figure here is also the drill-down it always was: captured links to
        the whole feed, removed to the deleted filter, queued to the pending one.
        A headline number is a claim about a list, and the list is one click away.
      */}
			<header className="space-y-8">
				<div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
					<p className="field-label">Overview · last {days} days</p>
					<p className="field-label">Every deletion carries its reason</p>
				</div>
				<h1 className="sr-only">Overview</h1>

				<div className="grid items-end gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
					<Link
						to="/messages"
						className="group block min-w-0"
						aria-label={`Messages watched: ${formatNumber(stats.data?.total_messages)}. ${formatNumber(stats.data?.today_messages)} today`}
					>
						<p className="field-label flex items-center gap-2">
							Messages watched
							<ArrowUpRight
								className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
								aria-hidden
							/>
						</p>
						<p className="mega mt-5 text-ink">
							<Ticker value={stats.data?.total_messages} format={formatHero} />
						</p>
						<p className="mt-6 max-w-md text-base leading-snug text-ink-soft">
							captured from the guild,{" "}
							<span className="marker font-bold">
								{formatNumber(stats.data?.today_messages)} today
							</span>
						</p>
					</Link>

					<div className="min-w-0 space-y-7">
						<Link
							to="/messages"
							search={{ verdict: "deleted" }}
							className="group block"
							aria-label={`Removed by the model: ${formatNumber(stats.data?.total_flagged)}${flaggedRate === null ? "" : `, ${formatPercent(flaggedRate, 2)} of all messages`}`}
						>
							<p className="field-label flex items-center gap-2">
								Removed by the model
								<ArrowUpRight
									className="size-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
									aria-hidden
								/>
							</p>
							<p className="mega-md ghost-numeral mt-3">
								<Ticker value={stats.data?.total_flagged} format={formatHero} />
							</p>
							<p className="mt-3 text-sm text-ink-muted">
								{flaggedRate === null
									? "Nothing captured yet"
									: `${formatPercent(flaggedRate, 2)} of all messages`}
							</p>
						</Link>

						<dl className="grid grid-cols-2 gap-6 border-t border-rule pt-4">
							<Link
								to="/messages"
								search={{ status: "pending" }}
								className="group block min-w-0"
								aria-label={`In queue: ${formatNumber(backlogged)}. ${queue?.dead ? `${formatNumber(queue.dead)} abandoned` : "Awaiting a verdict"}`}
							>
								<dt className="field-label flex items-center gap-1.5">
									<span
										className={cn(
											"verdict-dot",
											backlogged > 500
												? "verdict-dot-warning"
												: backlogged > 0
													? "verdict-dot-live"
													: "verdict-dot-clean",
										)}
										aria-hidden
									/>
									In queue
								</dt>
								<dd className="metric mt-1.5 text-4xl leading-none text-ink group-hover:underline group-hover:underline-offset-4">
									<Ticker value={backlogged} format={formatNumber} />
								</dd>
								<dd className="mt-1.5 truncate text-xs text-ink-muted">
									{queue?.dead
										? `${formatNumber(queue.dead)} abandoned`
										: "Awaiting a verdict"}
								</dd>
							</Link>
							<div className="min-w-0">
								<dt className="field-label">Judged</dt>
								<dd
									className={cn(
										"metric mt-1.5 text-4xl leading-none",
										judgedShare !== null && judgedShare < 90
											? "text-amber"
											: "text-ink",
									)}
								>
									{judgedShare === null ? "—" : formatPercent(judgedShare)}
								</dd>
								<dd className="mt-1.5 truncate text-xs text-ink-muted">
									{judgedShare === null
										? "Nothing captured yet"
										: "of everything captured"}
								</dd>
							</div>
						</dl>
					</div>
				</div>
			</header>

			{/*
        Freshness. These four timestamps are the only place the page says
        whether anything is HAPPENING: every other number is a total and would
        read identically on a dead pipeline. `null` renders as "never", never as
        a date, because a guild with nothing captured has no last message and
        1970 is not an answer.
      */}
			<div>
				<FreshnessChips freshness={insightData?.freshness} />
				<StatGrid cols={4}>
					<StatTile
						label="Active members"
						value={stats.data?.active_users_24h}
						hint={`${formatNumber(stats.data?.total_users)} total`}
					/>
					<StatTile
						label="Average per day"
						value={averagePerDay}
						hint={`Last ${days} days`}
					/>
					<StatTile
						label="Busiest day"
						value={busiestDay?.messages}
						format={formatCompact}
						exact={
							busiestDay === null
								? undefined
								: formatNumber(busiestDay.messages)
						}
						hint={
							busiestDay
								? formatDay(busiestDay.day)
								: "No messages in this window"
						}
					/>
					<StatTile
						label="Deleted today"
						value={stats.data?.today_flagged}
						tone={(stats.data?.today_flagged ?? 0) > 0 ? "warning" : "neutral"}
						hint="By the model, since midnight"
						to="/messages?verdict=deleted"
					/>
				</StatGrid>
			</div>

			{/* ── 01 · health first: is the pipeline moving? ──────────────── */}
			<Section
				index="01"
				layout="split"
				title="Queue health"
				description="Where every captured message is on its way to a verdict. A node is empty at zero."
			>
				<PipelineFlow queue={queue} />
			</Section>

			{/* ── 02 · what was decided ───────────────────────────────────── */}
			<Section
				index="02"
				layout="split"
				title="Verdict mix"
				description="Every captured message by how it was judged. Hatched means no verdict yet — not clean."
			>
				<VerdictSpectrum segments={verdictSegments} />
			</Section>

			{/* ── 03 · volume ─────────────────────────────────────────────── */}
			<Section
				index="03"
				layout="split"
				title="Message volume"
				description={`One column per day, last ${days} days. Deletions get their own lane and their own scale.`}
			>
				{activity.error && !activity.data ? (
					<ErrorState
						error={activity.error}
						onRetry={() => void activity.refetch()}
					/>
				) : (
					<AreaChart data={chartData} />
				)}
			</Section>

			{/* ── 04 · what for, and when ─────────────────────────────────── */}
			<SectionGrid cols={2}>
				<Section
					index="04"
					title="Flag categories"
					description="What the model deleted for, all time"
				>
					<PanelGuard
						error={insights.error}
						hasData={Boolean(insightData)}
						onRetry={() => void insights.refetch()}
					>
						<RankedBars
							data={categoryBars}
							showRank
							emptyLabel="Nothing deleted yet"
						/>
					</PanelGuard>
				</Section>

				<Section
					index="05"
					title="Activity by hour"
					description="Messages captured in the last 24 hours, by hour of day"
				>
					<HourHeatmap
						values={hourlyHeat}
						label="Messages captured by hour of day"
						unit="messages"
						emptyLabel="No messages in the last 24 hours"
					/>
				</Section>
			</SectionGrid>

			{/* ── 06 · how sure, and did it happen ────────────────────────── */}
			<SectionGrid cols={2}>
				{/*
          Confidence is the number that separates "we delete this" from "we are
          sure this should go". The histogram is over JUDGED verdicts (errors
          carry a confidence that is not a judgement), and the low-confidence
          share counts DELETIONS only — a hesitant pass costs nothing, a
          hesitant deletion is what a human should look at.
        */}
				<Section
					index="06"
					title="Model confidence"
					description="How sure the model was, every judged message"
				>
					<PanelGuard
						error={insights.error}
						hasData={Boolean(insightData)}
						onRetry={() => void insights.refetch()}
					>
						<div className="space-y-6">
							<PanelStats
								items={[
									{
										label: "Mean",
										value: formatPercent(
											insightData?.confidence.mean == null
												? null
												: insightData.confidence.mean * 100,
										),
									},
									{
										label: "Low-confidence deletions",
										value: formatPercent(insightData?.confidence.low_share),
										hint: "below 60%",
										tone:
											(insightData?.confidence.low_share ?? 0) > 25
												? "warning"
												: "neutral",
									},
									{
										label: "Judged",
										value: formatNumber(insightData?.confidence.judged),
									},
								]}
							/>
							<RankedBars
								data={confidenceBars}
								emptyLabel="Nothing judged yet"
							/>
						</div>
					</PanelGuard>
				</Section>

				{/*
          The verdict says "delete this"; `auto_delete_state` says whether it
          happened. A failed enforcement is the only number here that needs a
          human, so it is the only one that changes the section's tone.
        */}
				<Section
					index="07"
					title="Enforcement outcomes"
					description="What happened to the messages the model deleted"
				>
					<PanelGuard
						error={insights.error}
						hasData={Boolean(insightData)}
						onRetry={() => void insights.refetch()}
					>
						<div className="space-y-6">
							<PanelStats
								cols={4}
								items={[
									{
										label: "Enforced",
										value: formatNumber(insightData?.enforcement.enforced),
										tone: "positive",
									},
									{
										label: "Failed",
										value: formatNumber(insightData?.enforcement.failed),
										tone:
											(insightData?.enforcement.failed ?? 0) > 0
												? "danger"
												: "neutral",
									},
									{
										label: "In flight",
										value: formatNumber(insightData?.enforcement.in_flight),
									},
									{
										label: "Queued",
										value: formatNumber(insightData?.enforcement.queued),
									},
								]}
							/>
							<RankedBars
								data={enforcementBars}
								emptyLabel="No deletions to enforce"
							/>
							<p className="text-xs leading-relaxed text-ink-muted">
								{formatNumber(insightData?.enforcement.clean)} clean verdicts
								called for no action
								{insightData?.enforcement.error
									? ` · ${formatNumber(insightData.enforcement.error)} verdicts errored`
									: ""}
								.
							</p>
							{(insightData?.enforcement.failed ?? 0) > 0 && (
								<p className="border-l-4 border-vermilion bg-surface py-2.5 pr-3 pl-3 text-xs text-ink-soft">
									<span className="font-bold text-vermilion">
										{formatNumber(insightData?.enforcement.failed)} deletion
										{insightData?.enforcement.failed === 1 ? "" : "s"}
									</span>{" "}
									could not be enforced and the message is still up.{" "}
									<Link
										to="/messages"
										search={{ verdict: "deleted" }}
										className="font-bold underline underline-offset-2"
									>
										Inspect them
									</Link>
									.
								</p>
							)}
						</div>
					</PanelGuard>
				</Section>
			</SectionGrid>

			{/*
        Leaderboards. Both member lists share one row shape on purpose — sent, of
        which deleted — so a name that appears in both reads the same way in both
        places.

        "Top offenders" is the only list in the app that names members for what
        they did, so its description says "model": a message a human deleted by
        hand is not counted there, and the wording has to survive being read as
        an accusation.
      */}
			<SectionGrid cols={2}>
				<Section
					index="08"
					title="Top offenders"
					description="Members whose messages the model deleted, all time"
				>
					{leaderboards.error && !leaderboards.data ? (
						<ErrorState
							error={leaderboards.error}
							onRetry={() => void leaderboards.refetch()}
						/>
					) : (
						<RankedBars
							showRank
							data={(leaderboards.data?.top_offenders ?? []).map((u) => ({
								label: u.username,
								value: u.deleted,
								secondary: ratioLabel(u.deleted, u.total),
							}))}
							emptyLabel="Nothing deleted yet"
						/>
					)}
				</Section>

				<Section
					index="09"
					title="Most active members"
					description="Messages sent, all time"
				>
					<RankedBars
						showRank
						data={(leaderboards.data?.most_active ?? []).map((u) => ({
							label: u.username,
							value: u.total,
							secondary: `${formatNumber(u.total)} · ${formatNumber(
								u.deleted,
							)} deleted`,
						}))}
						emptyLabel="No messages captured yet"
					/>
				</Section>

				<Section
					index="10"
					title="Problem channels"
					description="Channels carrying the most deletions, all time"
				>
					<RankedBars
						showRank
						data={(leaderboards.data?.problem_channels ?? []).map((c) => ({
							label: channelLabel(c.channel_name, c.channel_id),
							value: c.deleted,
							secondary: ratioLabel(c.deleted, c.total),
						}))}
						emptyLabel="No channel has had a deletion"
					/>
				</Section>

				<Section index="11" title="Busiest channels" description="All time">
					<RankedBars data={channelBars} showRank max={LIMIT} />
				</Section>
			</SectionGrid>

			{/* ── reactions ───────────────────────────────────────────────── */}
			<SectionGrid cols={2}>
				<Section
					index="12"
					title="Most reacted messages"
					description="All time"
				>
					<RankedBars
						data={(reactions.data ?? []).map((r) => {
							// A custom-emoji-only message has no readable text, so the label
							// falls back to the author instead of rendering the raw
							// `<:adobe:1520373128566411417>` token as the row's whole identity.
							const text = messageLabel(r.content, 60)
							return {
								label: text || `Reaction from ${r.username}`,
								value: r.reaction_count,
							}
						})}
						max={6}
					/>
				</Section>

				{/*
          The description names the DIRECTION and the netting, because
          "net reactions added" said neither. `net_count` is
          `add_count - remove_count` on `message_reactions` rows, and every
          such row is a reaction this user gave — so the old label could be read
          as reactions this user *received*, which is the opposite list
          ("Most reacted messages"). "Reactions they gave, adds minus removes"
          is longer, but it is the only reading that is correct.
        */}
				<Section
					index="13"
					title="Most active reactors"
					description="Reactions they gave, adds minus removes"
				>
					<ul className="border-t border-hairline">
						{(reactors.data ?? []).map((reactor) => (
							<li
								key={reactor.user_id}
								className="flex min-h-9 items-center gap-3 border-b border-hairline px-2"
							>
								<Avatar src={null} name={reactor.username} size={20} />
								<span className="min-w-0 flex-1 truncate text-sm text-ink">
									{reactor.username}
								</span>
								<span className="reactor-count shrink-0 font-mono text-xs text-ink-soft">
									+{formatNumber(reactor.net_count)}
								</span>
							</li>
						))}
					</ul>
				</Section>
			</SectionGrid>

			{/* ── edits and media ─────────────────────────────────────────── */}
			<SectionGrid cols={2}>
				{/*
          Edits are an evasion signal — a message that says one thing and was
          edited to say another — so this counts them and names who does it
          most. `orphaned` is not a rounding error: `message_edits` has no
          foreign key, so an edit outlives its message once retention runs, and
          those rows can be counted but not attributed.
        */}
				<Section
					index="14"
					title="Edit activity"
					description="Messages edited after sending, all time"
				>
					<PanelGuard
						error={insights.error}
						hasData={Boolean(insightData)}
						onRetry={() => void insights.refetch()}
					>
						<div className="space-y-6">
							<PanelStats
								items={[
									{
										label: "Edits",
										value: formatNumber(insightData?.edits.total),
									},
									{
										label: "Messages",
										value: formatNumber(insightData?.edits.messages),
									},
									{
										label: "Last 7 days",
										value: formatNumber(insightData?.edits.last_7d),
									},
								]}
							/>
							<RankedBars
								showRank
								data={(insightData?.edits.top_editors ?? []).map((e) => ({
									label: e.username,
									value: e.edits,
									secondary: `${formatNumber(e.edits)} edits`,
								}))}
								emptyLabel="No edits recorded"
							/>
							{(insightData?.edits.orphaned ?? 0) > 0 && (
								<p className="text-xs leading-relaxed text-ink-muted">
									{formatNumber(insightData?.edits.orphaned)} of these belong to
									messages retention already removed, so they cannot be
									attributed to a member.
								</p>
							)}
						</div>
					</PanelGuard>
				</Section>

				{/*
          The archive's two sizes are the point: "we captured 4 GB" and "we kept
          3 GB" are different claims, and only the pair tells an operator whether
          the uploader is keeping up. A failed upload is noted rather than
          linked, because there is no filtered view of attachments to link to —
          the original Discord URL stays on the message row either way.
        */}
				<Section
					index="15"
					title="Media archive"
					description="Attachments captured and archived"
				>
					<PanelGuard
						error={insights.error}
						hasData={Boolean(insightData)}
						onRetry={() => void insights.refetch()}
					>
						<div className="space-y-6">
							<PanelStats
								cols={2}
								items={[
									{
										label: "Attachments",
										value: formatNumber(insightData?.media.total),
									},
									{
										label: "Archived",
										value: formatNumber(insightData?.media.uploaded),
										hint: "uploaded to storage",
										tone: "positive",
									},
									{
										label: "Total size",
										value: formatBytes(insightData?.media.bytes),
									},
									{
										label: "Archived size",
										value: formatBytes(insightData?.media.uploaded_bytes),
									},
								]}
							/>
							<p className="text-xs leading-relaxed text-ink-muted">
								{formatNumber(insightData?.media.pending)} pending ·{" "}
								{formatNumber(insightData?.media.failed)} failed
							</p>
							{(insightData?.media.failed ?? 0) > 0 && (
								<p className="border-l-4 border-amber bg-surface py-2.5 pr-3 pl-3 text-xs text-ink-soft">
									<span className="font-bold text-amber">
										{formatNumber(insightData?.media.failed)} attachment
										{insightData?.media.failed === 1 ? "" : "s"}
									</span>{" "}
									failed to upload. The original Discord URL is still recorded
									on the message, but it will stop resolving if the message is
									deleted.
								</p>
							)}
						</div>
					</PanelGuard>
				</Section>
			</SectionGrid>
		</Reveal>
	)
}

/**
 * One guard for every insights-backed section.
 *
 * The insights endpoint feeds six sections, so the "failed, show a retry" case
 * would otherwise be written six times — and written six different ways. A
 * section that already has data keeps rendering it while a refetch fails: stale
 * numbers with a live socket are better than six empty regions.
 */
function PanelGuard({
	error,
	hasData,
	onRetry,
	children,
}: {
	error: Error | null
	hasData: boolean
	onRetry: () => void
	children: ReactNode
}) {
	if (error && !hasData) return <ErrorState error={error} onRetry={onRetry} />
	return <>{children}</>
}

/**
 * The four freshness timestamps, as a ruled strip.
 *
 * Every one of them is a "when", not a "how many", which is why they sit under
 * the headline instead of in a section: they are the answer to "is this page
 * live", and that question is asked before any section is read.
 */
function FreshnessChips({ freshness }: { freshness: IFreshness | undefined }) {
	const waitingAge =
		freshness?.oldest_waiting_at == null
			? null
			: Date.now() - freshness.oldest_waiting_at
	// An hour of backlog is the point where "it is being worked on" becomes a
	// question worth asking. Nothing here is a hard threshold — it only picks a
	// dot colour.
	const waitingStale = waitingAge !== null && waitingAge > 60 * 60 * 1000
	// `formatRelative` renders "—" for a missing timestamp, which inside a
	// sentence reads as a formatting bug. "never" is the answer.
	const ago = (at: number | null | undefined) =>
		at == null ? "never" : formatRelative(at)

	return (
		<div className="flex flex-wrap items-center gap-2 border-t border-rule py-3">
			<span className="field-label mr-2">Freshness</span>
			<span className="verdict-chip">
				<span className="verdict-dot verdict-dot-live" aria-hidden />
				Last message {ago(freshness?.last_message_at)}
			</span>
			<span className="verdict-chip">
				<span className="verdict-dot verdict-dot-clean" aria-hidden />
				Last verdict {ago(freshness?.last_verdict_at)}
			</span>
			<span className="verdict-chip">
				<span className="verdict-dot verdict-dot-deleted" aria-hidden />
				Last deletion {ago(freshness?.last_deletion_at)}
			</span>
			<span className="verdict-chip">
				<span
					className={cn(
						"verdict-dot",
						freshness?.oldest_waiting_at == null
							? "verdict-dot-clean"
							: waitingStale
								? "verdict-dot-warning"
								: "verdict-dot-live",
					)}
					aria-hidden
				/>
				{waitingAge === null
					? "Queue empty"
					: `Oldest waiting ${formatRelative(freshness?.oldest_waiting_at)}`}
			</span>
		</div>
	)
}

/**
 * "3 / 28 · 10,7%" — deletions, the denominator, and the share.
 *
 * The share is the point. Three deletions out of 28 messages is a habit; three
 * out of 3 000 is a bad day. A list that shows only the first number ranks the
 * loudest member rather than the worst one.
 */
function ratioLabel(deleted: number, total: number): string {
	if (total === 0) return formatNumber(deleted)
	return `${formatNumber(deleted)} / ${formatNumber(total)} · ${formatPercent(
		(deleted / total) * 100,
	)}`
}
