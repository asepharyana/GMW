/**
 * AudioStream — feeds encoded opus frames into the WebRTC connection.
 * Ported from @dank074/discord-video-stream AudioStream.js.
 */

import { BaseMediaStream } from "./BaseMediaStream.js";
import type { WebRtcConnWrapper } from "./WebRtcWrapper.js";

export class AudioStream extends BaseMediaStream {
  _conn: WebRtcConnWrapper;

  constructor(conn: WebRtcConnWrapper, noSleep = false) {
    super("audio", noSleep);
    this._conn = conn;
  }

  async _sendFrame(frame: Buffer, frametime: number): Promise<void> {
    this._conn.sendAudioFrame(frame, frametime);
  }
}
