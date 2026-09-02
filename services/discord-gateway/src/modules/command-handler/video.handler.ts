import type { Client, Guild, VoiceChannel } from "discord.js-selfbot-v13";
import type { CommandMessage, CommandReply } from "../../shared/index.js";
import {
  startStreamWatch,
  stopStreamWatch,
} from "../voice-recording/streamWatchReceiver.js";
import type { VoiceController } from "../voice-recording/voiceController.js";

// ---------------------------------------------------------------------------
// VideoHandler — manual screen-share / camera watch (selfbot-viable capture)
// ---------------------------------------------------------------------------
//
// On a selfbot (user token) there is NO automatic detection of other members'
// video (no VOICE_STATE_UPDATE for them, no member list). The only way to
// capture another member's SCREEN SHARE is an operator-initiated STREAM_WATCH
// (gateway op 20, NOT gated on bot-vs-user) — which this handler exposes as a
// backend→gateway Redis command. `streamWatchReceiver` does the DAVE handshake,
// per-burst `.mp4` segmentation (mirroring voice silence split), DB insert and
// Tele upload exactly like the audio path.
//
// Camera-of-others stays impossible on a selfbot (DAVE decrypt is keyed per real
// userId and a selfbot cannot learn others' ids), so this command targets SCREEN
// SHARE. Watching the operator's OWN camera/share is a separate (parameterized)
// follow-up.
export class VideoHandler {
  constructor(
    private client: Client | null,
    private voiceController: VoiceController | null,
  ) {}

  setClient(client: Client): void {
    this.client = client;
  }

  setVoiceController(vc: VoiceController): void {
    this.voiceController = vc;
  }

  /**
   * Resolve the active voice channel for a guild from the voice controller.
   * Prefers the controller's live connection; falls back to the client cache.
   */
  private async resolveChannel(
    guildId: string,
    requestedChannelId?: string,
  ): Promise<{ guild: Guild; channel: VoiceChannel } | null> {
    const client = this.client;
    if (!client) return null;
    const guild =
      client.guilds.cache.get(guildId) ??
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) return null;

    // If an explicit channelId was given, use it.
    const channelId =
      requestedChannelId || this.voiceController?.getStatus()?.activeChannelId;
    if (channelId) {
      const ch = (guild.channels.cache.get(channelId) ??
        (await guild.channels
          .fetch(channelId)
          .catch(() => null))) as VoiceChannel | null;
      if (ch && ch.type === "GUILD_VOICE") return { guild, channel: ch };
    }
    // Fallback: any voice channel the account is currently in.
    const voiceCh = Array.from(guild.channels.cache.values()).find(
      (c): c is VoiceChannel =>
        c.type === "GUILD_VOICE" && c.members?.has(client.user?.id ?? ""),
    );
    return voiceCh ? { guild, channel: voiceCh } : null;
  }

  async handleVideoWatch(cmd: CommandMessage): Promise<CommandReply<unknown>> {
    if (!this.client) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Gateway not initialized",
      };
    }
    const guildId = String(cmd.payload.guildId ?? "");
    const userId = String(cmd.payload.userId ?? "");
    const channelId = String(cmd.payload.channelId ?? "");
    if (!guildId || !userId) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "guildId and userId are required",
      };
    }

    const resolved = await this.resolveChannel(guildId, channelId || undefined);
    if (!resolved) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "No active voice channel to watch in this guild",
      };
    }
    if (userId === this.client.user?.id) {
      // Self-watch is intentionally not enabled by default (see file header).
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "Watching the selfbot's own stream is not enabled",
      };
    }

    await startStreamWatch(resolved.channel, userId);
    return {
      id: cmd.id,
      success: true,
      data: {
        status: "requested",
        guildId,
        channelId: resolved.channel.id,
        userId,
      },
    };
  }

  async handleVideoUnwatch(
    cmd: CommandMessage,
  ): Promise<CommandReply<unknown>> {
    const guildId = String(cmd.payload.guildId ?? "");
    const userId = String(cmd.payload.userId ?? "");
    if (!guildId || !userId) {
      return {
        id: cmd.id,
        success: false,
        data: null,
        error: "guildId and userId are required",
      };
    }
    stopStreamWatch(guildId, userId);
    return {
      id: cmd.id,
      success: true,
      data: { status: "stopped", guildId, userId },
    };
  }
}
