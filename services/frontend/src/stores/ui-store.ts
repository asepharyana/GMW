import { create } from "zustand";

export type DashboardTab =
  | "live"
  | "messages"
  | "recordings"
  | "settings"
  | "dashboard";

type Theme = "dark" | "light" | "system";

interface UIState {
  sidebarCollapsed: boolean;
  activeTab: DashboardTab;
  theme: Theme;
  selectedVoiceGuild: string;
  selectedVoiceChannel: string;
}

interface UIActions {
  toggleSidebar: () => void;
  setActiveTab: (tab: DashboardTab) => void;
  setTheme: (theme: Theme) => void;
  setSelectedVoiceGuild: (guildId: string) => void;
  setSelectedVoiceChannel: (channelId: string) => void;
}

export const useUIStore = create<UIState & UIActions>((set) => ({
  sidebarCollapsed: false,
  activeTab: "dashboard",
  theme: "system",
  selectedVoiceGuild: "",
  selectedVoiceChannel: "",

  toggleSidebar: () =>
    set((state) => ({ sidebarCollapsed: !state.sidebarCollapsed })),

  setActiveTab: (tab) => set({ activeTab: tab }),

  setTheme: (theme) => set({ theme }),

  setSelectedVoiceGuild: (guildId) => set({ selectedVoiceGuild: guildId }),

  setSelectedVoiceChannel: (channelId) =>
    set({ selectedVoiceChannel: channelId }),
}));
