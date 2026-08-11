/**
 * VoiceConnection — guild/DM voice channel GoLive connection.
 * Ported from @dank074/discord-video-stream VoiceConnection.js.
 */

import { BaseMediaConnection } from "./BaseMediaConnection.js";
import type { StreamConnection } from "./StreamConnection.js";

export class VoiceConnection extends BaseMediaConnection {
  streamConnection: StreamConnection | null = null;

  get daveChannelId(): string {
    return this.channelId;
  }

  get serverId(): string | null {
    // for guild vc it is the guild id, for dm voice it is the channel id
    return this.guildId ?? this.channelId;
  }

  stop(): void {
    super.stop();
    this.streamConnection?.stop();
  }
}
