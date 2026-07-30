import { createChildLogger } from "@/shared/logger/index";
import type { Client, TextChannel } from "discord.js-selfbot-v13";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";

const logger = createChildLogger("channel-topic");

function isMonitoredGuild(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  const guildIds = (config as any).EFFECTIVE_MONITOR_GUILD_IDS as
    | string[]
    | undefined;
  if (!guildIds || guildIds.length === 0)
    return config.MONITOR_GUILD_ID === guildId;
  return guildIds.includes(guildId);
}

export function registerChannelTopicCapture(
  client: Client,
  eventBroadcaster: EventBroadcaster,
): void {
  logger.info("Registering channel topic capture");

  client.on("channelUpdate", async (oldChannel, newChannel) => {
    // Only care about text channels
    if (newChannel.type !== "GUILD_TEXT") return;
    if (!isMonitoredGuild(newChannel.guildId)) return;

    const oldText = oldChannel as TextChannel;
    const newText = newChannel as TextChannel;

    const oldTopic = oldText.topic ?? "";
    const newTopic = newText.topic ?? "";

    if (oldTopic === newTopic) return;

    const data = {
      channel_id: newText.id,
      guild_id: newText.guildId,
      channel_name: newText.name,
      old_topic: oldTopic || null,
      new_topic: newTopic || null,
      updated_at: Date.now(),
    };

    logger.info(
      { channelId: newText.id, channelName: newText.name },
      "Channel topic updated",
    );
    await eventBroadcaster.channelTopicUpdated(data).catch(() => {});
  });
}
