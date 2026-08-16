import { orpc } from "@/lib/orpc/client";
import type { Channel, Guild, VoiceStatus } from "@/lib/types";

export const voiceApi = {
  // Guilds
  getGuilds: () => orpc.voice.guilds() as unknown as Promise<Guild[]>,
  getTextChannels: (guildId: string) =>
    orpc.voice.textChannels({ guildId }) as unknown as Promise<Channel[]>,
  getVoiceChannels: (guildId: string) =>
    orpc.voice.voiceChannels({ guildId }) as unknown as Promise<Channel[]>,

  // Voice connection
  getStatus: () => orpc.voice.status() as unknown as Promise<VoiceStatus>,
  connect: (guildId: string, channelId: string) =>
    orpc.voice.connect({
      guildId,
      channelId,
    }) as unknown as Promise<VoiceStatus>,
  disconnect: () => orpc.voice.disconnect() as unknown as Promise<VoiceStatus>,
  sendCommand: (command: string) =>
    orpc.voice.command({ command }) as unknown as Promise<unknown>,
};
