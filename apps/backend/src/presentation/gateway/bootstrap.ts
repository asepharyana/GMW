import { Client } from "discord.js-selfbot-v13"
import {
	ConfigError,
	DatabaseError,
	errorMessage,
} from "../../domain/errors/index.js"
import { config } from "../../infrastructure/config/index.js"
import { initializeDatabase } from "../../infrastructure/database/drizzle.js"
import { runMigrations } from "../../infrastructure/database/migrate.js"
import { createDiscordClientOptions } from "../../infrastructure/discord/clientOptions.js"
import {
	createChildLogger,
	DEBUG_VERBOSE,
} from "../../infrastructure/logger/index.js"
import { startAutoDeleteEnforcer } from "../../infrastructure/modules-gateway/ai-moderation/autoDeleteEnforcer.js"
import {
	EventBroadcaster,
	RedisEventPublisher,
} from "../../infrastructure/modules-gateway/event-broadcaster/index.js"
import {
	markGatewayDisconnected,
	markGatewayError,
	markGatewayInvalidated,
	markGatewayPacket,
	markGatewayReady,
	markGatewayReconnecting,
	markLoginFailed,
	setGatewayClient,
} from "../../infrastructure/modules-gateway/gateway-health/index.js"
import {
	startMetricsServer,
	stopMetricsServer,
} from "../../infrastructure/modules-gateway/gateway-metrics/index.js"
import { buildRetentionDeps } from "../composition.js"
import { startGatewayLifecycle } from "./lifecycle.js"
import { registerPipelineMetrics } from "./metrics-collector.js"

const logger = createChildLogger("capture")

// ─── Bootstrap ─────────────────────────────────────────────────────────────
//
// Startup order:
//   1. validate config            (fail fast on missing AI credentials)
//   2. connect infrastructure     (migrations → DB pool)
//   3. build long-lived services  (Discord client, Redis publisher, command
//                                  handler) + install shutdown/process guards
//   4. start observability        (pipeline gauges → metrics server)
//   5. log in                     (ready-hook wires listeners via lifecycle.ts)

/** Refuse to start without LLM credentials. */
function assertConfigIsUsable(): void {
	if (!config.AI_LLM_API_KEY) {
		throw new ConfigError(
			"AI_LLM_API_KEY is missing from environment. AI analysis cannot run without credentials.",
		)
	}
}

/** Run migrations then open the PostgreSQL pool.
 *
 *  Exported because `main()` in `index.ts` runs it as the FIRST startup step,
 *  before the HTTP surface can accept a connection — see the comment there for
 *  why the order matters. `initializeDiscordGateway` still asks for it too, so
 *  the gateway stays independently bootable when run on its own.
 *
 *  Both callers are safe: `runMigrations` serialises on an advisory lock, and
 *  `initializeDatabase` returns the existing handle rather than opening a
 *  second pool.
 */
export async function connectDatabase(): Promise<void> {
	try {
		logger.info("running database migrations")
		await runMigrations()

		logger.info("Initializing database")
		await initializeDatabase()
		logger.info("PostgreSQL database initialized")
	} catch (err) {
		logger.error(
			{ err, errorMsg: errorMessage(err) },
			"Failed to initialize database",
		)
		throw new DatabaseError(
			`Database initialization failed: ${errorMessage(err)}`,
		)
	}
}

/** Log only client debug lines that carry signal (errors/streams, or VERBOSE). */
function registerClientDebugLogging(client: Client): void {
	client.on("debug", (msg) => {
		const lower = msg.toLowerCase()
		if (lower.includes("error") || lower.includes("stream")) {
			logger.info({ debugMsg: msg }, "Discord Client Debug")
		} else if (DEBUG_VERBOSE) {
			logger.debug({ debugMsg: msg }, "Discord Client Debug")
		}
	})
}

export async function initializeDiscordGateway() {
	assertConfigIsUsable()

	const token = config.DISCORD_TOKEN
	logger.info(
		{ hasToken: token.length > 0, tokenLength: token.length },
		"Config loaded",
	)

	logger.info("Creating Discord client")
	const client = new Client(createDiscordClientOptions())

	// Publish this connection's own health before anything can go wrong with it,
	// so `/api/discord/status` has something to report during boot. The watched
	// guilds come from the same derived list capture filters on — one source of
	// truth, so the status can never name a guild the gateway ignores.
	setGatewayClient(client, config.EFFECTIVE_MONITOR_GUILD_IDS)

	// Long-lived services: the Redis event broadcaster, which carries
	// captured events from the gateway modules to the backend's bridge.
	//
	// The Redis bus is kept rather than collapsed into a direct call. Publishing
	// still goes out over Redis and the backend's bridge still reads it, so an
	// event survives a module-level failure and the wire format the frontend's
	// handlers already parse is untouched.
	const redisPublisher = new RedisEventPublisher(config.REDIS_URL, logger)
	const eventBroadcaster = new EventBroadcaster(redisPublisher)

	await connectDatabase()

	registerClientDebugLogging(client)

	// Gateway liveness, recorded where the credential lives.
	//
	// Every frame the library receives is re-emitted as `raw` — heartbeats
	// included — so this is the difference between "the socket is open" and
	// "Discord is still talking to us". A wedged connection keeps the socket and
	// reports READY while delivering nothing, which is invisible to every other
	// check. Nothing here leaves the box: it is all local state, which is the
	// whole reason the watchdog stopped probing Discord's REST API.
	client.on("raw", () => markGatewayPacket())
	client.on("shardResume", () => markGatewayReady())
	client.on("shardReconnecting", () => markGatewayReconnecting())
	client.on("shardDisconnect", (event) =>
		markGatewayDisconnected(event.code, event.reason),
	)
	client.on("shardError", (err) => markGatewayError(err))
	// Emitted when re-identifying fails outright. Only a restart recovers, so
	// this must be loud: capture is dead while the dashboard stays healthy.
	client.on("invalidated", () => markGatewayInvalidated())

	client.on("ready", () => {
		markGatewayReady()
		logger.info({ user: client.user?.tag }, "Bot logged in")
		startGatewayLifecycle({
			client,
			eventBroadcaster,
			logger,
			retention: buildRetentionDeps(),
		})
		// Enforcement needs a live client, so it starts only once logged in. It
		// polls the verdicts the worker wrote — capture never waits on the worker,
		// and the worker never waits on capture.
		startAutoDeleteEnforcer(client)
	})

	client.on("error", (err) => {
		markGatewayError(err)
		logger.error({ err, errorMsg: errorMessage(err) }, "Client error")
	})

	// Metrics: register live pipeline collectors before starting the server.
	registerPipelineMetrics(logger)
	startMetricsServer()

	logger.info("Calling Discord client.login")
	try {
		await client.login(token)
		logger.info("Discord client logged in successfully")
	} catch (err) {
		// Recorded, not just logged: this is the only in-process evidence that
		// the stored token is dead, and `/api/discord/status` is what the
		// watchdog reads to say so. Without it the process would look merely
		// "not connected yet" forever.
		markLoginFailed(err)
		logger.fatal({ err }, "Failed to login Discord client")
		throw err
	}

	// The process has ONE shutdown path now (src/index.ts). This used to install
	// its own SIGINT/SIGTERM/uncaughtException handlers and call process.exit(),
	// which in a merged process would race the HTTP server's close and the
	// worker's lease release — and could exit while a dashboard socket was still
	// answering. So the teardown is handed back to the caller instead.
	return async () => {
		stopMetricsServer()
		await eventBroadcaster
			.close()
			.catch((err) => logger.warn({ err }, "Error closing event broadcaster"))
		client.destroy()
		logger.info("Discord capture stopped")
	}
}
