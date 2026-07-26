export interface Guild {
  id: string;
  name: string;
  icon?: string | null;
}

export interface Channel {
  id: string;
  name: string;
  type?: string | null; // "voice" | "text"
  parent_id?: string | null;
}

export interface AppConfig {
  monitor_guild_id?: string | null;
}
