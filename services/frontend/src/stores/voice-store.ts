import { create } from "zustand";
import type { ActiveSpeaker, VoiceStatus } from "~/shared/types/voice.js";

interface SpeakerEntry extends ActiveSpeaker {
  heardAt: number;
}

interface VoiceState {
  connected: boolean;
  status: VoiceStatus | null;
  activeSpeakers: SpeakerEntry[];
  guildId: string;
  channelId: string;
}

interface VoiceActions {
  setConnected: (connected: boolean) => void;
  setStatus: (status: VoiceStatus | null) => void;
  setActiveSpeakers: (speakers: ActiveSpeaker[]) => void;
  updateSpeaker: (update: Partial<ActiveSpeaker> & { userId: string }) => void;
  setGuildChannel: (guildId: string, channelId: string) => void;
}

export const useVoiceStore = create<VoiceState & VoiceActions>((set) => ({
  connected: false,
  status: null,
  activeSpeakers: [],
  guildId: "",
  channelId: "",

  setConnected: (connected) => set({ connected }),

  setStatus: (status) => set({ status }),

  setActiveSpeakers: (speakers) =>
    set({
      activeSpeakers: speakers.map((s) => ({
        ...s,
        heardAt: Date.now(),
      })),
    }),

  updateSpeaker: (update) =>
    set((state) => {
      const existing = state.activeSpeakers.find(
        (s) => s.userId === update.userId,
      );
      if (existing) {
        return {
          activeSpeakers: state.activeSpeakers.map((s) =>
            s.userId === update.userId
              ? { ...s, ...update, heardAt: Date.now() }
              : s,
          ),
        };
      }
      return {
        activeSpeakers: [
          ...state.activeSpeakers,
          {
            ...update,
            username: "",
            avatar: "",
            speaking: false,
            heardAt: Date.now(),
          } as SpeakerEntry,
        ],
      };
    }),

  setGuildChannel: (guildId, channelId) => set({ guildId, channelId }),
}));
