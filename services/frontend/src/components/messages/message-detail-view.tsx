"use client";

import { ExternalLink, Sparkles } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatBytes, safeParseJsonArray } from "@/lib/format";
import type { MessageRecord } from "@/lib/types";
import { cn } from "@/lib/utils";

function MiniStat({
  label,
  value,
  destructive,
  capitalize,
}: {
  label: string;
  value: string;
  destructive?: boolean;
  capitalize?: boolean;
}) {
  return (
    <Card>
      <CardContent className="p-3">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p
          className={cn(
            "text-sm font-medium mt-0.5",
            capitalize && "capitalize",
            destructive && "text-destructive",
          )}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

export function MessageDetailView({
  message,
  attachments,
}: {
  message: MessageRecord;
  attachments: {
    id: string;
    filename: string;
    type: string;
    size: number;
    uploaded_url?: string | null;
    discord_url?: string | null;
  }[];
}) {
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <Avatar className="size-10">
          <AvatarImage src={message.avatar_url ?? undefined} />
          <AvatarFallback>
            {message.username.charAt(0).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium">{message.username}</span>
            <span className="text-xs text-muted-foreground">
              {new Date(message.created_at).toLocaleString()}
            </span>
            {message.type === "deleted" && (
              <Badge variant="destructive" className="text-[10px]">
                deleted
              </Badge>
            )}
            {message.type === "edited" && (
              <Badge variant="outline" className="text-[10px]">
                edited
              </Badge>
            )}
          </div>
          <p className="text-sm mt-2 whitespace-pre-wrap break-words leading-relaxed">
            {message.content}
          </p>
        </div>
      </div>
      {message.ai_analysis && (
        <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="size-4 text-primary" />
            <p className="text-xs text-muted-foreground font-medium">
              AI Analysis
            </p>
          </div>
          <p className="text-sm leading-relaxed">{message.ai_analysis}</p>
        </div>
      )}
      {message.ai_moderation_flags && message.ai_moderation_flags !== "[]" && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Moderation Flags
          </p>
          <div className="flex flex-wrap gap-1.5">
            {safeParseJsonArray(message.ai_moderation_flags).map((f) => (
              <Badge key={f} variant="destructive" className="text-[11px]">
                {f}
              </Badge>
            ))}
          </div>
        </div>
      )}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {message.ai_status && (
          <MiniStat label="Status" value={message.ai_status} capitalize />
        )}
        {message.ai_severity && message.ai_severity !== "none" && (
          <MiniStat
            label="Severity"
            value={message.ai_severity}
            destructive
            capitalize
          />
        )}
        {message.ai_confidence != null && (
          <MiniStat
            label="Confidence"
            value={`${(message.ai_confidence * 100).toFixed(0)}%`}
          />
        )}
        {message.ai_recommended_action &&
          message.ai_recommended_action !== "none" && (
            <MiniStat
              label="Action"
              value={message.ai_recommended_action}
              capitalize
            />
          )}
      </div>
      {attachments.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground font-medium">
            Attachments ({attachments.length})
          </p>
          <div className="grid grid-cols-2 gap-2">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={a.uploaded_url ?? a.discord_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-lg border border-border/50 p-2 hover:bg-muted transition-colors group"
              >
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{a.filename}</p>
                  <p className="text-[11px] text-muted-foreground">
                    {a.type} · {formatBytes(a.size)}
                  </p>
                </div>
                <ExternalLink className="size-3 shrink-0 text-muted-foreground/50 group-hover:text-muted-foreground transition-colors" />
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
