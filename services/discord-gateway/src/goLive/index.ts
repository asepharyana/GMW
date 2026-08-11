/**
 * goLive public API — re-exports the ported @dank074 modules.
 * Drop-in replacement for `@dank074/discord-video-stream` in
 * screenShareController.ts.
 */

export { AudioStream } from "./AudioStream.js";
export { BaseMediaConnection } from "./BaseMediaConnection.js";
export { BaseMediaStream } from "./BaseMediaStream.js";
export { CodecPayloadType } from "./CodecPayloadType.js";
export { demux } from "./Demuxer.js";
export { Encoders } from "./Encoders.js";
export { playStream, prepareStream } from "./prepareStream.js";
export { StreamConnection } from "./StreamConnection.js";
export { Streamer } from "./Streamer.js";
export { normalizeVideoCodec } from "./utils.js";
export { VideoStream } from "./VideoStream.js";
export { VoiceConnection } from "./VoiceConnection.js";
export { WebRtcConnWrapper } from "./WebRtcWrapper.js";
