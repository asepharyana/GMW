// ─── Moderation alert toast listener ───────────────────────────────────────
// Listens for "moderation_alert" custom events dispatched from WebSocket
// message_analyzed handler, and shows toast notifications for flagged/warned
// messages so moderators don't miss important alerts.
import { useEffect } from "react";
import { useToast } from "../../../shared/ui";

interface AlertDetail {
  type: "flagged" | "warn";
  username: string;
  severity: string;
  categories: string;
  brief: string;
}

export function ModerationAlertListener() {
  const { addToast } = useToast();

  useEffect(() => {
    const handler = (e: Event) => {
      const { type, username, severity, categories, brief } = (
        e as CustomEvent<AlertDetail>
      ).detail;

      const emoji = type === "flagged" ? "🚨" : "⚠️";
      const sevLabel = severity ? `[${severity}]` : "";
      const catLabel = categories
        ? ` — ${categories.split(",").slice(0, 2).join(", ")}`
        : "";

      addToast(
        `${emoji} ${username} ${sevLabel}${catLabel}: ${brief}`,
        type === "flagged" ? "error" : "warning",
      );
    };

    window.addEventListener("moderation_alert", handler);
    return () => window.removeEventListener("moderation_alert", handler);
  }, [addToast]);

  return null;
}
