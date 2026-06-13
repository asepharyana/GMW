// ---------------------------------------------------------------------------
// Redis Channel Constants — single source of truth
//
// All Redis channel names, status keys, and command types used for
// inter-service communication between discord-gateway and backend.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Event channels (discord-gateway -> backend via pub/sub)
// ---------------------------------------------------------------------------

export const DISCORD_MESSAGE_CREATED = "discord:message:created";
export const DISCORD_MESSAGE_UPDATED = "discord:message:updated";
export const DISCORD_MESSAGE_DELETED = "discord:message:deleted";
export const DISCORD_MESSAGE_ANALYZED = "discord:message:analyzed";
export const DISCORD_ATTACHMENT_CREATED = "discord:attachment:created";
export const DISCORD_ATTACHMENT_UPLOADED = "discord:attachment:uploaded";
export const DISCORD_VOICE_STARTED = "discord:voice:started";
export const DISCORD_VOICE_STOPPED = "discord:voice:stopped";
export const DISCORD_VOICE_UPLOADED = "discord:voice:uploaded";
export const DISCORD_VOICE_ACTIVE_USER = "discord:voice:active_user";
export const DISCORD_VOICE_PCM = "discord:voice:pcm";
export const DISCORD_ANALYSIS_QUEUE_STATUS = "discord:analysis:queue_status";
export const DISCORD_REACTION_ADDED = "discord:reaction:added";
export const DISCORD_REACTION_REMOVED = "discord:reaction:removed";
export const DISCORD_THREAD_CREATED = "discord:thread:created";
export const DISCORD_THREAD_DELETED = "discord:thread:deleted";
export const DISCORD_THREAD_UPDATED = "discord:thread:updated";
export const DISCORD_CHANNEL_TOPIC_UPDATED = "discord:channel:topic_updated";
export const DISCORD_PRESENCE_UPDATED = "discord:presence:updated";
export const DISCORD_GUILD_MEMBER_ADDED = "discord:guild_member:added";
export const DISCORD_GUILD_MEMBER_REMOVED = "discord:guild_member:removed";

// ---------------------------------------------------------------------------
// Command channels (backend -> discord-gateway)
// ---------------------------------------------------------------------------

export const BACKEND_COMMAND = "backend:command";
export const BACKEND_VOICE_TRANSMIT = "backend:voice:transmit";
export const BACKEND_COMMAND_REPLY_PREFIX = "backend:command:reply:";

// ---------------------------------------------------------------------------
// Status keys (set by discord-gateway, read by backend via Redis GET)
// ---------------------------------------------------------------------------

export const VOICE_STATUS_KEY = "voice:status";
export const MEDIA_STATUS_KEY = "media:status";

// ---------------------------------------------------------------------------
// Command types (used as the `type` field in CommandMessage envelopes)
// ---------------------------------------------------------------------------

export const COMMAND_VOICE_CONNECT = "voice:connect";
export const COMMAND_VOICE_DISCONNECT = "voice:disconnect";
export const COMMAND_VOICE_DISCONNECT_GUILD = "voice:disconnect:guild";
export const COMMAND_VOICE_CHANNELS = "voice:channels";
export const COMMAND_VOICE_TRANSMIT_START = "voice:transmit:start";
export const COMMAND_VOICE_TRANSMIT_STOP = "voice:transmit:stop";
export const COMMAND_GUILDS_LIST = "guilds:list";
export const COMMAND_GUILDS_TEXT_CHANNELS = "guilds:text-channels";
export const COMMAND_MEDIA_QUEUE = "media:queue";
export const COMMAND_MEDIA_SKIP = "media:skip";
export const COMMAND_MEDIA_STOP = "media:stop";
export const COMMAND_MEDIA_VOLUME = "media:volume";
export const COMMAND_MODERATION_ACTION = "moderation:action";
export const DISCORD_VOICE_ANALYZED = "discord:voice:analyzed";

// ---------------------------------------------------------------------------
// Event envelope — used by discord-gateway when publishing to Redis
// ---------------------------------------------------------------------------

export interface DiscordGatewayEvent {
  type: string;
  data: unknown;
  timestamp: number;
  source: string;
}

// ---------------------------------------------------------------------------
// Command envelope — used by backend when publishing to backend:command
// ---------------------------------------------------------------------------

export interface CommandMessage {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  replyChannel: string;
}

export interface CommandReply<T = unknown> {
  id: string;
  success: boolean;
  data?: T;
  error?: string;
}
