export interface UIState {
  selectedGuild?: string;
  selectedVoiceGuild?: string;
  selectedVoiceChannel?: string;
  selectedTextGuild?: string;
  selectedTextChannel?: string;
  selectedAnalyticsGuild?: string;
  selectedAnalyticsChannel?: string;
  activeTab?: DashboardTab;
  isListening?: boolean;
  isStreaming?: boolean;
}

export type DashboardTab = "live" | "messages" | "dashboard" | "settings";

export interface AppConfig {
  monitorGuildId: string | null;
  dashboardIsPublic: boolean;
}

/** Response from GET /api/admin/settings */
export interface AdminSettings {
  dashboardIsPublic: boolean;
  envDashboardIsPublic: boolean;
}
