import { Hono } from "hono"
import { collectDefaultMetrics, register } from "prom-client"
import { gatewayStatusSnapshot } from "../../infrastructure/modules-gateway/gateway-health/index.js"
import type { UseCases } from "../composition.js"

// Initialize default Node.js runtime metrics (event loop lag, memory, GC, etc.)
// Called once at module load, not per-request.
collectDefaultMetrics()

/**
 * Infra-only endpoints. Was an Express `Router` mounted with
 * `app.use("/api", …)`; Hono mounts a sub-app with `app.route("/api", …)`, so
 * paths inside it are written without the prefix.
 *
 * Everything here answers a machine on loopback — the deploy script's probes,
 * Prometheus, and the ops watchdog. None of it is part of the dashboard API,
 * which is what `/trpc` is for.
 */
export function createHealthRoutes(useCases: UseCases) {
	return (
		new Hono()
			// GET /api/health — 200 healthy / 503 degraded.
			//
			// DATABASE ONLY, and that is deliberate. `deploy-direct.sh` gates every
			// deploy on this returning 200, and `src/index.ts` deliberately keeps the
			// HTTP surface up when Discord login fails so an operator can still reach
			// the dashboard and see why. Making a dead gateway turn this into a 503
			// would fail deploys for a fault that is already visible on the dashboard,
			// and would leave the service "unhealthy" for a condition it is designed
			// to survive. Gateway health is reported separately, at
			// `/api/discord/status`, where a caller can weigh it.
			//
			// `verbose` is read off the raw query string rather than a parsed object,
			// matching the Express version's `req.query.verbose === "true"` exactly:
			// only that literal string opts in.
			.get("/health", async (c) => {
				const verbose =
					new URL(c.req.url).searchParams.get("verbose") === "true"
				const result = await useCases.health.getHealth(verbose)
				return c.json(result, result.status === "healthy" ? 200 : 503)
			})
			// GET /api/discord/status — the gateway's own view of its connection.
			//
			// This REPLACES an authenticated `GET /users/@me` probe the ops watchdog
			// used to fire every five minutes from this box. That probe was a
			// datacenter IP making a user-token REST call on a timer with no gateway
			// session behind it — indistinguishable from a selfbot, and a good way to
			// get the account it was guarding banned. The connection it was trying to
			// verify is right here, already authenticated, so this endpoint just
			// reports it. No outbound request, no credential used.
			//
			// Always 200: this is a report, not a verdict. The caller decides what is
			// degraded, because only it knows the boot grace period and the backlog
			// it is willing to tolerate.
			.get("/discord/status", (c) => c.json(gatewayStatusSnapshot()))
			// GET /api/metrics — Prometheus scrape endpoint.
			.get("/metrics", async (c) => {
				c.header("Content-Type", register.contentType)
				return c.text(await register.metrics())
			})
	)
}
