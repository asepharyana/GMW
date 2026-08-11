/**
 * Streamer — gateway-level GoLive controller. Ported from
 * @dank074/discord-video-stream Streamer.js.
 *
 * Drives the Discord gateway (VOICE_STATE_UPDATE, STREAM_CREATE, ...) and
 * hands back a VoiceConnection / StreamConnection once the media server
 * session is ready.
 */

import { EventEmitter } from "node:events";
import { GatewayOpCodes } from "./GatewayOpCodes.js";
import type { NativePeerConnection } from "./native.js";
import { StreamConnection } from "./StreamConnection.js";
import { generateStreamKey, parseStreamKey } from "./utils.js";
import { VoiceConnection } from "./VoiceConnection.js";
import type { WebRtcConnWrapper } from "./WebRtcWrapper.js";

/** Minimal surface of a discord.js-selfbot-v13 client used by Streamer. */
export interface StreamerClientLike {
  user: { id: string; username?: string } | null;
  token: string | null;
  on(
    event: "raw",
    listener: (packet: { t: string; d: unknown }) => void,
  ): unknown;
  ws: {
    broadcast(data: { op: number; d: unknown }): void;
  };
  guilds?: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- discord.js-selfbot client shape is dynamic
    fetch(id: string): Promise<any>;
  };
}

/** Minimal channel shape accepted by joinVoiceChannel. */
export interface VoiceChannelLike {
  id: string;
  type: string;
  guildId?: string | null;
}

export class Streamer {
  _voiceConnection: VoiceConnection | null = null;
  _client: StreamerClientLike;
  _gatewayEmitter = new EventEmitter();

  constructor(client: StreamerClientLike) {
    this._client = client;
    // listen for gateway dispatch events
    this.client.on("raw", (packet) => {
      this._gatewayEmitter.emit(packet.t, packet.d);
    });
  }

  get client(): StreamerClientLike {
    return this._client;
  }

  get opts(): Record<string, unknown> {
    return {};
  }

  get voiceConnection(): VoiceConnection | null {
    return this._voiceConnection;
  }

  sendOpcode(code: number, data: unknown): void {
    this.client.ws.broadcast({ op: code, d: data });
  }

  joinVoiceChannel(channel: VoiceChannelLike): Promise<WebRtcConnWrapper> {
    let guildId: string | null = null;
    if (
      channel.type === "GUILD_STAGE_VOICE" ||
      channel.type === "GUILD_VOICE"
    ) {
      guildId = channel.guildId ?? null;
    }
    return this.joinVoice(guildId, channel.id);
  }

  /**
   * Joins a voice channel and resolves with the WebRtcConnWrapper when the
   * media session is ready.
   */
  joinVoice(
    guild_id: string | null,
    channel_id: string,
  ): Promise<WebRtcConnWrapper> {
    return new Promise((resolve, reject) => {
      if (!this.client.user) {
        reject(new Error("Client not logged in"));
        return;
      }
      const user_id = this.client.user.id;
      const voiceConn = new VoiceConnection(
        this,
        guild_id,
        user_id,
        channel_id,
        (conn) => {
          resolve(conn);
        },
      );
      this._voiceConnection = voiceConn;
      this._gatewayEmitter.on(
        "VOICE_STATE_UPDATE",
        (d: { user_id: string; session_id: string }) => {
          if (user_id !== d.user_id) return;
          voiceConn.setSession(d.session_id);
        },
      );
      this._gatewayEmitter.on(
        "VOICE_SERVER_UPDATE",
        (d: {
          guild_id: string | null;
          channel_id?: string;
          endpoint: string;
          token: string;
        }) => {
          if (guild_id !== d.guild_id) return;
          // channel_id is not set for guild voice calls
          if (d.channel_id && channel_id !== d.channel_id) return;
          voiceConn.setTokens(d.endpoint, d.token);
        },
      );
      this.signalVideo(false);
    });
  }

  /** Create a GoLive stream (screen share) on top of the voice connection. */
  createStream(): Promise<WebRtcConnWrapper> {
    return new Promise((resolve, reject) => {
      if (!this.client.user) {
        reject(new Error("Client not logged in"));
        return;
      }
      if (!this.voiceConnection) {
        reject(
          new Error("cannot start stream without first joining voice channel"),
        );
        return;
      }
      this.signalStream();
      const {
        guildId: clientGuildId,
        channelId: clientChannelId,
        session_id,
      } = this.voiceConnection;
      const clientUserId = this.client.user.id;
      if (!session_id) throw new Error("Session doesn't exist yet");
      const streamConn = new StreamConnection(
        this,
        clientGuildId,
        clientUserId,
        clientChannelId,
        (conn) => {
          resolve(conn);
        },
      );
      this.voiceConnection.streamConnection = streamConn;
      this._gatewayEmitter.on(
        "STREAM_CREATE",
        (d: { stream_key: string; rtc_server_id: string }) => {
          const { channelId, guildId, userId } = parseStreamKey(d.stream_key);
          if (
            clientGuildId !== guildId ||
            clientChannelId !== channelId ||
            clientUserId !== userId
          ) {
            return;
          }
          streamConn.serverId = d.rtc_server_id;
          streamConn.streamKey = d.stream_key;
          streamConn.setSession(session_id);
        },
      );
      this._gatewayEmitter.on(
        "STREAM_SERVER_UPDATE",
        (d: { stream_key: string; endpoint: string; token: string }) => {
          const { channelId, guildId, userId } = parseStreamKey(d.stream_key);
          if (
            clientGuildId !== guildId ||
            clientChannelId !== channelId ||
            clientUserId !== userId
          ) {
            return;
          }
          streamConn.setTokens(d.endpoint, d.token);
        },
      );
    });
  }

  async setStreamPreview(image: Buffer): Promise<void> {
    if (!this.client.token) throw new Error("Please login :)");
    if (!this.voiceConnection?.streamConnection?.guildId) return;
    const data = `data:image/jpeg;base64,${image.toString("base64")}`;
    const { guildId } = this.voiceConnection.streamConnection;
    if (!this.client.guilds) return;
    const server = await this.client.guilds.fetch(guildId);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-explicit-any -- discord.js-selfbot dynamic
    (server as any).members.me?.voice?.postPreview(data);
  }

  stopStream(): void {
    const stream = this.voiceConnection?.streamConnection;
    if (!stream) return;
    stream.stop();
    this.signalStopStream();
    this.voiceConnection.streamConnection = null;
    this._gatewayEmitter.removeAllListeners("STREAM_CREATE");
    this._gatewayEmitter.removeAllListeners("STREAM_SERVER_UPDATE");
  }

  leaveVoice(): void {
    this.voiceConnection?.stop();
    this.signalLeaveVoice();
    this._voiceConnection = null;
    this._gatewayEmitter.removeAllListeners("VOICE_STATE_UPDATE");
    this._gatewayEmitter.removeAllListeners("VOICE_SERVER_UPDATE");
  }

  signalVideo(video_enabled: boolean): void {
    if (!this.voiceConnection) return;
    const { guildId: guild_id, channelId: channel_id } = this.voiceConnection;
    this.sendOpcode(GatewayOpCodes.VOICE_STATE_UPDATE, {
      guild_id: guild_id,
      channel_id,
      self_mute: false,
      self_deaf: true,
      self_video: video_enabled,
    });
  }

  signalStream(): void {
    if (!this.voiceConnection) return;
    const {
      type,
      guildId: guild_id,
      channelId: channel_id,
      botId: user_id,
    } = this.voiceConnection;
    this.sendOpcode(GatewayOpCodes.STREAM_CREATE, {
      type,
      guild_id,
      channel_id,
      preferred_region: null,
    });
    this.sendOpcode(GatewayOpCodes.STREAM_SET_PAUSED, {
      stream_key: generateStreamKey(type, guild_id, channel_id, user_id),
      paused: false,
    });
  }

  signalStopStream(): void {
    if (!this.voiceConnection) return;
    const {
      type,
      guildId: guild_id,
      channelId: channel_id,
      botId: user_id,
    } = this.voiceConnection;
    this.sendOpcode(GatewayOpCodes.STREAM_DELETE, {
      stream_key: generateStreamKey(type, guild_id, channel_id, user_id),
    });
  }

  signalLeaveVoice(): void {
    this.sendOpcode(GatewayOpCodes.VOICE_STATE_UPDATE, {
      guild_id: null,
      channel_id: null,
      self_mute: true,
      self_deaf: false,
      self_video: false,
    });
  }
}

export type { NativePeerConnection };
