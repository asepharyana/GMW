import { cn } from "cn"
import { useWs } from "#/libs/ws/context"
import type { TConnectionStatus } from "#/libs/ws/types"

/**
 * Live-connection indicator.
 *
 * `reconnecting` is deliberately distinct from `offline`: the socket is
 * self-healing, so showing a hard error would be wrong, but showing plain
 * "connected" while it retries would be a lie. The dot breathes and the label
 * carries the attempt count.
 *
 * Only `connected` earns the lime: it is the one state where the page is
 * actually receiving, and the highlighter means "live".
 */
const COPY: Record<
	TConnectionStatus,
	{ label: string; dot: string; pulse: boolean }
> = {
	connecting: { label: "Connecting", dot: "bg-ink-faint", pulse: true },
	connected: { label: "Live", dot: "bg-lime", pulse: false },
	reconnecting: { label: "Reconnecting", dot: "bg-amber", pulse: true },
	error: { label: "Offline", dot: "bg-vermilion", pulse: false },
}

export function StatusDot({ className }: { className?: string }) {
	const { status, statusDetail } = useWs()
	const copy = COPY[status]

	return (
		<div
			className={cn("flex items-center gap-2", className)}
			title={statusDetail ? `Reconnecting (${statusDetail})` : copy.label}
		>
			<span className="relative flex size-2" aria-hidden>
				{copy.pulse && (
					<span
						className={cn(
							"animate-pulse-ring absolute inline-flex size-full rounded-full",
							copy.dot,
						)}
					/>
				)}
				<span
					className={cn("relative inline-flex size-2 rounded-full", copy.dot)}
				/>
			</span>
			<span className="field-label">{copy.label}</span>
		</div>
	)
}
