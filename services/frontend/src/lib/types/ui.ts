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

/**
 * Chat history row as returned by the backend (GET /api/chat/history →
 * { history: ChatbotHistoryRow[], total }).
 */
export interface ChatbotHistoryRow {
  id: string;
  user_id: string;
  user_message: string;
  bot_response: string;
  context: Record<string, unknown> | null;
  created_at: string;
}
