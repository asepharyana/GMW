import {
  COMMAND_GUILDS_LIST,
  COMMAND_GUILDS_TEXT_CHANNELS,
  COMMAND_MEDIA_QUEUE,
  COMMAND_MEDIA_SKIP,
  COMMAND_MEDIA_STOP,
  COMMAND_MEDIA_VOLUME,
  COMMAND_MODERATION_ACTION,
  COMMAND_VOICE_CHANNELS,
  COMMAND_VOICE_CONNECT,
  COMMAND_VOICE_DISCONNECT,
  COMMAND_VOICE_DISCONNECT_GUILD,
  COMMAND_VOICE_TRANSMIT_START,
  COMMAND_VOICE_TRANSMIT_STOP,
  type CommandMessage,
  type CommandReply,
} from "@bete/shared";
import type { GuildHandler } from "./guild.handler.js";
import type { MediaHandler } from "./media.handler.js";
import type { ModerationHandler } from "./moderation.handler.js";
import type { VoiceHandler } from "./voice.handler.js";

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
  voiceHandler: VoiceHandler,
  mediaHandler: MediaHandler,
  guildHandler: GuildHandler,
  moderationHandler: ModerationHandler,
): Map<string, CommandHandlerFn> {
  const registry = new Map<string, CommandHandlerFn>();

  // Voice commands
  registry.set(COMMAND_VOICE_CONNECT, (cmd) =>
    voiceHandler.handleVoiceConnect(cmd),
  );
  registry.set(COMMAND_VOICE_DISCONNECT, (cmd) =>
    voiceHandler.handleVoiceDisconnect(cmd),
  );
  registry.set(COMMAND_VOICE_DISCONNECT_GUILD, (cmd) =>
    voiceHandler.handleVoiceDisconnectGuild(cmd),
  );
  registry.set(COMMAND_VOICE_CHANNELS, (cmd) =>
    voiceHandler.handleVoiceChannels(cmd),
  );
  registry.set(COMMAND_VOICE_TRANSMIT_START, (cmd) =>
    voiceHandler.handleVoiceTransmitStart(cmd),
  );
  registry.set(COMMAND_VOICE_TRANSMIT_STOP, (cmd) =>
    voiceHandler.handleVoiceTransmitStop(cmd),
  );

  // Media commands
  registry.set(COMMAND_MEDIA_QUEUE, (cmd) =>
    mediaHandler.handleMediaQueue(cmd),
  );
  registry.set(COMMAND_MEDIA_SKIP, (cmd) => mediaHandler.handleMediaSkip(cmd));
  registry.set(COMMAND_MEDIA_STOP, (cmd) => mediaHandler.handleMediaStop(cmd));
  registry.set(COMMAND_MEDIA_VOLUME, (cmd) =>
    mediaHandler.handleMediaVolume(cmd),
  );

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
