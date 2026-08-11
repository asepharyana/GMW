/**
 * StreamConnection — GoLive stream connection (screen share).
 * Ported from @dank074/discord-video-stream StreamConnection.js.
 */

import { BaseMediaConnection } from "./BaseMediaConnection.js";
import { VoiceOpCodes } from "./VoiceOpCodes.js";

export class StreamConnection extends BaseMediaConnection {
  _streamKey: string | null = null;
  _serverId: string | null = null;

  setSpeaking(speaking: boolean): void {
    if (!this.webRtcParams) throw new Error("WebRTC connection not ready");
    this.sendOpcode(VoiceOpCodes.SPEAKING, {
      delay: 0,
      speaking: speaking ? 2 : 0,
      ssrc: this.webRtcParams.audioSsrc,
    });
  }

  get daveChannelId(): string {
    if (this._serverId === null) {
      throw new Error("Server ID not set (this shouldn't happen)");
    }
    const channelId = BigInt(this._serverId) - 1n;
    return channelId.toString();
  }

  get serverId(): string | null {
    return this._serverId;
  }

  set serverId(id: string | null) {
    this._serverId = id;
  }

  get streamKey(): string | null {
    return this._streamKey;
  }

  set streamKey(value: string | null) {
    this._streamKey = value;
  }
}
