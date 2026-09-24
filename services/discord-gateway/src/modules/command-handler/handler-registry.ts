import {
  COMMAND_GUILDS_LIST,
  COMMAND_GUILDS_TEXT_CHANNELS,
  COMMAND_MODERATION_ACTION,
  type CommandMessage,
  type CommandReply,
} from "../../shared/redis-channels.js";
import type { GuildHandler } from "./guild.handler.js";
import type { ModerationHandler } from "./moderation.handler.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CommandHandlerFn = (
  cmd: CommandMessage,
) => Promise<CommandReply<unknown>>;

// ---------------------------------------------------------------------------
// Registry factory
// ---------------------------------------------------------------------------

export function createHandlerRegistry(
  guildHandler: GuildHandler,
  moderationHandler: ModerationHandler,
): Map<string, CommandHandlerFn> {
  const registry = new Map<string, CommandHandlerFn>();

  // Guild commands
  registry.set(COMMAND_GUILDS_LIST, (cmd) =>
    guildHandler.handleListGuilds(cmd),
  );
  registry.set(COMMAND_GUILDS_TEXT_CHANNELS, (cmd) =>
    guildHandler.handleTextChannels(cmd),
  );

  // Moderation commands
  registry.set(COMMAND_MODERATION_ACTION, (cmd) =>
    moderationHandler.handleModerationAction(cmd),
  );

  return registry;
}
