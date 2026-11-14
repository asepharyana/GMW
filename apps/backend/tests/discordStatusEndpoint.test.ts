import { Constants } from "discord.js-selfbot-v13"
import { afterEach, describe, expect, it } from "vitest"
import {
	markGatewayDisconnected,
	markGatewayPacket,
	markGatewayReady,
	resetGatewayStatus,
	setGatewayClient,
} from "../src/infrastructure/modules-gateway/gateway-health/index.js"
import type { UseCases } from "../src/presentation/composition.js"
import { createHealthRoutes } from "../src/presentation/http/health.routes.js"

/**
 * The contract the ops watchdog reads.
 *
 * `infra/scripts/gmw-watchdog.sh` parses `/api/discord/status` field by field, so
 * the field names, their types and the "always 200" rule are an interface, not
 * an implementation detail. Renaming `lastPacketAgoMs` or making this endpoint
 * 503 on a degraded gateway would break alerting silently — the watchdog would
 * log SKIP and claim nothing, which looks exactly like a healthy run.
 *
 * The graph only has to EXIST: `createHealthRoutes` closes over `useCases` and
 * touches nothing until a handler runs, so a fake health service is enough.
 */
const useCases = {
	health: {
		getHealth: async () => ({
			status: "healthy" as const,
			timestamp: Date.now(),
		}),
	},
} as unknown as UseCases

const get = (path: string) =>
	createHealthRoutes(useCases).request(`http://localhost${path}`)

afterEach(() => resetGatewayStatus())

describe("GET /api/discord/status", () => {
	it("answers 200 even when the gateway is broken", async () => {
		// This is a REPORT, not a verdict. The watchdog decides what is degraded,
		// because only it knows the boot grace and the backlog it will tolerate. A
		// 503 here would be read as "unobservable" and the run would claim nothing
		// — a dead gateway that produces no alert at all.
		setGatewayClient(
			{
				isReady: () => false,
				ws: { status: Constants.Status.DISCONNECTED },
				guilds: { cache: { size: 0, has: () => false } },
			},
			[],
		)
		markGatewayDisconnected(4004, "Authentication failed.")

		const res = await get("/discord/status")

		expect(res.status).toBe(200)
		expect(res.headers.get("content-type")).toContain("application/json")
	})

	it("publishes every field the watchdog parses", async () => {
		setGatewayClient(
			{
				isReady: () => true,
				ws: { status: Constants.Status.READY },
				guilds: { cache: { size: 2, has: (id: string) => id === "111" } },
			},
			["111", "222"],
		)
		markGatewayReady()
		markGatewayPacket()

		const body = (await (await get("/discord/status")).json()) as Record<
			string,
			unknown
		>

		// Named individually rather than compared as a whole object: an added field
		// is fine, a renamed or removed one breaks the shell parser.
		for (const field of [
			"state",
			"connected",
			"everReady",
			"readySince",
			"downSince",
			"lastPacketAt",
			"lastPacketAgoMs",
			"uptimeMs",
			"invalidated",
			"loginError",
			"lastDisconnect",
			"lastError",
			"guildsCached",
			"monitoredGuilds",
		]) {
			expect(body, `missing field ${field}`).toHaveProperty(field)
		}

		expect(body.connected).toBe(true)
		expect(body.everReady).toBe(true)
		expect(body.state).toBe("ready")
		expect(body.monitoredGuilds).toEqual([
			{ id: "111", present: true },
			{ id: "222", present: false },
		])
	})
})

describe("GET /api/health", () => {
	it("stays database-only so a dead gateway does not fail a deploy", async () => {
		// `deploy-direct.sh` gates every deploy on this returning 200, and
		// `src/index.ts` deliberately keeps the HTTP surface up when Discord login
		// fails. Folding gateway health in here would fail deploys for a fault the
		// service is designed to survive.
		setGatewayClient(
			{
				isReady: () => false,
				ws: { status: Constants.Status.DISCONNECTED },
				guilds: { cache: { size: 0, has: () => false } },
			},
			[],
		)

		const res = await get("/health")

		expect(res.status).toBe(200)
		expect(await res.json()).toMatchObject({ status: "healthy" })
	})
})
