import { type CommandMessage, type CommandReply } from "@bete/shared";
import { createChildLogger } from "@bete/shared/logger";
import type { Client } from "discord.js-selfbot-v13";

// ---------------------------------------------------------------------------
// GuildHandler
// ---------------------------------------------------------------------------

export class GuildHandler {
  private logger = createChildLogger("guild-handler");

  constructor(private client: Client | null) {}

  setClient(client: Client): void {
    this.client = client;
  }

  async handleListGuilds(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    try {
      const guilds = this.client.guilds.cache.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.iconURL() ?? null,
      }));

      return { id: cmd.id, success: true, data: guilds };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error({ error: msg }, "Failed to list guilds");
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }

  async handleTextChannels(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }

    const guildId = String(cmd.payload.guildId ?? "");
    if (!guildId) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "guildId is required",
      };
    }

    try {
      const guild = await this.client.guilds.fetch(guildId);
      const channels = await guild.channels.fetch();
      const textChannels = channels
        .filter((c) => c?.type === "GUILD_TEXT")
        .map((c) => ({
          id: c.id,
          name: c.name,
          type: "text" as const,
        }));

      return { id: cmd.id, success: true, data: textChannels };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.error(
        { error: msg, guildId },
        "Failed to list text channels",
      );
      return { id: cmd.id, success: false, data: null, error: msg };
    }
  }
}
