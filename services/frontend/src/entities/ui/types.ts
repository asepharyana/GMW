export interface UIState {
  selectedGuild?: string;
  selectedVoiceGuild?: string;
  selectedVoiceChannel?: string;
  selectedTextGuild?: string;
  selectedTextChannel?: string;
  selectedAnalyticsGuild?: string;
  selectedAnalyticsChannel?: string;
  activeTab?: "live" | "messages" | "dashboard";
  isListening?: boolean;
  isStreaming?: boolean;
}

export type DashboardTab = "live" | "messages" | "dashboard";

export interface AppConfig {
  monitorGuildId: string | null;
}
