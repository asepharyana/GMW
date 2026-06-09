import path from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import type { Client, VoiceChannel } from "discord.js-selfbot-v13";
import { config } from "../../../shared/config/config.js";

const logger = createChildLogger("voice-metadata");

import type {
  SegmentMetadata,
  SegmentState,
  UserMetadata,
} from "../../message-capture/types.js";

export async function collectUserMetadata(
  client: Client,
  userId: string,
  channel: VoiceChannel,
): Promise<UserMetadata> {
  logger.debug({ userId }, "Collecting user metadata");

  const user =
    client.users.cache.get(userId) ||
    (await client.users.fetch(userId).catch(() => {
      logger.warn({ userId }, "Failed to fetch user");
      return null;
    }));
  const member =
    channel.guild.members.cache.get(userId) ||
    (await channel.guild.members.fetch(userId).catch(() => {
      logger.warn({ userId }, "Failed to fetch guild member");
      return null;
    }));
  const username = user?.username ?? "Unknown User";
  const roles =
    member?.roles.cache
      .filter((role) => role.id !== channel.guild.id)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({
        id: role.id,
        name: role.name,
        position: role.position,
      })) ?? [];

  return {
    userId,
    username,
    tag: user?.tag ?? "Unknown#0000",
    displayName: member?.displayName ?? username,
    avatarUrl:
      user?.displayAvatarURL({
        format: "png",
        size: config.AVATAR_SIZE as
          | 16
          | 32
          | 64
          | 128
          | 256
          | 512
          | 1024
          | 2048
          | 4096,
      }) ?? "https://cdn.discordapp.com/embed/avatars/0.png",
    bot: user?.bot ?? false,
    roles,
    highestRole: roles[0] ?? null,
    joinedTimestamp: member?.joinedTimestamp ?? null,
  };
}

export function createSegmentMetadata(
  user: UserMetadata,
  segment: SegmentState,
  sessionId: string,
  recordingSessionId: string,
  sessionStartTime: number,
  recordingSegmentMs: number,
): SegmentMetadata {
  const endTime = segment.endTime ?? Date.now();
  return {
    ...user,
    sessionId,
    recordingSessionId,
    sessionStartTime,
    segmentIndex: segment.index,
    segmentMs: recordingSegmentMs,
    startTime: segment.startTime,
    endTime,
    durationMs: endTime - segment.startTime,
    filename: path.basename(segment.filename),
  };
}
