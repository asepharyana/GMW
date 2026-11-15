import { useMemo, useState } from "react"
import { MessageMedia } from "#/components/features/message-media"
import { Badge, type TTone } from "#/components/ui/tone"
import {
	pipelineLabelFor,
	pipelineTone,
	deletedBy as resolveDeletedBy,
	verdictLabel,
	verdictTone,
} from "#/libs/ai-status"
import { formatRelative, messageBody } from "#/libs/format"
import {
	pairLinksWithEmbeds,
	readAttachments,
	readEmbeds,
	readStickers,
} from "#/libs/message-metadata"
import type { IMessage, TVerdictStatus } from "#/libs/types"

/**
 * Message row for the live feed and the enforcement log.
 *
 * Shows BOTH state axes explicitly, because collapsing them is the bug that
 * made "still queued" indistinguishable from "judged clean":
 *
 *   - the VERDICT pill  (clean / deleted / error / unjudged)
 *   - the PIPELINE pill (queued / analyzing / analyzed / retrying / abandoned)
 *
 * An unjudged message is visually neutral, never green.
 */
/**
 * Render a message body, falling back to what the link-preview bot resolved.
 *
 * WHY THE FALLBACK EXISTS
 * `getDisplayContent()` runs at `messageCreate`, when Discord has not yet
 * produced the embed — so it returns `""` and the row is stored with an empty
 * `content`. The `messageUpdate` handler later writes the embed into
 * `metadata`, but it only ever rewrites `content` from the message's own text,
 * which is still empty. The card therefore rendered "Pesan kosong tanpa
 * konten apapun" for a post that plainly carried a Facebook photo, and the
 * model was asked to judge the same nothing.
 *
 * So when the body is empty, show the evidence that DOES exist: the resolved
 * embed's site, title and description, and the link itself. This is the same
 * pairing the prompt is given, so the dashboard and the model read the message
 * the same way.
 */
function EmbeddedPreview({ message }: { message: IMessage }) {
	const content = message.content.trim()
	const pairs = useMemo(
		() => pairLinksWithEmbeds(message.content, message.metadata),
		[message.content, message.metadata],
	)
	const embeds = readEmbeds(message.metadata)
	const attachments = readAttachments(message.metadata)
	const stickers = readStickers(message.metadata)

	// What the card must show when the author wrote nothing readable. A bare
	// screenshot is the most common form this takes.
	const hasMedia = attachments.length > 0 || stickers.length > 0

	/*
    `messageBody`, not the raw string. A moderator scanning the queue is
    reading what someone WROTE, and Discord's own UI renders `**bold**`,
    `[label](url)` and `<https://…>` as formatting — so showing the source
    syntax makes the dashboard disagree with the app the message came from,
    and pushes real content behind noise.

    THE CHECK IS ON THE CLEANED BODY, NOT ON THE RAW `content`. That inversion
    is the media-only-post bug, and the previous comment here got it backwards.
    `getDisplayContent()` substitutes `[Attachment: file.png]` for a post whose
    only payload is a picture, so `content` is NON-EMPTY even though the author
    typed nothing. `messageBody()` strips that placeholder — correctly, it is a
    gateway stand-in rather than author text — leaving `""`. Gating on the raw
    string therefore took the body branch and rendered an empty paragraph for a
    message that plainly carried a screenshot.

    So: gate on what the READER would actually see. If the body cleans to
    nothing, the media is the message. Cleanup never decides whether a message
    exists, only whether there is text to show — and media and embeds render
    alongside the body regardless, because a caption and its screenshot are one
    message, not two.
  */
	const body = messageBody(content)

	if (body.length > 0) {
		return (
			<>
				<p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-ink-soft">
					{body}
				</p>
				{hasMedia && (
					<MessageMedia attachments={attachments} stickers={stickers} />
				)}
			</>
		)
	}

	// Media-only post, or one whose only text was the gateway's own placeholder.
	// The picture IS the message — render it, and say nothing about the absence
	// of a body.
	if (hasMedia) {
		return <MessageMedia attachments={attachments} stickers={stickers} />
	}

	// Nothing was posted, not even a link: a bare embed message.
	if (pairs.length === 0 && embeds.length === 0) {
		return (
			<p className="mt-1.5 text-sm break-words whitespace-pre-wrap text-ink-soft">
				—
			</p>
		)
	}

	return (
		<div className="mt-1.5 space-y-1.5">
			<p className="text-micro text-ink-faint italic">
				{pairs.length > 0
					? "Link diposting tanpa teks — isi dari pratinjau bot:"
					: "Pesan tanpa teks — isi dari embed:"}
			</p>
			{embeds.map((embed, index) => {
				const pair = pairs[index]
				return (
					<div
						key={`${embed.url ?? "embed"}-${index}`}
						className="rounded-md border border-hairline bg-surface-2/40 px-2.5 py-2"
					>
						{pair && (
							<a
								href={pair.resolvedUrl ?? pair.postedUrl}
								target="_blank"
								rel="noreferrer noopener"
								className="block truncate font-mono text-micro text-ink-muted hover:text-ink hover:underline"
							>
								{pair.resolvedUrl ?? pair.postedUrl}
							</a>
						)}
						{embed.provider?.name && (
							<p className="text-micro text-ink-faint">{embed.provider.name}</p>
						)}
						{embed.title && (
							<p className="text-sm font-medium break-words text-ink">
								{embed.title}
							</p>
						)}
						{embed.description && (
							<p className="mt-0.5 text-xs break-words text-ink-muted line-clamp-4">
								{embed.description}
							</p>
						)}
						{embed.image && (
							<img
								src={embed.image}
								alt=""
								className="mt-1.5 max-h-48 rounded border border-hairline object-cover"
							/>
						)}
					</div>
				)
			})}
		</div>
	)
}

export function MessageFeedCard({
	message,
	showPipeline = true,
	now,
}: {
	message: IMessage
	showPipeline?: boolean
	now?: number
}) {
	const verdict = (message.verdict_status ?? "unjudged") as
		| TVerdictStatus
		| "unjudged"
	const deleted = message.deleted_at != null
	// Discord's messageDelete fires for moderator AND bot deletions alike, so
	// deleted_at alone cannot say which happened. The enforcer's state can.
	const deletedBy = resolveDeletedBy(message)
	const edited = message.edited_at != null

	return (
		<article className="msg-feed-card hud-card px-3 py-2.5">
			<div className="flex flex-wrap items-center gap-2">
				<Avatar
					src={message.avatar_url}
					name={message.server_nick ?? message.username}
				/>
				<span className="truncate text-sm font-medium text-ink">
					{message.server_nick ?? message.username}
				</span>
				<span
					className="truncate font-mono text-micro-lg text-ink-faint"
					title="Discord user ID of the author (not the message ID)"
				>
					user {message.user_id}
				</span>
				<span className="ml-auto shrink-0 text-micro-lg text-ink-faint">
					{formatRelative(message.created_at, now)}
				</span>
			</div>

			<EmbeddedPreview message={message} />

			<div className="mt-2 flex flex-wrap items-center gap-1.5">
				{/* The verdict pill is only meaningful once a verdict row exists. A
            message that was skipped, or is still queued, has no verdict at
            all — showing "Unjudged" there claimed the worker had looked and
            found nothing, which is a different statement from "never ran". */}
				{verdict !== "unjudged" && (
					<Badge tone={verdictTone(verdict)}>{verdictLabel(verdict)}</Badge>
				)}

				{showPipeline && (
					<Badge tone={pipelineTone(message.ai_status)}>
						{pipelineLabelFor(message)}
					</Badge>
				)}

				{deletedBy !== null && (
					<Badge tone={deletedBy === "bot" ? "danger" : "neutral"}>
						{deletedBy === "bot" ? "Deleted by bot" : "Deleted by moderator"}
					</Badge>
				)}
				{edited && !deleted && <Badge tone="neutral">Edited</Badge>}

				{(message.verdict_flags ?? []).slice(0, 3).map((flag) => (
					<span
						key={flag}
						className="rounded-full bg-surface-2 px-2 py-0.5 font-mono text-micro text-ink-muted"
					>
						{flag}
					</span>
				))}
			</div>

			{message.verdict_analysis && (
				// The analysis is the model's reasoning, and it is the most valuable
				// thing on the card — but it is long-form prose, so showing it expanded
				// on every row turns a 50-message feed into a wall of text that buries
				// the rows that need a human. It is held to two lines until opened.
				//
				// `<details>` rather than a `div` with `tabIndex`: the element really
				// is interactive, and `a11y/noNoninteractiveTabindex` rejects the div
				// version for good reason. A native disclosure also gets keyboard
				// support and the `open` state for free.
				//
				// The summary is BOTH the click target and a clamped copy of the text,
				// so it must be HIDDEN once open — `group-open/analysis:hidden` does
				// that. Without it both nodes render the same prose and expanding a
				// row shows the analysis twice, which is exactly what shipped. A
				// colour-only variant (`group-open/analysis:text-ink-soft`) reads like
				// it is doing this job and is not.
				//
				// `open` is deliberately NOT set as an attribute: that is the *result*
				// of a click, not the input. Hardcoding it would render every card
				// expanded with the summary hidden — an invisible disclosure.
				<details className="group/analysis mt-2 border-l-2 border-hairline pl-2">
					<summary className="cursor-pointer list-none text-xs text-ink-muted transition-colors hover:text-ink-soft marker:content-none group-open/analysis:hidden [&::-webkit-details-marker]:hidden">
						<span className="line-clamp-2 whitespace-pre-wrap break-words">
							{message.verdict_analysis}
						</span>
					</summary>
					<p className="mt-1 text-xs text-ink-soft whitespace-pre-wrap break-words">
						{message.verdict_analysis}
					</p>
				</details>
			)}
		</article>
	)
}

/**
 * Avatar with a text fallback.
 *
 * Discord CDN URLs are already allow-listed in `next.config.ts`; `unoptimized`
 * is set because these are small, already-CDN-cached images where the Next
 * image optimizer would add a hop for no benefit.
 *
 * The fallback's dimensions travel as `--avatar-size` rather than inline
 * `width`/`height`, because the design gate forbids inline width/height and the
 * value is genuinely per-instance. `.avatar-fallback` in styles.css reads the
 * variable.
 */
export function Avatar({
	src,
	name,
	size = 24,
}: {
	src: string | null | undefined
	name: string
	size?: number
}) {
	const [failed, setFailed] = useState(false)
	const initials = name.slice(0, 2).toUpperCase() || "??"

	if (!src || failed) {
		return (
			<span
				className="avatar-fallback flex shrink-0 items-center justify-center rounded-full bg-surface-2 font-mono text-micro text-ink-muted"
				style={{ "--avatar-size": `${size}px` } as React.CSSProperties}
				aria-hidden
			>
				{initials}
			</span>
		)
	}

	return (
		// Plain <img>, not next/image: avatars come straight from Discord's CDN
		// and are tiny, so the optimizer would add a hop and a server round trip
		// for no benefit. `unoptimized` already told Next to pass these through
		// untouched, so behaviour is identical minus the wrapper.
		<img
			src={src}
			alt=""
			width={size}
			height={size}
			onError={() => setFailed(true)}
			className="shrink-0 rounded-full"
		/>
	)
}

export type { TTone }
