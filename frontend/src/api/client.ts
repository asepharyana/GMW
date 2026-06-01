export type AIStatus = "pending" | "clean" | "warn" | "flagged" | "error";
export type AISeverity = "none" | "low" | "medium" | "high" | "critical";
export type AIRecommendedAction =
  | "none"
  | "monitor"
  | "warn"
  | "review"
  | "delete"
  | "escalate";

export interface MessageRecord {
  id: string;
  guild_id: string;
  channel_id: string;
  thread_id: string | null;
  user_id: string;
  username: string;
  avatar_url: string | null;
  content: string;
  edited_content: string | null;
  created_at: number;
  edited_at: number | null;
  deleted_at: number | null;
  type: "text" | "edited" | "deleted";
  metadata: string | null;
  ai_status?: AIStatus | null;
  ai_moderation_flags?: string | null;
  ai_moderation_score?: number | null;
  ai_analysis?: string | null;
  ai_categories?: string | null;
  ai_severity?: AISeverity | null;
  ai_confidence?: number | null;
  ai_recommended_action?: AIRecommendedAction | null;
  ai_analyzed_at?: number | null;
  ai_error?: string | null;
}

export interface PageResult<T> {
  data: T[];
  nextCursor: string | null;
}

export type DashboardMessage = MessageRecord;

export interface Guild {
  id: string;
  name: string;
  icon: string | null;
}

export interface AppConfig {
  monitorGuildId: string | null;
}

class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(code: string, message: string, statusCode: number) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const password = localStorage.getItem("admin-password");
  const res = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...(password ? { "X-Admin-Password": password } : {}),
    },
    ...init,
  });

  if (!res.ok) {
    let message = res.statusText;
    let code = "REQUEST_FAILED";
    try {
      const body = (await res.json()) as { error?: string; message?: string };
      if (body.message) message = body.message;
      if (body.error) code = body.error;
    } catch {
      // ignore parse errors
    }
    throw new ApiError(code, message, res.status);
  }

  return res.json() as Promise<T>;
}

export async function listMessages(
  params: URLSearchParams,
): Promise<PageResult<MessageRecord>> {
  return request<PageResult<MessageRecord>>(`/api/messages?${params}`);
}

export async function listReview(
  params: URLSearchParams,
): Promise<PageResult<MessageRecord>> {
  return request<PageResult<MessageRecord>>(`/api/review?${params}`);
}

export async function reanalyzeMessage(id: string): Promise<void> {
  await request<void>(`/api/messages/${id}/reanalyze`, { method: "POST" });
}

export async function getGuilds(): Promise<Guild[]> {
  return request<Guild[]>("/api/guilds");
}

export async function getAppConfig(): Promise<AppConfig> {
  return request<AppConfig>("/api/config");
}
