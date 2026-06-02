// ─── Moderation alert toast listener ───────────────────────────────────────
// Listens for "moderation_alert" custom events dispatched from WebSocket
// message_analyzed handler, and shows toast notifications for flagged
// messages so moderators don't miss important alerts.
import { useEffect } from "react";
import { useToast } from "../../../shared/ui";

interface AlertDetail {
  type: "flagged";
  username: string;
  severity: string;
  categories: string;
  brief: string;
}

export function ModerationAlertListener() {
  const { addToast } = useToast();

  useEffect(() => {
    const handler = (e: Event) => {
      const { username, severity, categories, brief } = (
        e as CustomEvent<AlertDetail>
      ).detail;

      const sevLabel = severity ? `[${severity}]` : "";
      const catLabel = categories
        ? ` — ${categories.split(",").slice(0, 2).join(", ")}`
        : "";

      addToast(
        `🚨 ${username} ${sevLabel}${catLabel}: ${brief}`,
        "error",
      );
    };

    window.addEventListener("moderation_alert", handler);
    return () => window.removeEventListener("moderation_alert", handler);
  }, [addToast]);

  return null;
}
