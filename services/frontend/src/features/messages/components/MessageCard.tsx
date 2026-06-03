import {
  AlertCircle,
  CheckCircle2,
  Image as ImageIcon,
  Pencil,
  RotateCw,
  Smile,
  Trash2,
} from "lucide-react";
import { Fragment, useMemo, useState } from "react";
import { parseMetadata } from "../../../entities/message/types";
import type { MessageRecord } from "../../../shared/api/client";
import { Badge, Button, Skeleton } from "../../../shared/ui";

const CUSTOM_EMOJI_REGEX = /<(a)?:([a-zA-Z0-9_]+):(\d+)>/g;

function renderContentWithCustomEmojis(content: string): React.ReactNode {
  const parts: React.ReactNode[] = [];
  const regex = new RegExp(CUSTOM_EMOJI_REGEX.source, "g");
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(content)) !== null) {
    if (match.index > lastIndex) {
      parts.push(content.slice(lastIndex, match.index));
    }
    const [, animated, name, id] = match;
    const ext = animated ? "gif" : "png";
    const url = `https://cdn.discordapp.com/emojis/${id}.${ext}?size=128`;
    parts.push(
      <img
        key={`${id}-${match.index}`}
        src={url}
        alt={name}
        className="inline-block h-[22px] w-[22px] align-middle object-contain"
        loading="lazy"
        draggable={false}
        title={`:${name}:`}
      />,
    );
    lastIndex = regex.lastIndex;
  }
  if (lastIndex < content.length) {
    parts.push(content.slice(lastIndex));
  }
  if (parts.length === 0) return content;
  return <Fragment>{parts}</Fragment>;
}

// ─── Props ───────────────────────────────────────────────────────────────────

interface MessageCardProps {
  messages: MessageRecord[];
  onReanalyze: (id: string) => Promise<void>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseStringList(value?: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === "string")
      : [];
  } catch {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function aiVariant(status: string) {
  if (status === "clean") return "success";
  if (status === "flagged" || status === "error") return "destructive";
  return "secondary";
}

function severityColor(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-red-100 text-red-700 border-red-200";
    case "high":
      return "bg-orange-100 text-orange-700 border-orange-200";
    case "medium":
      return "bg-yellow-100 text-yellow-700 border-yellow-200";
    case "low":
      return "bg-blue-100 text-blue-700 border-blue-200";
    default:
      return "bg-muted text-muted-foreground border-border";
  }
}

function formatTimeAgo(ts: number): string {
  const seconds = Math.floor((Date.now() - ts) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return new Date(ts).toLocaleDateString();
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

// ─── Single message row inside a group ───────────────────────────────────────

function MessageRow({
  message,
  onReanalyze,
}: {
  message: MessageRecord;
  onReanalyze: (id: string) => Promise<void>;
}) {
  const metadata = useMemo(
    () => parseMetadata(message.metadata),
    [message.metadata],
  );
  const displayContent = message.edited_content ?? message.content;
  const aiStatus = message.ai_status ?? "pending";
  const categories = useMemo(() => {
    const list = parseStringList(
      message.ai_categories ?? message.ai_moderation_flags,
    );
    return list.filter((c) => c !== "analysis_incomplete");
  }, [message.ai_categories, message.ai_moderation_flags]);
  const confidence =
    message.ai_confidence ?? message.ai_moderation_score ?? null;
  const [isReanalyzing, setIsReanalyzing] = useState(false);

  const analysisSummary = useMemo(() => {
    const parts: string[] = [];
    if (categories.length > 0) {
      parts.push(categories.slice(0, 3).join(", "));
      if (categories.length > 3) parts.push(`+${categories.length - 3} more`);
    }
    if (message.ai_severity && message.ai_severity !== "none") {
      parts.push(message.ai_severity);
    }
    if (confidence != null) {
      parts.push(`${Math.round(confidence * 100)}% confidence`);
    }
    if (parts.length === 0) return "View AI analysis";
    return parts.join(" · ");
  }, [categories, message.ai_severity, confidence]);

  const stickers = metadata.stickers ?? [];
  const attachments = metadata.attachments ?? [];
  const imageAttachments = attachments.filter(
    (a) =>
      a.contentType?.startsWith("image/") ||
      /\.(png|jpe?g|gif|webp)$/i.test(a.name),
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
    <div className="space-y-2">
      {/* Row header: time + edit/delete indicators + AI badges */}
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span
          className="text-[11px] text-muted-foreground/70"
          title={new Date(message.created_at).toLocaleString()}
        >
          {formatTime(message.created_at)}
        </span>
        {message.edited_at && (
          <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground/70">
            <Pencil className="h-2.5 w-2.5" /> edited
          </span>
        )}
        {message.deleted_at && (
          <span className="flex items-center gap-0.5 text-[11px] text-destructive/70">
            <Trash2 className="h-2.5 w-2.5" /> deleted
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Badge
            variant={aiVariant(aiStatus)}
            className="flex items-center gap-1 text-[10px] px-1.5 py-0"
          >
            {aiStatus === "clean" && <CheckCircle2 className="h-3 w-3" />}
            {aiStatus === "flagged" && <AlertCircle className="h-3 w-3" />}
            {aiStatus === "error" && <AlertCircle className="h-3 w-3" />}
            {aiStatus}
          </Badge>
          {message.ai_severity && message.ai_severity !== "none" && (
            <Badge
              className={`text-[10px] px-1.5 py-0 ${severityColor(message.ai_severity)}`}
            >
              {message.ai_severity}
            </Badge>
          )}
          {confidence != null && (
            <Badge
              variant="outline"
              className="text-[10px] px-1.5 py-0 tabular-nums"
            >
              {Math.round(confidence * 100)}%
            </Badge>
          )}
        </div>
      </div>

      {/* Content */}
      {displayContent ? (
        <p
          className={`whitespace-pre-wrap break-words text-sm leading-6 ${
            message.deleted_at ? "text-muted-foreground/60" : "text-foreground/90"
          }`}
        >
          {renderContentWithCustomEmojis(displayContent)}
        </p>
      ) : null}

      {/* Stickers */}
      {stickers.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {stickers.map((sticker) => (
            <div
              key={sticker.name || sticker.url}
              className="flex items-center gap-1.5"
            >
              {sticker.url ? (
                <img
                  src={sticker.url}
                  alt={sticker.name || "sticker"}
                  className="h-12 w-12 rounded-lg border border-border object-contain bg-muted/50"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-12 w-12 items-center justify-center rounded-lg border border-border bg-muted/50">
                  <Smile className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Attached images */}
      {hasImages && (
        <div className="flex gap-2 overflow-x-auto">
          {imageAttachments.slice(0, 4).map((img) => (
            <a
              key={img.url}
              href={img.url}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 overflow-hidden rounded-lg border border-border"
            >
              <img
                src={img.url}
                alt={img.name}
                className="h-16 w-16 object-cover transition-transform hover:scale-105"
                loading="lazy"
              />
            </a>
          ))}
          {imageAttachments.length > 4 && (
            <div className="flex h-16 w-16 items-center justify-center rounded-lg border border-border bg-muted text-[11px] text-muted-foreground">
              +{imageAttachments.length - 4}
              <ImageIcon className="ml-0.5 h-3 w-3" />
            </div>
          )}
        </div>
      )}

      {/* Categories */}
      {categories.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {categories.map((category) => (
            <Badge key={category} variant="secondary" className="text-[10px]">
              {category}
            </Badge>
          ))}
        </div>
      )}

      {/* AI Analysis — always expanded */}
      {message.ai_analysis ? (
        <div
          className={`rounded-lg border-l-[3px] px-3 py-2 ${
            aiStatus === "flagged"
              ? "border-l-pink-400 bg-pink-50/40"
              : "border-l-emerald-400 bg-emerald-50/40"
          }`}
        >
          <div className="flex items-start gap-2 text-[11px]">
            <span className="mt-0.5 shrink-0">
              {aiStatus === "flagged" ? "🚨" : "ℹ️"}
            </span>
            <div className="min-w-0 flex-1">
              <span className="block font-medium text-foreground/70 mb-1">
                {analysisSummary}
              </span>
              <div className="text-[12px] text-muted-foreground leading-relaxed whitespace-pre-wrap">
                {message.ai_analysis}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* AI Error */}
      {message.ai_error ? (
        <div className="rounded-lg bg-pink-50/40 px-3 py-2 text-[12px] text-pink-600">
          AI error: {message.ai_error}
        </div>
      ) : null}

      {/* Re-analyze button */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={aiStatus === "error" ? "destructive" : "outline"}
          onClick={handleReanalyze}
          disabled={aiStatus === "pending" || isReanalyzing}
          className="text-[11px] h-7 px-2.5"
        >
          <RotateCw
            className={`h-3 w-3 ${isReanalyzing ? "animate-spin" : ""}`}
          />
          {isReanalyzing ? "Reanalyzing..." : "Re-analyze"}
        </Button>
        {aiStatus === "error" && (
          <span className="text-[11px] text-pink-600/70">
            Click to retry analysis
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Group card: one card per user group ─────────────────────────────────────

export function MessageCard({ messages, onReanalyze }: MessageCardProps) {
  const firstMsg = messages[0];
  const hasMultiple = messages.length > 1;

  return (
    <article
      className={`group rounded-2xl border bg-white shadow-sm transition-all hover:border-primary/30 hover:shadow-md ${
        firstMsg.deleted_at ? "border-red-200 opacity-60" : "border-primary/20"
      }`}
    >
      <div className="flex gap-3 p-4">
        {/* Avatar — only for first message */}
        <img
          src={
            firstMsg.avatar_url ??
            "https://cdn.discordapp.com/embed/avatars/0.png"
          }
          alt=""
          className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-primary/30"
        />

        <div className="min-w-0 flex-1">
          {/* Group header: username + timestamp of first message */}
          <div className="flex items-baseline gap-2 mb-2">
            <span className="font-semibold text-sm text-foreground">
              {firstMsg.username || firstMsg.user_id}
            </span>
            <span
              className="text-[11px] text-muted-foreground/60"
              title={new Date(firstMsg.created_at).toLocaleString()}
            >
              {formatTimeAgo(firstMsg.created_at)}
              {hasMultiple && ` · ${messages.length} messages`}
            </span>
          </div>

          {/* Message rows — divided by separator when multiple */}
          <div
            className={hasMultiple ? "divide-y divide-border/30 space-y-2.5" : ""}
          >
            {messages.map((msg, idx) => (
              <div
                key={msg.id}
                className={hasMultiple && idx > 0 ? "pt-2.5" : ""}
              >
                <MessageRow message={msg} onReanalyze={onReanalyze} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </article>
  );
}

// ─── Skeleton ────────────────────────────────────────────────────────────────

export function MessageCardSkeleton() {
  return (
    <article className="rounded-2xl border border-primary/20 bg-white p-4 shadow-sm">
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
