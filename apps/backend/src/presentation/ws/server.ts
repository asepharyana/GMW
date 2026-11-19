import type { IncomingMessage, Server } from "node:http"
import type { Duplex } from "node:stream"
import { WebSocket, WebSocketServer } from "ws"
import { z } from "zod"
import type { MessageQuery } from "../../application/messages/messages.schema.js"
import { encodeCursor } from "../../domain/utils/pagination.js"
import { createChildLogger } from "../../infrastructure/logger/index.js"
import type { UseCases } from "../composition.js"
import { setBroadcastFunctions } from "./broadcast.js"

const logger = createChildLogger("ws.server")

interface BroadcastEvent {
	type: string
	data: unknown
	timestamp: string
}

interface JsonMessage {
	type: string
	payload?: Record<string, unknown>
}

/** Validate the JSON transport before its values reach a query or frame cap. */
const streamMessagesSchema = z
	.object({
		guildId: z.string().trim().min(1).optional(),
		channelId: z.string().trim().min(1).optional(),
		cursor: z.string().optional(),
		limit: z
			.number()
			.int()
			.positive()
			.transform((value) => Math.min(value, 500))
			.default(200),
	})
	.refine(
		(value) => value.guildId || value.channelId,
		"guildId or channelId is required",
	)

/**
 * How many `stream_messages` replays may be in flight at once, across ALL
 * sockets.
 *
 * A replay is not cheap: it materialises up to `limit` message rows and
 * JSON-encodes each one, and every connected dashboard tab can ask for its own.
 * Measured on this box, ONE 500-frame replay of a busy channel costs ~2.7MB of
 * live heap, and 30 concurrent ones drove heap from 55MB to 243MB — inside a
 * process whose V8 heap ceiling is 560MB because `MemoryMax=1G`. A dashboard
 * that reconnects in a loop (which is exactly what happens while the backend is
 * restarting) could therefore pin the heap long enough for the next allocation
 * burst to abort the process with "Reached heap limit".
 *
 * Serialising the replays bounds that: a queued request waits for a slot instead
 * of allocating alongside every other request. The snapshot is a convenience
 * replay, so a short wait is invisible to the user, and it is strictly better
 * than an OOM that takes capture and the dashboard down together.
 */
const MAX_CONCURRENT_REPLAYS = 2
let activeReplays = 0
const replayQueue: Array<() => void> = []

async function withReplaySlot<T>(fn: () => Promise<T>): Promise<T> {
	if (activeReplays >= MAX_CONCURRENT_REPLAYS) {
		await new Promise<void>((resolve) => replayQueue.push(resolve))
	}
	activeReplays++
	try {
		return await fn()
	} finally {
		activeReplays--
		const next = replayQueue.shift()
		if (next) next()
	}
}

// Track the active WebSocket server for lifecycle management
let _wss: WebSocketServer | null = null

type MessageHandler = (
	ws: WebSocket,
	message: JsonMessage,
) => Promise<void> | void

async function sendInitialStates(
	ws: WebSocket,
	useCases: UseCases,
): Promise<void> {
	// Send initial user state
	ws.send(
		JSON.stringify({
			type: "user_state",
			users: [],
		}),
	)

	// Send initial UI state from database
	try {
		const uiState = await useCases.uiState.getState()
		ws.send(
			JSON.stringify({
				type: "ui_state",
				state: uiState,
			}),
		)
	} catch (err) {
		logger.warn({ err }, "Failed to send initial ui_state")
	}
}

export function closeWebSocketServer(): void {
	if (!_wss) return
	logger.info({ clients: _wss.clients.size }, "Closing WebSocket server")
	// `noServer: true` means `close()` only stops NEW upgrades: it waits for
	// clients that will never disconnect, and those upgraded sockets are exactly
	// what `httpServer.close()` waits on. Terminating them here is what lets the
	// surface drain — releasing them after awaiting that close deadlocks until
	// the failsafe timer kills the process.
	for (const client of _wss.clients) client.terminate()
	_wss.close(() => logger.info("WebSocket server closed"))
	_wss = null
}

export function createWebSocketServer(
	server: Server,
	useCases: UseCases,
): WebSocketServer {
	const frontendClients = new Set<WebSocket>()

	const wss = new WebSocketServer({ noServer: true, perMessageDeflate: true })
	_wss = wss

	// Manual upgrade routing: without this, two `ws` servers bound to the same
	// http.Server via the `server` option both register `upgrade` listeners and
	// the path-guarded one destructively rejects the other's path (400). We own
	// the upgrade event and dispatch by URL instead.
	server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
		if (!req.url?.startsWith("/ws")) return
		wss.handleUpgrade(req, socket, head, (ws) => {
			wss.emit("connection", ws, req)
		})
	})

	// Map-based dispatcher for JSON WebSocket message types
	const jsonHandlers = new Map<string, MessageHandler>()

	jsonHandlers.set("stream_messages", async (ws, message) => {
		if (ws.readyState !== WebSocket.OPEN) return

		/** Send the end-of-stream frame, reporting sent count + next cursor. */
		function sendEnd(data: Record<string, unknown>): void {
			if (ws.readyState !== WebSocket.OPEN) return
			ws.send(
				JSON.stringify({
					type: "message_snapshot_end",
					data,
				}),
			)
		}

		const parsed = streamMessagesSchema.safeParse(message.payload ?? {})
		if (!parsed.success) {
			logger.debug(
				{ issues: parsed.error.issues },
				"Invalid stream_messages payload",
			)
			sendEnd({ sent: 0, nextCursor: null, error: true })
			return
		}
		const payload = parsed.data
		const { guildId, channelId } = payload
		const pageSize = 50
		const maxFrames = payload.limit

		let sent = 0
		let nextCursor: string | null = null
		// Held for the whole replay, so the per-frame allocation below cannot
		// stack up across sockets. See MAX_CONCURRENT_REPLAYS.
		await withReplaySlot(async () => {
			try {
				for await (const msg of useCases.messages.streamMessages(
					{
						guildId,
						channelId,
						cursor: payload.cursor,
					} as MessageQuery,
					pageSize,
				)) {
					if (ws.readyState !== WebSocket.OPEN) break
					// The same composite cursor as REST keeps same-millisecond messages
					// reachable when a frame cap ends a stream in the middle of a tie.
					nextCursor = encodeCursor(msg)
					ws.send(
						JSON.stringify({
							type: "message_snapshot",
							data: msg,
						}),
					)
					sent++
					if (sent >= maxFrames) break
				}
				sendEnd({ sent, nextCursor })
			} catch (err) {
				logger.error({ err }, "stream_messages failed")
				sendEnd({ sent, nextCursor, error: true })
			}
		})
	})

	wss.on("connection", (ws: WebSocket) => {
		frontendClients.add(ws)
		logger.info(`Frontend client connected (${frontendClients.size} total)`)
		// Send initial states (user, ui) — fire-and-forget
		sendInitialStates(ws, useCases).catch((err) =>
			logger.error({ err }, "sendInitialStates failed"),
		)

		ws.on("message", (data: Buffer) => {
			// Handle JSON messages from browser
			if (
				typeof data === "string" ||
				(Buffer.isBuffer(data) && data.length > 0 && data[0] === 0x7b)
			) {
				try {
					const message = JSON.parse(data.toString())
					const handler = jsonHandlers.get(message.type)
					if (handler) {
						Promise.resolve(handler(ws, message)).catch((err: Error) => {
							logger.error({ err }, "JSON message handler failed")
						})
					}
				} catch (err) {
					logger.debug({ err }, "Failed to parse WebSocket message as JSON")
				}
			}
		})

		ws.on("close", () => {
			frontendClients.delete(ws)
			logger.info(
				`Frontend client disconnected (${frontendClients.size} total)`,
			)
		})

		ws.on("error", (err: Error) => {
			logger.error({ err }, "WebSocket client error")
			frontendClients.delete(ws)
		})
	})

	// Heartbeat every 30s — frontend clients only
	const heartbeatInterval = setInterval(() => {
		const message = JSON.stringify({ type: "heartbeat" })
		for (const client of frontendClients) {
			if (client.readyState === WebSocket.OPEN) {
				client.send(message)
			}
		}
	}, 30_000)

	// Don't let the interval keep the process alive after wss closes
	heartbeatInterval.unref()

	// JSON event broadcast — frontend clients only
	function broadcast(event: Omit<BroadcastEvent, "timestamp">) {
		const payload = JSON.stringify({
			...event,
			timestamp: new Date().toISOString(),
		})
		for (const client of frontendClients) {
			if (client.readyState === WebSocket.OPEN) {
				try {
					client.send(payload)
				} catch (err) {
					logger.error({ err }, "Failed to broadcast to client")
				}
			}
		}
	}

	// The JSON transport is the only one: `broadcastEvent` is what every module
	// calls, and the binary channel that used to be injected beside it had no
	// caller at all. See the note in `broadcast.ts`.
	setBroadcastFunctions((type: string, data: unknown) =>
		broadcast({ type, data }),
	)

	// Cleanup on close
	wss.on("close", () => {
		clearInterval(heartbeatInterval)
	})

	logger.info({ path: "/ws" }, "WebSocket server created")

	return wss
}
