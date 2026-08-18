"use client";

import { Badge, GlassPanel } from "@/components/primitives";
import { formatRelativeTime } from "@/lib/format";
import type { ModerationAction } from "@/lib/types";

const ACTION_LABEL: Record<string, string> = {
  delete_message: "Deleted",
  timeout_user: "Timeout",
  warn_user: "Warned",
  reset_nickname: "Nickname reset",
  ban_user: "Banned",
  kick_user: "Kicked",
  notify_user: "Notified",
  none: "None",
};

function severityTone(
  sev?: string | null,
): "signal" | "amber" | "vermilion" | null {
  switch (sev) {
    case "critical":
    case "high":
      return "vermilion";
    case "medium":
      return "amber";
    case "low":
      return "signal";
    default:
      return null;
  }
}

export function LiveModerationFeed({
  actions,
}: {
  actions: ModerationAction[];
}) {
  return (
    <GlassPanel className="flex max-h-[420px] flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex size-2.5 rounded-full bg-emerald-500" />
          </span>
          <h3 className="text-sm font-medium text-ink">Live Feed</h3>
        </div>
        <span className="text-xs text-ink-faint">{actions.length} recent</span>
      </div>

      <div className="flex-1 overflow-y-auto">
        {actions.length === 0 ? (
          <p className="px-4 py-6 text-center text-xs text-ink-faint">
            Waiting for new moderation actions…
          </p>
        ) : (
          <ul className="divide-y divide-white/5">
            {actions.map((a, i) => {
              const tone = severityTone(a.severity);
              return (
                <li
                  key={a.id}
                  className={`flex items-start gap-3 px-4 py-3 ${
                    i === 0 ? "animate-[fadeIn_0.4s_ease-out]" : ""
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <Badge tone={tone ?? "signal"} className="capitalize">
                        {ACTION_LABEL[a.action_type] ?? a.action_type}
                      </Badge>
                      {a.severity && (
                        <span className="text-xs text-ink-faint">
                          {a.severity}
                        </span>
                      )}
                      {a.categories?.length ? (
                        <span className="truncate text-xs text-ink-soft">
                          {a.categories.slice(0, 3).join(", ")}
                        </span>
                      ) : null}
                    </div>
                    {a.reason && (
                      <p className="mt-1 truncate text-xs text-ink-soft">
                        “{a.reason}”
                      </p>
                    )}
                    <p className="mt-0.5 text-[11px] text-ink-faint">
                      {a.username ?? a.user_id ?? "unknown"} ·{" "}
                      {formatRelativeTime(a.created_at)}
                    </p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </GlassPanel>
  );
}
