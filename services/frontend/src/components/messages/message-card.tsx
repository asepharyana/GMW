"use client";

import { Hash, RefreshCw } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { safeParseJsonArray, getMessageChannelLabel, renderMessageContent } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AiStatusBadge } from "./ai-status-badge";

export function MessageCard({
  message: msg,
  onClick,
  onReanalyze,
}: {
  message: MessageRecord;
  onClick: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  const severity = (
    {
      low: "border-l-cyan-500/40",
      medium: "border-l-amber-500/60",
      high: "border-l-orange-500/70",
      critical: "border-l-red-500/80",
    } as Record<string, string>
  )[msg.ai_severity ?? ""];

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all duration-200 hover:shadow-[0_0_16px_oklch(0.62_0.17_215_/_0.08)] hover:border-cyan-500/20",
        severity && "border-l-2",
        severity,
      )}
      onClick={() => onClick(msg.id)}
    >
      <CardContent className="p-4">
        <div className="flex items-start gap-3">
          <Avatar className="size-8 shrink-0 mt-0.5">
            <AvatarImage src={msg.avatar_url ?? undefined} />
            <AvatarFallback className="text-xs">
              {msg.username.charAt(0).toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium">{msg.username}</span>
              <span className="text-xs text-muted-foreground">
                {new Date(msg.created_at).toLocaleString()}
              </span>
              <span
                className="text-xs text-muted-foreground"
                title={
                  msg.thread_id
                    ? `Thread ${getMessageChannelLabel(msg)} (${msg.thread_id.slice(0, 8)})`
                    : undefined
                }
              >
                <Hash className="size-3 inline mr-0.5" />
                {getMessageChannelLabel(msg)}
              </span>
              <AiStatusBadge status={msg.ai_status} />
              {msg.ai_severity && msg.ai_severity !== "none" && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  {msg.ai_severity}
                </Badge>
              )}
              {msg.type === "deleted" && (
                <Badge
                  variant="destructive"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  deleted
                </Badge>
              )}
              {msg.type === "edited" && (
                <Badge
                  variant="outline"
                  className="text-[10px] px-1.5 py-0 h-4"
                >
                  edited
                </Badge>
              )}
            </div>
            <p
              className={cn(
                "text-sm leading-relaxed",
                msg.type === "deleted" &&
                  "italic text-muted-foreground line-through",
              )}
            >
              {renderMessageContent(msg.content, msg.metadata)}
            </p>
            {(() => {
              const u = extractFirstImage(msg.metadata);
              if (!u) return null;
              return (
                <img
                  src={u}
                  alt=""
                  className="mt-2 max-h-48 rounded-lg border border-border/50 object-cover"
                />
              );
            })()}
            {msg.ai_moderation_flags && msg.ai_moderation_flags !== "[]" && (
              <div className="flex flex-wrap gap-1">
                {safeParseJsonArray(msg.ai_moderation_flags).map((f) => (
                  <Badge
                    key={f}
                    variant="destructive"
                    className="text-[10px] px-1.5 py-0 h-4"
                  >
                    {f}
                  </Badge>
                ))}
              </div>
            )}
            {msg.ai_analysis && (
              <p className="text-xs text-muted-foreground italic line-clamp-2 leading-relaxed">
                {msg.ai_analysis}
              </p>
            )}
            {msg.ai_confidence != null && (
              <div className="flex items-center gap-2 max-w-40">
                <Progress value={msg.ai_confidence * 100} className="h-1.5" />
                <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
                  {(msg.ai_confidence * 100).toFixed(0)}%
                </span>
              </div>
            )}
            <Button
              variant="ghost"
              size="xs"
              onClick={(e) => {
                e.stopPropagation();
                onReanalyze(msg.id);
              }}
            >
              <RefreshCw className="size-3 mr-1" /> Reanalyze
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function extractFirstImage(
  metadata: string | null | undefined,
): string | null {
  if (!metadata) return null;
  try {
    const m = JSON.parse(metadata);
    const atts: Array<{ url: string; contentType?: string }> =
      m.attachments ?? [];
    return atts.find((a) => a.contentType?.startsWith("image/"))?.url ?? null;
  } catch {
    return null;
  }
}
