"use client";

import { CheckCircle2, ShieldAlert, UserX, VolumeX } from "lucide-react";
import { useEffect, useRef } from "react";
import { Badge } from "@/components/primitives";
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

function actionIcon(type: string) {
  switch (type) {
    case "ban_user":
    case "kick_user":
      return <UserX className="size-3.5 text-vermilion" />;
    case "timeout_user":
      return <VolumeX className="size-3.5 text-amber" />;
    case "delete_message":
    case "warn_user":
      return <ShieldAlert className="size-3.5 text-signal" />;
    default:
      return <CheckCircle2 className="size-3.5 text-success" />;
  }
}

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
  const feedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = feedRef.current;
    if (!container) return;
    const items = container.querySelectorAll<HTMLElement>(".mod-feed-item");
    if (items.length === 0) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    items.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "ease-out";
      el.style.animationName = "stagger-slide-in";
      el.style.animationDuration = "0.32s";
      el.style.animationDelay = `${i * 0.025}s`;
    });

    return () => {
      items.forEach((el) => {
        el.style.removeProperty("opacity");
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
      });
    };
  }, []);

  return (
    <div className="flex max-h-[460px] flex-col">
      <div className="flex items-center justify-between border-b border-hairline pb-3">
        <div className="flex items-center gap-2">
          <span className="relative flex size-2">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-75" />
            <span className="relative inline-flex size-2 rounded-full bg-success" />
          </span>
          <span className="font-mono text-xs font-medium text-ink">
            Live Stream Audit Log
          </span>
        </div>
        <span className="font-mono text-[11px] text-ink-faint">
          {actions.length} RECENT ACTIONS
        </span>
      </div>

      <div ref={feedRef} className="flex-1 space-y-2 overflow-y-auto pt-3 pr-1">
        {actions.length === 0 ? (
          <div className="py-12 text-center font-mono text-xs text-ink-faint">
            AWAITING MODERATION DISPATCH STREAM...
          </div>
        ) : (
          actions.map((a) => {
            const tone = severityTone(a.severity);
            return (
              <div
                key={a.id}
                className="mod-feed-item hud-card flex items-start gap-3 p-3 transition-all"
              >
                <span className="flex size-7 shrink-0 items-center justify-center rounded-[6px] border border-hairline bg-surface-2">
                  {actionIcon(a.action_type)}
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-semibold text-ink">
                      {ACTION_LABEL[a.action_type] ?? a.action_type}
                    </span>
                    {a.severity && (
                      <Badge
                        tone={tone ?? "signal"}
                        className="font-mono text-[9px] uppercase"
                      >
                        {a.severity}
                      </Badge>
                    )}
                    {a.categories?.length ? (
                      <span className="truncate font-mono text-[10px] text-ink-faint">
                        [{a.categories.slice(0, 2).join(", ")}]
                      </span>
                    ) : null}
                    <span className="ml-auto font-mono text-[10px] text-ink-faint">
                      {formatRelativeTime(a.created_at)}
                    </span>
                  </div>

                  {a.reason && (
                    <p className="mt-1 font-sans text-xs text-ink-soft line-clamp-2">
                      &ldquo;{a.reason}&rdquo;
                    </p>
                  )}

                  <div className="mt-1.5 flex items-center gap-2 font-mono text-[10px] text-ink-faint">
                    <span>TARGET:</span>
                    <span className="text-ink-soft">
                      {a.server_nick ??
                        a.username ??
                        a.user_id ??
                        "UNKNOWN_SUBJECT"}
                    </span>
                    {a.username && a.username !== a.server_nick && (
                      <>
                        <span>·</span>
                        <span className="text-ink-soft">@{a.username}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
