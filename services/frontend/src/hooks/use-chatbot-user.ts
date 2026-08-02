import { useEffect, useState } from "react";

const STORAGE_KEY = "gmw-chatbot-user-id";

/**
 * Per-device anonymous identity. The app has no login, so we mint a random
 * UUID on first visit, persist it to localStorage, and send it as the
 * X-User-Id header. Each visitor gets their own chat history — the backend
 * keys `chatbot_messages` by this id.
 */
export function useChatbotUserId(): string {
  const [userId, setUserId] = useState<string>("");

  useEffect(() => {
    try {
      let id = window.localStorage.getItem(STORAGE_KEY);
      if (!id || id.length < 16) {
        id =
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : `u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
        window.localStorage.setItem(STORAGE_KEY, id);
      }
      setUserId(id);
    } catch {
      // localStorage unavailable (private mode) — use in-memory fallback
      setUserId(
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `u_${Date.now().toString(36)}`,
      );
    }
  }, []);

  return userId;
}

export { STORAGE_KEY };
