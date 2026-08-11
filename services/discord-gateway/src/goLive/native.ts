/**
 * Loader + typings for the minimal libdatachannel N-API binding
 * (native/libdatachannel-min). The binding exposes ONLY what GoLive needs:
 * PeerConnection, DataChannel, Track (raw RTP + media packetizer chain).
 *
 * The .node file is built by node-gyp against libdatachannel 0.24.0 (built
 * from source — nixpkgs 0.24.1 is glibc-incompatible with this host). It is
 * NOT shipped via npm; the Nix flake builds it as part of the gateway.
 */

export interface NativeTrack {
  /** Send a RAW RTP/RTCP packet (no media handler installed). */
  send(buffer: Uint8Array): void;
  /** Send an ENCODED frame; the packetizer chain turns it into RTP. */
  sendFrame(buffer: Uint8Array): void;
  /** Advance the packetizer RTP timestamp by delta (clock-rate units). */
  addTimestamp(delta: number): void;
  /** Install the media-handler chain (packetizer → RTCP SR → NACK → pacing). */
  setPacketizer(
    kind: "audio" | "h264" | "h265" | "av1",
    ssrc: number,
    payloadType: number,
    clockRate: number,
    playoutDelayId: number,
    playoutDelayMin: number,
    playoutDelayMax: number,
  ): void;
  isOpen(): boolean;
  close(): void;
}

export interface NativePeerConnection {
  /** mid must be "0" (audio) or "1" (video) — matches @dank074's track defs. */
  addTrack(mid: string, kind: "audio" | "video"): NativeTrack;
  /** Resolves with the full SDP (incl. candidates) after gathering completes. */
  createOffer(): Promise<string>;
  /** Resolves with the auto-generated answer SDP. */
  createAnswer(offerSdp: string): Promise<string>;
  setRemoteDescription(sdp: string, type: "offer" | "answer"): void;
  state(): string;
  close(): void;
  onStateChange(cb: (state: string) => void): void;
}

export interface NativeBinding {
  PeerConnection: new (config: {
    iceServers: string[];
  }) => NativePeerConnection;
  DataChannel: unknown;
  Track: unknown;
}

let cached: NativeBinding | null = null;

/** Load the native binding. Throws only if the .node is truly missing —
 *  callers (screen share) guard with `isNativeAvailable()`. */
export function loadNative(): NativeBinding {
  if (cached) return cached;
  // Resolve relative to this file: src/goLive/ → native/libdatachannel-min/
  const candidates = [
    new URL(
      "../../native/libdatachannel-min/build/Release/datachannel_min.node",
      import.meta.url,
    ),
    new URL(
      "../../../native/libdatachannel-min/build/Release/datachannel_min.node",
      import.meta.url,
    ),
  ];
  let lastErr: unknown;
  for (const url of candidates) {
    try {
      // @ts-expect-error — .node modules are not typed; dynamic require via file URL
      const mod = process.dlopen ? null : null;
      void mod;
      const nativePath = url.pathname;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const req = createRequire(import.meta.url);
      const binding = req(nativePath) as NativeBinding;
      if (typeof binding.PeerConnection === "function") {
        cached = binding;
        return binding;
      }
    } catch (e) {
      lastErr = e;
    }
  }
  // Fallback: plain relative require (tsx / jest environments)
  try {
    const req = createRequire(import.meta.url);
    const binding = req(
      "../../native/libdatachannel-min/build/Release/datachannel_min.node",
    ) as NativeBinding;
    if (typeof binding.PeerConnection === "function") {
      cached = binding;
      return binding;
    }
  } catch (e) {
    lastErr = e;
  }
  throw new Error(
    `libdatachannel-min native binding not built (${String(lastErr)}). Run: cd native/libdatachannel-min && npx node-gyp rebuild`,
  );
}

import { createRequire } from "node:module";

/** True when the native binding is built — screen share stays disabled otherwise. */
export function isNativeAvailable(): boolean {
  try {
    loadNative();
    return true;
  } catch {
    return false;
  }
}
