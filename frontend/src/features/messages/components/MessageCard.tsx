import { useState, useMemo } from "react";
import type { MessageRecord } from "../../../shared/api/client";
import { Badge, Button, Skeleton } from "../../../shared/ui";
import { RotateCw, AlertCircle, CheckCircle2, AlertTriangle, Trash2, Pencil, Image as ImageIcon, Smile } from "lucide-react";

interface MessageCardProps {
  message: MessageRecord;
  onReanalyze: (id: string) => Promise<void>;
}

interface MessageMetadata {
  stickers?: Array<{ name?: string; url?: string }>;
  attachments?: Array<{ name: string; url: string; contentType?: string }>;
  embeds?: Array<{ title?: string; image?: string; thumbnail?: string }>;
}

function parseMetadata(value: string | null): MessageMetadata {
  if (!value) return {};
  try { return JSON.parse(value) as MessageMetadata; } catch { return {}; }
}

function parseStringList(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return value.split(",").map((item) => item.trim()).filter(Boolean);
  }
}

function aiVariant(status: string) {
  if (status === "clean") return "success";
  if (status === "warn") return "warning";
  if (status === "flagged" || status === "error") return "destructive";
  return "secondary";
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical": return "bg-red-500/20 text-red-300 border-red-500/30";
    case "high": return "bg-orange-500/20 text-orange-300 border-orange-500/30";
    case "medium": return "bg-yellow-500/20 text-yellow-300 border-yellow-500/30";
    case "low": return "bg-blue-500/20 text-blue-300 border-blue-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

export function MessageCard({ message, onReanalyze }: MessageCardProps) {
  const metadata = useMemo(() => parseMetadata(message.metadata), [message.metadata]);
  const displayContent = message.edited_content ?? message.content;
  const aiStatus = message.ai_status ?? "pending";
  const categories = useMemo(() => {
    const list = parseStringList(message.ai_categories ?? message.ai_moderation_flags);
    return list.filter((c) => c !== "analysis_incomplete");
  }, [message.ai_categories, message.ai_moderation_flags]);
  const confidence = message.ai_confidence ?? message.ai_moderation_score ?? null;
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const stickers = metadata.stickers ?? [];
  const attachments = metadata.attachments ?? [];
  const imageAttachments = attachments.filter(
    (a) => a.contentType?.startsWith("image/") || /\.(png|jpe?g|gif|webp)$/i.test(a.name),
  );
  const hasImages = imageAttachments.length > 0;

  const handleReanalyze = async () => {
    setIsReanalyzing(true);
    try {
      await onReanalyze(message.id);
    } finally {
      setIsReanalyzing(false);
    }
  };

  return (
    <article className={`group rounded-2xl border border-border bg-card p-4 shadow-sm transition-all hover:border-primary/30 hover:shadow-md ${message.deleted_at ? "opacity-60" : ""}`}>
      <div className="flex gap-3">
        <img
          src={message.avatar_url ?? "https://cdn.discordapp.com/embed/avatars/0.png"}
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-1 ring-border"
        />
        <div className="min-w-0 flex-1 space-y-2.5">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="font-semibold text-foreground">{message.username || message.user_id}</span>
            <span className="text-xs text-muted-foreground" title={new Date(message.created_at).toLocaleString()}>
              {formatTimeAgo(message.created_at)}
            </span>
            {message.edited_at && (
              <span className="flex items-center gap-1 text-xs text-muted-foreground">
                <Pencil className="h-3 w-3" /> edited
              </span>
            )}
            {message.deleted_at && (
              <span className="flex items-center gap-1 text-xs text-destructive">
                <Trash2 className="h-3 w-3" /> deleted
              </span>
            )}
            <div className="ml-auto flex items-center gap-1.5">
              <Badge variant={aiVariant(aiStatus)} className="flex items-center gap-1 text-xs">
                {aiStatus === "clean" && <CheckCircle2 className="h-3.5 w-3.5" />}
                {aiStatus === "warn" && <AlertTriangle className="h-3.5 w-3.5" />}
                {aiStatus === "flagged" && <AlertCircle className="h-3.5 w-3.5" />}
                {aiStatus === "error" && <AlertCircle className="h-3.5 w-3.5" />}
                {aiStatus}
              </Badge>
              {message.ai_severity && message.ai_severity !== "none" && (
                <Badge className={`text-xs ${severityColor(message.ai_severity)}`}>
                  {message.ai_severity}
                </Badge>
              )}
              {confidence != null && (
                <Badge variant="outline" className="text-xs tabular-nums">
                  {Math.round(confidence * 100)}%
                </Badge>
              )}
            </div>
          </div>

          {displayContent ? (
            <p className="whitespace-pre-wrap break-words text-sm leading-6 text-foreground/90">
              {displayContent}
            </p>
          ) : null}

          {stickers.length > 0 && (
            <div className="flex flex-wrap gap-3">
              {stickers.map((sticker) => (
                <div key={sticker.name || sticker.url} className="flex items-center gap-2">
                  {sticker.url ? (
                    <img src={sticker.url} alt={sticker.name || "sticker"} className="h-16 w-16 rounded-xl border border-border object-contain bg-muted/50" loading="lazy" />
                  ) : (
                    <div className="flex h-16 w-16 items-center justify-center rounded-xl border border-border bg-muted/50">
                      <Smile className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground max-w-[120px] truncate" title={sticker.name}>
                    {sticker.name}
                  </span>
                </div>
              ))}
            </div>
          )}

          {hasImages && (
            <div className="flex gap-2 overflow-x-auto">
              {imageAttachments.slice(0, 4).map((img) => (
                <a key={img.url} href={img.url} target="_blank" rel="noreferrer" className="shrink-0 overflow-hidden rounded-xl border border-border">
                  <img src={img.url} alt={img.name} className="h-20 w-20 object-cover transition-transform hover:scale-105" loading="lazy" />
                </a>
              ))}
              {imageAttachments.length > 4 && (
                <div className="flex h-20 w-20 items-center justify-center rounded-xl border border-border bg-muted text-xs text-muted-foreground">
                  +{imageAttachments.length - 4} <ImageIcon className="ml-1 h-3 w-3" />
                </div>
              )}
            </div>
          )}

          {categories.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {categories.map((category) => (
                <Badge key={category} variant="secondary" className="text-xs">{category}</Badge>
              ))}
            </div>
          )}

          {message.ai_analysis ? (
            <div className="rounded-xl bg-muted/60 p-3 text-sm text-muted-foreground leading-relaxed">
              {message.ai_analysis}
            </div>
          ) : null}

          {message.ai_error ? (
            <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">
              AI error: {message.ai_error}
            </div>
          ) : null}

          <div className="flex items-center gap-2 pt-1">
            <Button
              size="sm"
              variant={aiStatus === "error" ? "destructive" : "outline"}
              onClick={handleReanalyze}
              disabled={aiStatus === "pending" || isReanalyzing}
              className="text-xs"
            >
              <RotateCw className={`h-3.5 w-3.5 ${isReanalyzing ? "animate-spin" : ""}`} />
              {isReanalyzing ? "Reanalyzing..." : "Re-analyze"}
            </Button>
            {aiStatus === "error" && (
              <span className="text-xs text-destructive/80">Click to retry analysis</span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

export function MessageCardSkeleton() {
  return (
    <article className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <div className="flex gap-3">
        <Skeleton className="h-10 w-10 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-3">
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
          <div className="flex gap-2">
            <Skeleton className="h-6 w-16 rounded-full" />
            <Skeleton className="h-6 w-20 rounded-full" />
          </div>
        </div>
      </div>
    </article>
  );
}
