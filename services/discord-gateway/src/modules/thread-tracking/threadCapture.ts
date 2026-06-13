import { createChildLogger } from "@bete/shared/logger";
import type { Client, ThreadChannel } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";

const logger = createChildLogger("thread-tracking");

function isMonitoredGuild(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  const guildIds = (config as any).EFFECTIVE_MONITOR_GUILD_IDS as string[] | undefined;
  if (!guildIds || guildIds.length === 0) return config.MONITOR_GUILD_ID === guildId;
  return guildIds.includes(guildId);
}

export function registerThreadCapture(
  client: Client,
  eventBroadcaster: EventBroadcaster,
): void {
  logger.info("Registering thread capture");

  client.on("threadCreate", async (thread: ThreadChannel) => {
    if (!isMonitoredGuild(thread.guildId)) return;

    const data = {
      id: thread.id,
      guild_id: thread.guildId,
      channel_id: thread.parentId ?? thread.guildId,
      name: thread.name,
      owner_id: thread.ownerId ?? null,
      type: thread.type,
      archived: (thread as any).archived ?? false,
      created_at: Date.now(),
    };

    logger.debug({ threadId: thread.id, name: thread.name }, "Thread created");
    await eventBroadcaster.threadCreated(data).catch(() => {});
  });

  client.on("threadDelete", async (thread: ThreadChannel) => {
    if (!isMonitoredGuild(thread.guildId)) return;

    const data = {
      id: thread.id,
      guild_id: thread.guildId,
      channel_id: thread.parentId ?? thread.guildId,
      name: thread.name,
      deleted_at: Date.now(),
    };

    logger.debug({ threadId: thread.id }, "Thread deleted");
    await eventBroadcaster.threadDeleted(data).catch(() => {});
  });

  client.on("threadUpdate", async (_oldThread: ThreadChannel, newThread: ThreadChannel) => {
    if (!isMonitoredGuild(newThread.guildId)) return;

    const data = {
      id: newThread.id,
      guild_id: newThread.guildId,
      channel_id: newThread.parentId ?? newThread.guildId,
      name: newThread.name,
      archived: (newThread as any).archived ?? false,
      rate_limit_per_user: (newThread as any).rateLimitPerUser ?? null,
      updated_at: Date.now(),
    };

    logger.debug({ threadId: newThread.id }, "Thread updated");
    await eventBroadcaster.threadUpdated(data).catch(() => {});
  });
}
