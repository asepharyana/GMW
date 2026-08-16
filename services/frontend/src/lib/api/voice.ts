import { trpc } from "@/lib/trpc/client";
import type { Channel, Guild, VoiceStatus } from "@/lib/types";

export const voiceApi = {
  // Guilds
  getGuilds: () => trpc.voice.guilds.query() as unknown as Promise<Guild[]>,
  getTextChannels: (guildId: string) =>
    trpc.voice.textChannels.query({ guildId }) as unknown as Promise<Channel[]>,
  getVoiceChannels: (guildId: string) =>
    trpc.voice.voiceChannels.query({
      guildId,
    }) as unknown as Promise<Channel[]>,

  // Voice connection
  getStatus: () => trpc.voice.status.query() as unknown as Promise<VoiceStatus>,
  connect: (guildId: string, channelId: string) =>
    trpc.voice.connect.mutate({
      guildId,
      channelId,
    }) as unknown as Promise<VoiceStatus>,
  disconnect: () =>
    trpc.voice.disconnect.mutate() as unknown as Promise<VoiceStatus>,
  sendCommand: (command: string) =>
    trpc.voice.command.mutate({ command }) as unknown as Promise<unknown>,
};
