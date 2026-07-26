import type { Channel, Guild, MediaState, VoiceStatus } from "@/lib/types";
import { api } from "./client";

export const voiceApi = {
  // Guilds
  getGuilds: () => api.get<Guild[]>("/api/guilds"),
  getTextChannels: (guildId: string) =>
    api.get<Channel[]>(`/api/guilds/${guildId}/channels`),
  getVoiceChannels: (guildId: string) =>
    api.get<Channel[]>(`/api/guilds/${guildId}/voice-channels`),

  // Voice connection
  getStatus: () => api.get<VoiceStatus>("/api/voice/status"),
  connect: (guildId: string, channelId: string) =>
    api.post<VoiceStatus>("/api/voice/connect", { guildId, channelId }),
  disconnect: () => api.post<VoiceStatus>("/api/voice/disconnect", {}),
  sendCommand: (command: string) =>
    api.post<{ success: boolean; command: string }>("/api/voice/command", {
      command,
    }),

  // Media
  getMediaStatus: () => api.get<MediaState>("/api/media/status"),
  mediaQueue: (source: string, mode: string) =>
    api.post<MediaState>("/api/media/queue", { source, mode }),
  mediaSkip: () => api.post<MediaState>("/api/media/skip", {}),
  mediaStop: () => api.post<MediaState>("/api/media/stop", {}),
  mediaVolume: (volume: number) =>
    api.post<MediaState>("/api/media/volume", { volume }),
};
