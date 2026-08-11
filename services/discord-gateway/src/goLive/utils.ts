/** GoLive helpers — ported from @dank074/discord-video-stream/utils.js. */

export function normalizeVideoCodec(
  codec: string,
): "H264" | "H265" | "VP8" | "VP9" | "AV1" {
  if (/H\.?264|AVC/i.test(codec)) return "H264";
  if (/H\.?265|HEVC/i.test(codec)) return "H265";
  if (/VP(8|9)/i.test(codec)) return codec.toUpperCase() as "VP8" | "VP9";
  if (/AV1/i.test(codec)) return "AV1";
  throw new Error(`Unknown codec: ${codec}`);
}

/**
 * The available video streams are sent by the client on connection to the
 * voice gateway using OpCode Identify (0); the server replies with the ssrc
 * and rtxssrc for each available stream using OpCode Ready (2). RID
 * distinguishes simulcast streams of the same video source — we only send one
 * quality stream, so a single entry is hardcoded.
 */
export const STREAMS_SIMULCAST = [{ type: "screen", rid: "100", quality: 100 }];

export const max_int16bit = 2 ** 16;
export const max_int32bit = 2 ** 32;

export function isFiniteNonZero(n: unknown): n is number {
  return typeof n === "number" && !!n && Number.isFinite(n);
}

export interface ParsedStreamKey {
  type: "guild" | "call";
  channelId: string;
  guildId: string | null;
  userId: string;
}

export function parseStreamKey(streamKey: string): ParsedStreamKey {
  const streamKeyArray = streamKey.split(":");
  const type = streamKeyArray.shift();
  if (type !== "guild" && type !== "call") {
    throw new Error(`Invalid stream key type: ${type}`);
  }
  if (
    (type === "guild" && streamKeyArray.length < 3) ||
    (type === "call" && streamKey.length < 2)
  ) {
    throw new Error(`Invalid stream key: ${streamKey}`);
  }
  let guildId: string | null = null;
  if (type === "guild") {
    guildId = streamKeyArray.shift() ?? null;
  }
  const channelId = streamKeyArray.shift();
  const userId = streamKeyArray.shift();
  if (!channelId || !userId) {
    throw new Error(`Invalid stream key: ${streamKey}`);
  }
  return { type, channelId, guildId, userId };
}

export function generateStreamKey(
  type: "guild" | "call",
  guildId: string | null,
  channelId: string,
  userId: string,
): string {
  return `${type}${type === "guild" ? `:${guildId}` : ""}:${channelId}:${userId}`;
}

export interface VoiceChannelLike {
  type: string;
  id: string;
  guildId?: string | null;
}

export function isVoiceChannel(channel: VoiceChannelLike): boolean {
  return (
    channel.type === "DM" ||
    channel.type === "GROUP_DM" ||
    channel.type === "GUILD_STAGE_VOICE" ||
    channel.type === "GUILD_VOICE"
  );
}
