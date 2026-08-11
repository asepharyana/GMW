/**
 * VideoStream — feeds encoded H264 frames into the WebRTC connection.
 * Ported from @dank074/discord-video-stream VideoStream.js.
 */

import { BaseMediaStream } from "./BaseMediaStream.js";
import type { WebRtcConnWrapper } from "./WebRtcWrapper.js";

export class VideoStream extends BaseMediaStream {
  _conn: WebRtcConnWrapper;

  constructor(conn: WebRtcConnWrapper, noSleep = false) {
    super("video", noSleep);
    this._conn = conn;
  }

  async _sendFrame(frame: Buffer, frametime: number): Promise<void> {
    this._conn.sendVideoFrame(frame, frametime);
  }
}
