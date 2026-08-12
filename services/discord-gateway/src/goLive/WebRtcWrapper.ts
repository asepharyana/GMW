/**
 * WebRTC connection wrapper for GoLive — ported from
 * @dank074/discord-video-stream WebRtcWrapper.js, with the media stack
 * (packetizers, RTCP SR/NACK, pacing) provided by the libdatachannel-min
 * binding instead of node-datachannel's JS-exposed media classes.
 */

import {
  H264Helpers,
  H264NalUnitTypes,
  splitNalu,
  startCode3,
} from "./AnnexBHelper.js";
import { CodecPayloadType } from "./CodecPayloadType.js";
import type { NativePeerConnection, NativeTrack } from "./native.js";
import { loadNative } from "./native.js";
import { rewriteSPSVUI } from "./SPSVUIRewriter.js";
import { normalizeVideoCodec } from "./utils.js";

export type WebRtcVideoCodec = "H264" | "H265" | "VP8" | "VP9" | "AV1";

export interface WebRtcParams {
  address: string;
  port: number;
  audioSsrc: number;
  videoSsrc: number;
  rtxSsrc: number;
  supportedEncryptionModes: string[];
}

/** Minimal surface of the media connection that WebRtcWrapper drives. */
export interface VideoAttribute {
  fps: number;
  width: number;
  height: number;
}

export interface MediaConnectionLike {
  daveReady: boolean;
  daveSession: {
    encryptOpus(frame: Buffer): Buffer;
    encrypt(mediaType: number, codec: number, frame: Buffer): Buffer;
  } | null;
  webRtcParams: WebRtcParams | null;
  setSpeaking(speaking: boolean): void;
  setVideoAttributes(enabled: boolean, attr?: VideoAttribute): void;
}

/** Media types used by DAVE encryption (from @dank074). */
export enum DaveMediaType {
  AUDIO = 0,
  VIDEO = 1,
}

/** DAVE codec ids (from @dank074). */
export enum DaveCodec {
  UNKNOWN = 0,
  VP8 = 2,
  VP9 = 3,
  H264 = 4,
  H265 = 5,
  AV1 = 6,
}

export class WebRtcConnWrapper {
  private _mediaConn: MediaConnectionLike;
  private _webRtcConn: NativePeerConnection | null = null;
  private _audioTrack: NativeTrack | null = null;
  private _videoTrack: NativeTrack | null = null;
  private _videoCodec: WebRtcVideoCodec | null = null;
  private _videoFrameLog = 0;
  /** Assigned by BaseMediaConnection to send the gathered SDP to Discord. */
  onLocalDescription: ((sdp: string) => void) | null = null;

  constructor(mediaConn: MediaConnectionLike) {
    this._mediaConn = mediaConn;
  }

  initWebRtc(): NativePeerConnection {
    const native = loadNative();
    this._webRtcConn = new native.PeerConnection({
      iceServers: ["stun:stun.l.google.com:19302"],
    });
    // Track mids must match @dank074: "0" audio, "1" video.
    this._audioTrack = this._webRtcConn.addTrack("0", "audio");
    this._videoTrack = this._webRtcConn.addTrack("1", "video");
    return this._webRtcConn;
  }

  close(): void {
    this._webRtcConn?.close();
    this._webRtcConn = null;
  }

  get webRtcConn(): NativePeerConnection | null {
    return this._webRtcConn;
  }

  get ready(): boolean {
    return this._webRtcConn?.state() === "connected";
  }

  get mediaConnection(): MediaConnectionLike {
    return this._mediaConn;
  }

  sendAudioFrame(frame: Buffer, frametime: number): void {
    if (!this.ready || !this._audioTrack) return;
    const clockRate = CodecPayloadType.opus.clockRate;
    if (this.mediaConnection.daveReady && this.mediaConnection.daveSession) {
      frame = this.mediaConnection.daveSession.encryptOpus(frame);
    }
    this._audioTrack.sendFrame(frame);
    this._audioTrack.addTimestamp(Math.round((frametime * clockRate) / 1000));
  }

  sendVideoFrame(frame: Buffer, frametime: number): void {
    if (!this.ready || !this._videoTrack) {
      if (this._videoFrameLog === 0) {
        console.log(
          `[goLive:WebRtc] sendVideoFrame DROPPED ready=${this.ready} track=${this._videoTrack !== null}`,
        );
        this._videoFrameLog++;
      }
      return;
    }
    const clockRate = CodecPayloadType[this._videoCodec ?? "H264"].clockRate;
    if (this._videoCodec === "H264") {
      let spsRewritten = false;
      const nalus = splitNalu(frame).map((el) => {
        if (H264Helpers.getUnitType(el) === H264NalUnitTypes.SPS) {
          spsRewritten = true;
          return rewriteSPSVUI(el);
        }
        return el;
      });
      if (spsRewritten)
        frame = Buffer.concat(nalus.flatMap((el) => [startCode3, el]));
    }
    if (this.mediaConnection.daveReady && this.mediaConnection.daveSession) {
      let daveCodec = DaveCodec.UNKNOWN;
      switch (this._videoCodec) {
        case "H264":
          daveCodec = DaveCodec.H264;
          break;
        case "H265":
          daveCodec = DaveCodec.H265;
          break;
        case "VP8":
          daveCodec = DaveCodec.VP8;
          break;
        case "VP9":
          daveCodec = DaveCodec.VP9;
          break;
        case "AV1":
          daveCodec = DaveCodec.AV1;
          break;
        default:
          break;
      }
      frame = this.mediaConnection.daveSession.encrypt(
        DaveMediaType.VIDEO,
        daveCodec,
        frame,
      );
    }
    this._videoTrack.sendFrame(frame);
    this._videoTrack.addTimestamp(Math.round((frametime * clockRate) / 1000));
    this._videoFrameLog++;
    if (this._videoFrameLog === 1 || this._videoFrameLog % 30 === 0) {
      console.log(
        `[goLive:WebRtc] sendVideoFrame #${this._videoFrameLog} bytes=${frame.length} ready=${this.ready}`,
      );
    }
  }

  setPacketizer(videoCodec: string): void {
    if (!this.mediaConnection.webRtcParams) {
      throw new Error("WebRTC connection not ready");
    }
    const { audioSsrc, videoSsrc } = this.mediaConnection.webRtcParams;
    console.log(
      `[goLive:WebRtc] setPacketizer(${videoCodec}) audioSsrc=${audioSsrc} videoSsrc=${videoSsrc} rtxSsrc=${this.mediaConnection.webRtcParams.rtxSsrc}`,
    );
    this._videoCodec = normalizeVideoCodec(videoCodec);
    // Audio packetizer: opus 120 @ 48kHz, playout delay ext id 5 (like @dank074)
    this._audioTrack?.setPacketizer(
      "audio",
      audioSsrc,
      CodecPayloadType.opus.payload_type,
      CodecPayloadType.opus.clockRate,
      5,
      0,
      1,
    );
    // Video packetizer: H264/H265/AV1 with their payload types
    const codecEntry = CodecPayloadType[this._videoCodec];
    if (!codecEntry) {
      throw new Error(`Packetizer not implemented for ${this._videoCodec}`);
    }
    const nativeKind =
      this._videoCodec === "H264"
        ? "h264"
        : this._videoCodec === "H265"
          ? "h265"
          : this._videoCodec === "AV1"
            ? "av1"
            : (() => {
                throw new Error(
                  `Packetizer not implemented for ${this._videoCodec}`,
                );
              })();
    this._videoTrack?.setPacketizer(
      nativeKind,
      videoSsrc,
      codecEntry.payload_type,
      codecEntry.clockRate,
      5,
      0,
      10,
    );
  }
}
