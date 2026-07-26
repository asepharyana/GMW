export type DashboardTab = "messages" | "live" | "dashboard";

export interface UiState {
  selected_guild?: string | null;
  selected_voice_guild?: string | null;
  selected_voice_channel?: string | null;
  selected_text_guild?: string | null;
  selected_text_channel?: string | null;
  active_tab?: DashboardTab | null;
  is_listening?: boolean | null;
  is_streaming?: boolean | null;
}

export interface ChatbotResponse {
  response: string;
  timestamp: string;
}

export interface ChatHistoryMessage {
  role: string;
  content: string;
  timestamp: string;
}
