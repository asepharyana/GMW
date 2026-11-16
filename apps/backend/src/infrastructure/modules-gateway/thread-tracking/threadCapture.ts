import type { Client, ThreadChannel } from "discord.js-selfbot-v13"
import { isMonitoredGuild } from "../../../domain/config/guildScope.js"
import { config } from "../../config/index.js"
import { createChildLogger } from "../../logger/index.js"
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js"

const logger = createChildLogger("thread-tracking")

/** Fields every thread event carries, whatever changed. */
function threadBase(thread: ThreadChannel) {
	return {
		id: thread.id,
		guild_id: thread.guildId,
		channel_id: thread.parentId ?? thread.guildId,
		name: thread.name,
	}
}

export function registerThreadCapture(
	client: Client,
	eventBroadcaster: EventBroadcaster,
): void {
	logger.info("Registering thread capture")

	client.on("threadCreate", async (thread: ThreadChannel) => {
		if (!isMonitoredGuild(config, thread.guildId)) return

		const data = {
			...threadBase(thread),
			owner_id: thread.ownerId ?? null,
			type: thread.type,
			archived: (thread as any).archived ?? false,
			created_at: Date.now(),
		}

		logger.debug({ threadId: thread.id, name: thread.name }, "Thread created")
		await eventBroadcaster.threadCreated(data).catch(() => {})
	})

	client.on("threadDelete", async (thread: ThreadChannel) => {
		if (!isMonitoredGuild(config, thread.guildId)) return

		const data = {
			...threadBase(thread),
			deleted_at: Date.now(),
		}

		logger.debug({ threadId: thread.id }, "Thread deleted")
		await eventBroadcaster.threadDeleted(data).catch(() => {})
	})

	client.on(
		"threadUpdate",
		async (_oldThread: ThreadChannel, newThread: ThreadChannel) => {
			if (!isMonitoredGuild(config, newThread.guildId)) return

			const data = {
				...threadBase(newThread),
				archived: (newThread as any).archived ?? false,
				rate_limit_per_user: (newThread as any).rateLimitPerUser ?? null,
				updated_at: Date.now(),
			}

			logger.debug({ threadId: newThread.id }, "Thread updated")
			await eventBroadcaster.threadUpdated(data).catch(() => {})
		},
	)
}
