import { cn } from "cn"
import { useState } from "react"
import { useWs, useWsEvent } from "#/libs/ws/context"
import type { IAnalysisQueueStatus } from "#/libs/ws/types"

/**
 * Queue ribbon (W3) and queue pulse.
 *
 * The ribbon is a 3px strip pinned above the top bar whose colour is the
 * gateway's LLM queue state, streamed live over `analysis_queue_status`. The
 * pulse is the same fact in words, next to the connection dot, so the state is
 * never carried by colour alone.
 *
 * -- Why this exists ----------------------------------------------------
 * The dashboard's worst failure mode is silent: the gateway loses its provider
 * credentials or its circuit breaker trips, every verdict stops being produced,
 * and the backlog number climbs slowly over hours. Nothing on screen says "the
 * pipeline is broken" until someone opens the queue page and counts. This makes
 * that failure legible in peripheral vision, on every route, without spending
 * layout on it.
 *
 * -- Why it is honest ---------------------------------------------------
 * Every colour maps to a fact the payload actually carries. There is no
 * animation that fires on a timer, and no optimistic "healthy" default:
 *
 *   alert   - the circuit breaker is active, or the worker reported an error.
 *             Red. This is the one state worth interrupting for.
 *   busy    - work is queued or in flight. Amber, and the only animated
 *             state, because in-flight work is a live signal.
 *   ok      - socket connected, worker reporting, nothing queued. Still.
 *   unknown - no event has arrived yet, or the socket is down. GREY, not
 *             green. Defaulting to "healthy" would be the exact lie this
 *             component exists to prevent.
 */

export type TRibbonLevel = "ok" | "busy" | "alert" | "unknown"

/**
 * The latest queue payload and the level derived from it.
 *
 * `status` is the socket's own liveness, not the worker's. A live socket with a
 * dead worker is precisely the case that must not read as green.
 *
 * The last payload wins. `useWsEvent` is a callback subscription, not a store,
 * so the latest value has to be held here; the setter identity is stable so the
 * subscription is not torn down and rebuilt on each render.
 */
function useAnalysisQueue() {
	const { status: socketStatus } = useWs()
	const [queue, setQueue] = useState<IAnalysisQueueStatus | null>(null)
	useWsEvent<IAnalysisQueueStatus>("analysis_queue_status", (event) =>
		setQueue(event.data),
	)
	return { queue, socketStatus, level: ribbonLevel(queue, socketStatus) }
}

export function QueueRibbon({ className }: { className?: string }) {
	const { queue, socketStatus, level } = useAnalysisQueue()
	const tone = RIBBON_TONE[level]

	return (
		<div
			// Announced rather than purely visual — but only when it is NOT the calm
			// default, otherwise this becomes a chatty live region.
			role={level === "alert" ? "status" : undefined}
			aria-live={level === "alert" ? "polite" : undefined}
			className={cn("h-[3px] w-full", tone.className, className)}
		>
			<span className="sr-only">
				{ribbonAnnouncement(queue, level, socketStatus)}
			</span>
		</div>
	)
}

/** The queue state as a short sentence, for the top strip. */
export function QueuePulse({ className }: { className?: string }) {
	const { queue, level } = useAnalysisQueue()
	const dot = {
		ok: "verdict-dot-clean",
		busy: "verdict-dot-warning",
		alert: "verdict-dot-deleted",
		unknown: "",
	}[level]

	return (
		<span className={cn("verdict-chip", className)}>
			<span className={cn("verdict-dot", dot)} aria-hidden />
			{pulseLabel(queue, level)}
		</span>
	)
}

const RIBBON_TONE: Record<TRibbonLevel, { className: string }> = {
	// `ribbon-*` classes live in styles.css so the colours are theme tokens
	// rather than hex values assembled in a component (the design gate forbids
	// the latter). `busy` and `alert` are the only ones that animate.
	ok: { className: "ribbon-ok" },
	busy: { className: "ribbon-busy animate-breathe" },
	alert: { className: "ribbon-alert animate-breathe" },
	unknown: { className: "ribbon-unknown" },
}

function ribbonLevel(
	queue: IAnalysisQueueStatus | null,
	socketStatus: string,
): TRibbonLevel {
	// Order matters. A reported failure outranks everything, including a
	// disconnected socket, because the failure is the more recent truth.
	if (queue?.individualCircuitBreakerActive || queue?.lastError) return "alert"
	if (socketStatus !== "connected") return "unknown"
	if (!queue) return "unknown"
	const inFlight =
		queue.activeRequests +
		queue.activeIndividualRequests +
		(queue.individualInFlightCount || 0)
	if (queue.queuedConversations > 0 || inFlight > 0) return "busy"
	return "ok"
}

function pulseLabel(
	queue: IAnalysisQueueStatus | null,
	level: TRibbonLevel,
): string {
	switch (level) {
		case "alert":
			return queue?.individualCircuitBreakerActive
				? "Model paused"
				: "Worker fault"
		case "busy":
			return `Analyzing · ${queue?.queuedConversations ?? 0} queued`
		case "ok":
			return "Pipeline idle"
		default:
			return "Pipeline unknown"
	}
}

function ribbonAnnouncement(
	queue: IAnalysisQueueStatus | null,
	level: TRibbonLevel,
	socketStatus: string,
): string {
	if (level === "alert") {
		return queue?.individualCircuitBreakerActive
			? "Model circuit breaker is open. Verdicts are not being produced."
			: "The analysis worker reported an error."
	}
	if (level === "unknown") {
		return socketStatus === "connected"
			? "Analysis queue state unknown."
			: "Live connection lost. Queue state unknown."
	}
	if (level === "busy") {
		return `Analysis in progress. ${queue?.queuedConversations ?? 0} queued.`
	}
	return "Analysis queue healthy."
}
