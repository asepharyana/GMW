"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Image as ImageIcon,
  Loader2,
  MessageSquare,
  Paperclip,
  Search,
  ShieldAlert,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAmbient } from "@/components/ambient/ambient-context";
import {
  Avatar,
  Badge,
  GlassPanel,
  Input,
  Skeleton,
} from "@/components/primitives";
import {
  EmptyState,
  ErrorState,
  LoadingState,
  SectionHeader,
} from "@/components/shared";
import { GuildChannelPicker } from "@/components/shared/guild-picker";
import {
  useMessageDetail,
  useMessageSearch,
  useMessages,
  useMessagesWsSync,
} from "@/hooks";
import {
  formatBytes,
  getMessageChannelLabel,
  renderMessageContent,
  safeParseJsonArray,
} from "@/lib/format";
import type { AiStatus, Guild, MessageRecord } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

function relTime(ts?: number | null) {
  if (!ts) return "";
  const d = Date.now() - ts;
  const m = Math.floor(d / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}

function aiTone(
  s?: AiStatus | null,
): "signal" | "amber" | "vermilion" | "neutral" {
  if (s === "clean") return "signal";
  if (s === "warn") return "amber";
  if (s === "flagged" || s === "error") return "vermilion";
  if (s === "processing" || s === "pending") return "neutral";
  return "neutral";
}

export function MessagesView({
  initialGuilds,
  initialGuildId,
}: {
  initialGuilds?: Guild[];
  initialGuildId?: string | null;
}) {
  const ws = useWebSocket();
  const [guildId, setGuildId] = useState<string | null>(
    initialGuildId ?? initialGuilds?.[0]?.id ?? null,
  );
  const [channelId, setChannelId] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const {
    data: messages,
    isLoading,
    error,
  } = useMessages(guildId ?? "", channelId ?? undefined);
  useMessagesWsSync(ws, guildId ?? "");
  const search = useMessageSearch(query, query.trim().length >= 2);
  const detail = useMessageDetail(selected);
  const ambient = useAmbient();

  useEffect(() => {
    ambient.set(query ? "amber" : "signal", 0.3, query ? "search" : "messages");
  }, [query, ambient]);

  const searching = query.trim().length >= 2;
  const list = searching ? (search.data ?? []) : (messages ?? []);

  return (
    <div className="space-y-4">
      <GlassPanel className="flex flex-wrap items-center gap-3">
        <GuildChannelPicker
          mode="text"
          guildsInitial={initialGuilds}
          guildId={guildId}
          channelId={channelId}
          onChange={(g, c) => {
            setGuildId(g);
            setChannelId(c);
            setSelected(null);
          }}
        />
        <div className="relative ml-auto w-64">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-faint" />
          <Input
            className="pl-9"
            placeholder="Search messages…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
      </GlassPanel>

      <div className="grid gap-4 lg:grid-cols-5">
        <GlassPanel className="lg:col-span-3">
          <SectionHeader
            eyebrow={searching ? "results" : "live feed"}
            title={searching ? `“${query}”` : "Messages"}
            action={
              <span className="mono text-xs text-ink-faint">
                {list.length} shown
              </span>
            }
          />
          {error && !messages ? (
            <ErrorState error={error} />
          ) : isLoading && !messages ? (
            <LoadingState label="Capturing" />
          ) : list.length === 0 ? (
            <EmptyState
              icon={<MessageSquare className="size-7" />}
              title="No messages"
              description="Pick a guild to begin, or run a search."
            />
          ) : (
            <div className="max-h-[60vh] space-y-1.5 overflow-y-auto pr-1">
              {list.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setSelected(m.id)}
                  className={`flex w-full items-start gap-3 rounded-[12px] border p-3 text-left transition-colors ${
                    selected === m.id
                      ? "border-signal/40 bg-signal/8"
                      : "border-hairline bg-white/[0.03] hover:bg-white/[0.06]"
                  }`}
                >
                  <Avatar src={m.avatar_url} name={m.username} size={34} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {m.username}
                      </span>
                      <span className="mono text-[0.65rem] text-ink-faint">
                        {getMessageChannelLabel(m)}
                      </span>
                      <span className="mono ml-auto text-[0.6rem] text-ink-faint">
                        {relTime(m.created_at)}
                      </span>
                    </div>
                    <div className="mt-0.5 line-clamp-2 text-sm text-ink-soft">
                      {renderMessageContent(m.content, m.metadata) || (
                        <span className="italic text-ink-faint">
                          (empty / embed)
                        </span>
                      )}
                    </div>
                  </div>
                  <AiBadge status={m.ai_status} />
                </button>
              ))}
            </div>
          )}
        </GlassPanel>

        <GlassPanel className="lg:col-span-2">
          <SectionHeader eyebrow="inspect" title="Detail" />
          {!selected ? (
            <EmptyState
              title="Select a message"
              description="Click any message to inspect AI analysis, attachments and edit history."
            />
          ) : detail.loading ? (
            <div className="space-y-2">
              <Skeleton className="h-20" />
              <Skeleton className="h-12" />
            </div>
          ) : detail.message ? (
            <MessageDetail
              m={detail.message}
              attachments={detail.attachments}
            />
          ) : (
            <EmptyState title="Not found" />
          )}
        </GlassPanel>
      </div>
    </div>
  );
}

function AiBadge({ status }: { status?: AiStatus | null }) {
  if (!status) return null;
  const tone = aiTone(status);
  const icon =
    status === "clean" ? (
      <CheckCircle2 className="size-3" />
    ) : status === "flagged" ? (
      <ShieldAlert className="size-3" />
    ) : status === "warn" ? (
      <AlertTriangle className="size-3" />
    ) : status === "processing" || status === "pending" ? (
      <Loader2 className="size-3 animate-spin" />
    ) : (
      <AlertTriangle className="size-3" />
    );
  return (
    <Badge tone={tone} dot={status === "processing" || status === "pending"}>
      {icon}
      {status}
    </Badge>
  );
}

function MessageDetail({
  m,
  attachments,
}: {
  m: MessageRecord;
  attachments: import("@/lib/types").AttachmentRecord[];
}) {
  const flags = safeParseJsonArray(m.ai_moderation_flags);
  const cats = safeParseJsonArray(m.ai_categories);
  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-3">
        <Avatar src={m.avatar_url} name={m.username} size={40} />
        <div>
          <div className="font-semibold text-ink">{m.username}</div>
          <div className="mono text-[0.65rem] text-ink-faint">
            {getMessageChannelLabel(m)} · {relTime(m.created_at)}
          </div>
        </div>
        <div className="ml-auto">
          <AiBadge status={m.ai_status} />
        </div>
      </div>

      <div className="rounded-[10px] border border-hairline bg-white/[0.03] p-3 text-ink-soft">
        {renderMessageContent(m.edited_content ?? m.content, m.metadata) ||
          "(no text)"}
      </div>

      {m.ai_analysis && (
        <div>
          <div className="eyebrow mb-1">AI analysis</div>
          <div className="rounded-[10px] border border-hairline bg-white/[0.03] p-3 text-ink-soft">
            {m.ai_analysis}
          </div>
        </div>
      )}

      {(flags.length > 0 || cats.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {flags.map((f) => (
            <Badge key={f} tone="vermilion">
              {f}
            </Badge>
          ))}
          {cats.map((c) => (
            <Badge key={c} tone="amber">
              {c}
            </Badge>
          ))}
        </div>
      )}

      {attachments.length > 0 && (
        <div>
          <div className="eyebrow mb-1 flex items-center gap-1.5">
            <Paperclip className="size-3" /> Attachments ({attachments.length})
          </div>
          <div className="space-y-1.5">
            {attachments.map((a) => (
              <a
                key={a.id}
                href={a.discord_url ?? a.uploaded_url ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="flex items-center gap-2 rounded-[10px] border border-hairline bg-white/5 px-3 py-2 text-xs text-ink-soft hover:text-ink"
              >
                <ImageIcon className="size-3.5 text-signal" />
                <span className="flex-1 truncate">{a.filename}</span>
                <span className="mono text-ink-faint">
                  {formatBytes(a.size)}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
