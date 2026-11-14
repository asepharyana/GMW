import { Constants } from "discord.js-selfbot-v13"
import { afterEach, describe, expect, it } from "vitest"
import {
	type GatewayClientLike,
	gatewayStatusSnapshot,
	markGatewayDisconnected,
	markGatewayInvalidated,
	markGatewayPacket,
	markGatewayReady,
	markLoginFailed,
	resetGatewayStatus,
	setGatewayClient,
} from "../src/infrastructure/modules-gateway/gateway-health/gatewayStatus.js"

/**
 * The watchdog's only source of truth about the Discord session, tested without
 * a socket, a token or a network call — which is the entire reason the probe
 * moved in here in the first place.
 *
 * The assertions are about the DISCRIMINATIONS the watchdog depends on, not
 * about field plumbing. Each one exists because getting it wrong produces a
 * specific, observed false alarm or a specific silent failure.
 */

/** Stands in for a `Client`. Only the three members the tracker reads. */
function fakeClient(opts: {
	ready?: boolean
	status?: number
	guilds?: string[]
}): GatewayClientLike {
	const cached = new Set(opts.guilds ?? [])
	return {
		isReady: () => opts.ready ?? false,
		ws: { status: opts.status ?? Constants.Status.READY },
		guilds: {
			cache: { size: cached.size, has: (id: string) => cached.has(id) },
		},
	}
}

afterEach(() => resetGatewayStatus())

describe("gatewayStatus", () => {
	it("reports unknown before a client exists", () => {
		const s = gatewayStatusSnapshot()

		expect(s.state).toBe("unknown")
		expect(s.connected).toBe(false)
		expect(s.everReady).toBe(false)
		// No client and no packets: the watchdog must not read this as a wedged
		// socket, so the packet age is explicitly null rather than 0.
		expect(s.lastPacketAgoMs).toBeNull()
	})

	it("names the library's numeric status in words", () => {
		setGatewayClient(fakeClient({ status: Constants.Status.READY }), [])
		expect(gatewayStatusSnapshot().state).toBe("ready")

		setGatewayClient(fakeClient({ status: Constants.Status.RECONNECTING }), [])
		expect(gatewayStatusSnapshot().state).toBe("reconnecting")
	})

	it("records the first ready as a one-way transition", () => {
		setGatewayClient(fakeClient({ ready: true }), [])
		expect(gatewayStatusSnapshot().everReady).toBe(false)

		markGatewayReady()
		const first = gatewayStatusSnapshot()
		expect(first.everReady).toBe(true)
		expect(first.readySince).toBeTypeOf("number")

		// A shard resume re-emits ready. If that restamped readySince, a session
		// that has been up for hours would look seconds old — which is what the
		// guild-settle grace period is measured against.
		const stamped = first.readySince
		markGatewayReady()
		expect(gatewayStatusSnapshot().readySince).toBe(stamped)
	})

	it("tracks packet age, which is the only wedged-socket signal", () => {
		setGatewayClient(fakeClient({ ready: true }), [])
		markGatewayReady()
		expect(gatewayStatusSnapshot().lastPacketAt).toBeNull()

		markGatewayPacket()
		const s = gatewayStatusSnapshot()
		expect(s.lastPacketAt).toBeTypeOf("number")
		expect(s.lastPacketAgoMs).toBeGreaterThanOrEqual(0)
	})

	it("separates a dead token from a normal reconnect", () => {
		// Dead token: login threw, so the client never became ready. The watchdog
		// reports this from `loginError` and never waits out a grace period.
		setGatewayClient(fakeClient({ ready: false }), [])
		markLoginFailed(new Error("An invalid token was provided"))
		const failed = gatewayStatusSnapshot()
		expect(failed.loginError).toBe("An invalid token was provided")
		expect(failed.everReady).toBe(false)

		// Normal reconnect: was ready, is not now. `everReady` is what tells the
		// watchdog to apply the short down-window instead of the boot grace.
		resetGatewayStatus()
		setGatewayClient(fakeClient({ ready: true }), [])
		markGatewayReady()
		setGatewayClient(fakeClient({ ready: false }), [])
		markGatewayDisconnected(1006, "transport close")
		const down = gatewayStatusSnapshot()
		expect(down.everReady).toBe(true)
		expect(down.connected).toBe(false)
		expect(down.downSince).toBeTypeOf("number")
		expect(down.lastDisconnect?.code).toBe(1006)
		expect(down.loginError).toBeNull()
	})

	it("clears the login error once a login succeeds", () => {
		setGatewayClient(fakeClient({ ready: true }), [])
		markLoginFailed(new Error("transient"))
		expect(gatewayStatusSnapshot().loginError).toBe("transient")

		markGatewayReady()
		expect(gatewayStatusSnapshot().loginError).toBeNull()
	})

	it("flags an invalidated session, which only a restart clears", () => {
		setGatewayClient(fakeClient({ ready: false }), [])
		markGatewayInvalidated()
		expect(gatewayStatusSnapshot().invalidated).toBe(true)
		expect(gatewayStatusSnapshot().connected).toBe(false)

		// A `ready` must NOT clear it: the library destroyed its shards and will
		// never emit one again, so a flag that cleared itself here would report a
		// dead session as healthy the moment anything else went right.
		markGatewayReady()
		expect(gatewayStatusSnapshot().invalidated).toBe(true)
	})

	it("reports which monitored guilds the client can see", () => {
		setGatewayClient(fakeClient({ ready: true, guilds: ["111"] }), [
			"111",
			"222",
		])

		expect(gatewayStatusSnapshot().monitoredGuilds).toEqual([
			{ id: "111", present: true },
			{ id: "222", present: false },
		])
	})

	it("counts the process uptime, which bounds everReady's meaning", () => {
		const s = gatewayStatusSnapshot()
		expect(s.uptimeMs).toBeGreaterThanOrEqual(0)
		// Never ready and not connected: the whole process lifetime is the down
		// window, so the watchdog can apply a boot grace and then complain.
		expect(s.downSince).toBeTypeOf("number")
		expect(s.readySince).toBeNull()
	})
})
