/**
 * The Discord gateway's own health, as this process sees it.
 *
 * ## Why this exists
 *
 * The ops watchdog needs to answer one question every five minutes: "is the
 * account still logged in?" Until now it answered it from the OUTSIDE, by
 * sending `GET /users/@me` with the account's user token. That is an
 * authenticated REST call from a datacenter IP, made on a timer, by a client
 * that holds no gateway session — the exact shape Discord's anti-abuse
 * heuristics read as a selfbot. A watchdog that risks getting the very account
 * it guards banned is not a watchdog.
 *
 * So the observation moved to where the credential actually lives. The backend
 * already holds a live gateway connection authenticated with that token; this
 * module records what that connection is doing, and `GET /api/discord/status`
 * publishes it on loopback. Nothing leaves the box, and the signal is strictly
 * better than the probe it replaces: the probe tested a token, this reports the
 * connection.
 *
 * ## What a revoked token looks like from here
 *
 * Two distinct shapes, and both are already visible without any REST call:
 *
 *   - **Revoked before boot.** `client.login()` throws, `bootstrap.ts` catches
 *     it so the dashboard stays up, and `markLoginFailed` records why. The
 *     client is never READY: `everReady: false` forever.
 *   - **Killed mid-session.** The gateway closes with 4004 (authentication
 *     failed) or the library emits `invalidated` when it cannot re-identify.
 *     `invalidated: true` / `lastDisconnect.code: 4004`.
 *
 * `everReady` is the load-bearing field. Without it "never connected" and
 * "connected 40 minutes ago, reconnecting now" are the same snapshot, and a
 * restart loop on a dead token would read as a healthy reconnect.
 *
 * ## Zombie sockets
 *
 * `connected` alone is not liveness. A TCP connection can stay open with
 * nothing arriving — no heartbeats, no dispatches — while the library still
 * reports READY. Discord's gateway heartbeat is ~41s, and the library re-emits
 * every frame it receives as a `raw` event, so `lastPacketAgoMs` is a direct
 * measure of "is anything actually arriving". A connected client that has been
 * silent for ten minutes is wedged, not healthy.
 *
 * ## Module state, deliberately
 *
 * One process, one gateway connection, one set of counters. A singleton is the
 * honest shape here: the facts are process-wide, and threading a tracker
 * through nine capture modules to satisfy a DI rule would be ceremony. The
 * `resetGatewayStatus` hook exists so tests can start from a clean slate
 * without a second module instance.
 */

import { Constants } from "discord.js-selfbot-v13"
import { createChildLogger } from "../../logger/index.js"

const log = createChildLogger("gateway-status")

/**
 * The narrow slice of `Client` this module reads.
 *
 * Structural rather than the concrete type for the usual reason: a test can
 * then pass a plain object and exercise every branch without opening a socket,
 * and this module never has to import the library's runtime just to name a
 * type. `Client` satisfies it as-is.
 */
export interface GatewayClientLike {
	isReady(): boolean
	readonly ws: { readonly status: number }
	readonly guilds: {
		readonly cache: { readonly size: number; has(id: string): boolean }
	}
}

export type GatewayState =
	| "ready"
	| "connecting"
	| "reconnecting"
	| "idle"
	| "nearly"
	| "disconnected"
	| "waiting_for_guilds"
	| "identifying"
	| "resuming"
	| "unknown"

export interface GatewayStatusSnapshot {
	/** Lowercase name of the library's numeric `Status`, for humans. */
	state: GatewayState
	/** `client.isReady()` — the shard is READY and the socket is not destroyed. */
	connected: boolean
	/**
	 * Has this process EVER reached READY?
	 *
	 * The discriminator between "booting" and "cannot log in". See the module
	 * comment — without it a dead token and a normal reconnect look identical.
	 */
	everReady: boolean
	/** Epoch ms of the transition into READY, or null while down. */
	readySince: number | null
	/** Epoch ms the client last left READY; the process boot time if never ready. */
	downSince: number | null
	/** Epoch ms of the last gateway frame (heartbeats included), or null. */
	lastPacketAt: number | null
	lastPacketAgoMs: number | null
	/** How long this process has been up — the window `everReady` refers to. */
	uptimeMs: number
	/** The library gave up resuming; only a restart re-identifies. */
	invalidated: boolean
	/** Why `client.login()` threw, if it did. Null once a login succeeds. */
	loginError: string | null
	lastDisconnect: { code: number; reason: string; at: number } | null
	/** Most recent socket-level error, kept until the next successful ready. */
	lastError: string | null
	guildsCached: number
	/**
	 * Every configured monitored guild and whether this client can see it.
	 *
	 * A logged-in account that is not in the guild captures nothing, and no
	 * amount of queue depth or HTTP probing reveals that. Checked from the
	 * client's cache, which is local state — no REST call.
	 */
	monitoredGuilds: Array<{ id: string; present: boolean }>
}

/** Reverse of the library's `Status` map, so the snapshot reads as words. */
const STATE_NAMES = new Map<number, GatewayState>(
	Object.entries(Constants.Status).map(([name, value]) => [
		value as number,
		name.toLowerCase() as GatewayState,
	]),
)

const bootAt = Date.now()

let client: GatewayClientLike | null = null
let monitoredGuildIds: string[] = []
let everReady = false
let readySince: number | null = null
let lastDownAt: number | null = null
let lastPacketAt: number | null = null
let invalidated = false
let loginError: string | null = null
let lastDisconnect: GatewayStatusSnapshot["lastDisconnect"] = null
let lastError: string | null = null

/**
 * Hand the tracker the live client and the guilds worth watching.
 *
 * Called once from `bootstrap.ts` before `client.login()`, so the listeners
 * below always have somewhere to report to.
 */
export function setGatewayClient(
	next: GatewayClientLike,
	guildIds: string[],
): void {
	client = next
	monitoredGuildIds = guildIds
}

/** The client reached READY (first login, or a resume). Idempotent. */
export function markGatewayReady(): void {
	everReady = true
	// Only stamp the transition, not every duplicate ready: the library can
	// re-emit `ready` after a shard resumes, and a reset `readySince` would make
	// a long-lived session look seconds old.
	if (readySince === null) readySince = Date.now()
	lastDownAt = null
	loginError = null
	lastError = null
	log.info({ readySince }, "gateway ready")
}

/** Any gateway frame arrived. Heartbeats count — that is the point. */
export function markGatewayPacket(): void {
	lastPacketAt = Date.now()
}

/** The shard closed and will not reconnect on its own. */
export function markGatewayDisconnected(code: number, reason: string): void {
	lastDisconnect = { code, reason, at: Date.now() }
	readySince = null
	lastDownAt = lastDownAt ?? Date.now()
	log.warn({ code, reason }, "gateway shard disconnected")
}

/** The shard is attempting to reconnect or re-identify. */
export function markGatewayReconnecting(): void {
	readySince = null
	lastDownAt = lastDownAt ?? Date.now()
}

/** A socket-level error. Kept until the next successful ready. */
export function markGatewayError(err: unknown): void {
	lastError = err instanceof Error ? err.message : String(err)
	readySince = null
	lastDownAt = lastDownAt ?? Date.now()
}

/**
 * The library could not re-identify and destroyed the shards.
 *
 * Only a process restart fixes this, so it must never be silently swallowed:
 * a selfbot in this state captures nothing while `/api/health` stays 200.
 */
export function markGatewayInvalidated(): void {
	invalidated = true
	readySince = null
	lastDownAt = lastDownAt ?? Date.now()
	log.error("gateway session invalidated — capture has stopped until restart")
}

/** `client.login()` threw. The process stays up, capture never starts. */
export function markLoginFailed(err: unknown): void {
	loginError = err instanceof Error ? err.message : String(err)
	log.error({ loginError }, "gateway login failed")
}

/** Read-only view for the HTTP endpoint, the metrics collector and tests. */
export function gatewayStatusSnapshot(): GatewayStatusSnapshot {
	const now = Date.now()
	const connected = client?.isReady() ?? false
	const status = client?.ws.status

	return {
		state: (status !== undefined && STATE_NAMES.get(status)) || "unknown",
		connected,
		everReady,
		readySince: connected ? readySince : null,
		// Never ready: the whole process lifetime is the down window, which is
		// what lets the watchdog apply a boot grace period and then complain.
		downSince: connected ? null : (lastDownAt ?? bootAt),
		lastPacketAt,
		lastPacketAgoMs: lastPacketAt === null ? null : now - lastPacketAt,
		uptimeMs: now - bootAt,
		invalidated,
		loginError,
		lastDisconnect,
		lastError,
		guildsCached: client?.guilds.cache.size ?? 0,
		monitoredGuilds: monitoredGuildIds.map((id) => ({
			id,
			present: client?.guilds.cache.has(id) ?? false,
		})),
	}
}

/** Test hook. Production never calls this — one boot, one connection. */
export function resetGatewayStatus(): void {
	client = null
	monitoredGuildIds = []
	everReady = false
	readySince = null
	lastDownAt = null
	lastPacketAt = null
	invalidated = false
	loginError = null
	lastDisconnect = null
	lastError = null
}
