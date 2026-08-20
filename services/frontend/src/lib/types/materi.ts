export interface MateriDocument {
  id: string;
  title: string;
  description: string | null;
  content: string;
  category: string;
  tags: string[];
  owner_user_id: string;
  guild_id: string | null;
  channel_id: string | null;
  is_public: boolean;
  view_count: number;
  created_at: number;
  updated_at: number;
}

export interface CreateMateriInput {
  title: string;
  description?: string;
  content: string;
  category: string;
  tags: string[];
  guildId?: string;
  channelId?: string;
  isPublic: boolean;
}

export interface MateriRagChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface MateriRagChatResult {
  answer: string;
  sources: Array<{
    id: string;
    title: string;
    score: number;
    excerpt: string;
  }>;
}
