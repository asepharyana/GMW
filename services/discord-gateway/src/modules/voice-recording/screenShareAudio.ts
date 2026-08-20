import type { VoiceReceiver, VoiceUserData } from "@discordjs/voice";
import { createChildLogger } from "@/shared/logger/index";

const logger = createChildLogger("screen-share-audio");

/**
 * Hooks screen-share audio capture into the voice receiver.
 *
 * ## Background
 *
 * Discord GoLive (screen share) sends audio on **separate SSRCs** from the
 * user's microphone.  In `@discordjs/voice` v0.19, `VoiceReceiver.onUdpMessage`
 * does:
 *
 * ```js
 * const userData = this.ssrcMap.get(ssrc);
 * if (!userData) return;   // ← DROPS screen-share audio SSRC
 * ```
 *
 * `ssrcMap` is only populated from `VOICE_STATE_UPDATE` / `VOICE_SERVER_UPDATE`
 * WebSocket packets, which carry the **voice audioSSRC** only.  When a user
 * starts an audio+video screen-share, Discord sends additional RTP packets on
 * new SSRCs that are *never* registered in `ssrcMap` → they are silently
 * discarded → `receiver.speaking` never fires → screen-share audio is missing.
 *
 * ## Fix
 *
 * 1. Wrap `onUdpMessage` to inspect every incoming RTP packet's SSRC.
 * 2. If the SSRC isn't in `ssrcMap`, check whether it looks like a screen-share
 *    audio stream (OPRUS payload type 120, RTP version 2).
 * 3. Clone the owning user's VoiceUserData into `ssrcMap` under the new SSRC
 *    so the *original* (un-patched) `onUdpMessage` picks it up, decrypts it,
 *    and forwards the Opus packet to the existing subscription stream.
 * 4. Emit a synthetic `"start"` speaking event so the existing
 *    `speakingHandler` sets up the full pipeline (decoder, packet filter,
 *    segment manager, event handlers) for that userId if not already.
 */
export function hookScreenShareAudio(
  receiver: VoiceReceiver,
  speakingHandler: (userId: string) => Promise<void>,
): void {
  // Cache the original (un-bound) method so we can delegate to it.
  const original = receiver.onUdpMessage;

  receiver.onUdpMessage = (msg: Buffer) => {
    // ── 1. Detect screen-share SSRCs BEFORE the original discards them ──
    if (isLikelyScreenShareAudio(msg, receiver)) {
      const ssrc = msg.readUInt32BE(8);
      const userData = getSsrcMapEntry(receiver, ssrc);

      if (!userData) {
        // SSRC not registered — try to infer owner and register it
        const owner = inferScreenShareOwner(ssrc, receiver);
        if (owner) {
          registerScreenShareSsrc(receiver, ssrc, owner);
          logger.info(
            { userId: owner.userId, ssrc, kind: "screenshare-audio" },
            "Registered screen-share audio SSRC in ssrcMap",
          );
          // Trigger the speaking handler to ensure pipeline is ready
          void speakingHandler(owner.userId).catch((err) =>
            logger.error(
              { userId: owner.userId, error: err.message },
              "Speaking handler for screen-share failed",
            ),
          );
        } else {
          logger.warn(
            { ssrc },
            "Screen-share audio SSRC found but owner unknown",
          );
        }
      }
    }

    // ── 2. Delegate to the original handler ──
    // It will now find the SSRC (we registered it above) and forward the
    // decrypted Opus packet to the subscription stream.
    original.call(receiver, msg);
  };

  // ── 3. Listen for dynamic ssrcMap updates ──────────────────────────────
  receiver.ssrcMap.on("create", (data: VoiceUserData) => {
    if (data.videoSSRC !== undefined) {
      logger.info(
        { userId: data.userId, videoSSRC: data.videoSSRC },
        "Screen-share video started",
      );
      void speakingHandler(data.userId).catch((err) =>
        logger.error(
          { userId: data.userId, error: err.message },
          "Handler for screen-share start failed",
        ),
      );
    }
  });

  receiver.ssrcMap.on(
    "update",
    (_old: VoiceUserData | undefined, neu: VoiceUserData) => {
      if (_old?.videoSSRC !== neu.videoSSRC && neu.videoSSRC !== undefined) {
        logger.info(
          { userId: neu.userId, videoSSRC: neu.videoSSRC },
          "Screen-share video SSRC appeared",
        );
        void speakingHandler(neu.userId).catch((err) =>
          logger.error(
            { userId: neu.userId, error: err.message },
            "Handler for screen-share update failed",
          ),
        );
      }
    },
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

/**
 * Check if a UDP packet looks like a screen-share audio RTP packet.
 *
 * Voice packets have: RTP version 2 (top 2 bits of byte 0), and payload type 120 (OPRUS).
 * We also require that the SSRC is NOT already in ssrcMap (that's handled
 * by the original onUdpMessage).
 */
function isLikelyScreenShareAudio(
  msg: Buffer,
  receiver: VoiceReceiver,
): boolean {
  if (msg.length <= 8) return false;
  const ssrc = msg.readUInt32BE(8);
  // Already registered as a known voice SSRC?
  if (getSsrcMapEntry(receiver, ssrc)) return false;

  const rtpVersion = msg[0] >> 6;
  const payloadType = msg[1] & 127;
  // OPRUS payload type is 120 in Discord voice
  return rtpVersion === 2 && payloadType === 120;
}

/**
 * Safely read an entry from the SSRCMap via the public `get` API.
 */
function getSsrcMapEntry(
  receiver: VoiceReceiver,
  ssrc: number,
): VoiceUserData | undefined {
  try {
    return receiver.ssrcMap.get(ssrc);
  } catch {
    return undefined;
  }
}

/**
 * Infer which user owns a screen-share audio SSRC by proximity to their
 * known voice audioSSRC (Discord allocates SSRCs in small increments).
 */
function inferScreenShareOwner(
  ssrc: number,
  receiver: VoiceReceiver,
): { userId: string } | null {
  try {
    // Iterate known SSRCs via internal _map (the public API only gets by ssrc)
    const map = getSsrcInternalMap(receiver.ssrcMap);
    if (!map) return null;

    for (const [, data] of map.entries()) {
      if (data.audioSSRC && Math.abs(data.audioSSRC - ssrc) < 200_000) {
        return { userId: data.userId };
      }
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Register a new SSRC in the internal ssrcMap so the original onUdpMessage
 * picks it up.  We clone the user's existing VoiceUserData (so decryption
 * keys, userId mapping, etc. all work) under the new SSRC key.
 */
function registerScreenShareSsrc(
  receiver: VoiceReceiver,
  ssrc: number,
  owner: { userId: string },
): void {
  const map = getSsrcInternalMap(receiver.ssrcMap);
  if (!map) return;

  // Find the owner's existing VoiceUserData and clone it under the new SSRC
  for (const [, data] of map.entries()) {
    if (data.userId === owner.userId) {
      map.set(ssrc, { ...data });
      return;
    }
  }

  // Fallback: register with minimal data (userId only)
  map.set(ssrc, {
    userId: owner.userId,
    audioSSRC: ssrc,
  });
}

/**
 * Access the private `_map` inside an SSRCMap instance.
 *
 * SSRCMap in @discordjs/voice ≤ v0.19 stores its entries in a private
 * `#map` (JS private field) or `_map` depending on the build target.
 * We access it defensively for read + write so we can register new SSRCs.
 */
function getSsrcInternalMap(
  ssrcMap: VoiceReceiver["ssrcMap"],
): Map<number, VoiceUserData> | undefined {
  const asAny = ssrcMap as unknown as Record<string, unknown>;
  // v0.19 ESM build uses _map
  const m1 = asAny._map;
  if (m1 instanceof Map) return m1 as Map<number, VoiceUserData>;
  return undefined;
}
