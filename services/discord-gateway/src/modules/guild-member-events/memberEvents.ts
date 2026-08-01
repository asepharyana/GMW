import type {
  Client,
  GuildMember,
  PartialGuildMember,
} from "discord.js-selfbot-v13";
import { createChildLogger } from "@/shared/logger/index";
import { config } from "../../shared/config/config.js";
import type { EventBroadcaster } from "../event-broadcaster/eventBroadcaster.js";

const logger = createChildLogger("guild-member-events");

function isMonitoredGuild(guildId: string | null | undefined): boolean {
  if (!guildId) return false;
  const guildIds = (config as any).EFFECTIVE_MONITOR_GUILD_IDS as
    | string[]
    | undefined;
  if (!guildIds || guildIds.length === 0)
    return config.MONITOR_GUILD_ID === guildId;
  return guildIds.includes(guildId);
}

export function registerGuildMemberEvents(
  client: Client,
  eventBroadcaster: EventBroadcaster,
): void {
  logger.info("Registering guild member events");

  client.on("guildMemberAdd", async (member: GuildMember) => {
    if (!isMonitoredGuild(member.guild.id)) return;

    const data = {
      user_id: member.id,
      username: member.user.username,
      tag: member.user.tag ?? null,
      avatar_url: member.user.avatarURL() ?? null,
      guild_id: member.guild.id,
      member_count: member.guild.memberCount,
      joined_at: Date.now(),
    };

    logger.info(
      { userId: member.id, username: member.user.username },
      "Guild member added",
    );
    await eventBroadcaster.guildMemberAdded(data).catch(() => {});
  });

  client.on(
    "guildMemberRemove",
    async (member: GuildMember | PartialGuildMember) => {
      if (!isMonitoredGuild(member.guild.id)) return;

      const data = {
        user_id: member.id,
        username: (member.user as any)?.username ?? "unknown",
        tag: (member.user as any)?.tag ?? null,
        guild_id: member.guild.id,
        member_count: member.guild.memberCount,
        removed_at: Date.now(),
      };

      logger.info(
        { userId: member.id, username: member.user?.username },
        "Guild member removed",
      );
      await eventBroadcaster.guildMemberRemoved(data).catch(() => {});
    },
  );
}
