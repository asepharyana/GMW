"use client";

import { Flame, Heart, SmilePlus } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { useTopReactions, useTopReactors } from "@/hooks";
import { renderMessageContent } from "@/lib/format";

function formatReactionTime(ts: number | null): string {
  if (!ts) return "";
  const diff = Date.now() - ts;
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return "baru saja";
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  return `${days} hari lalu`;
}

export function ReactionsSection() {
  const { data: reactions, isLoading: reactionsLoading } = useTopReactions();
  const { data: reactors, isLoading: reactorsLoading } = useTopReactors();

  return (
    <div className="space-y-4">
      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary/50">
          <Heart className="size-3" />
          Top pesan paling di-reaksi
        </h3>
        {reactionsLoading ? (
          <LoadingSkeleton count={5} height="h-16" />
        ) : !reactions || reactions.length === 0 ? (
          <GlassCard className="p-6">
            <EmptyState
              icon={Heart}
              title="Belum ada reaksi"
              description="Pesan dengan reaksi emoji akan muncul di sini."
            />
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {reactions.map((r, i) => (
              <GlassCard
                key={r.message_id}
                className="flex items-center gap-3 p-3"
              >
                <span className="w-6 shrink-0 text-center font-mono text-xs text-text-secondary/50">
                  {i + 1}
                </span>
                <div className="flex shrink-0 gap-0.5 text-base">
                  {r.top_emojis.map((e) => (
                    <span
                      key={`${r.message_id}-${e.emoji}`}
                      title={`${e.emoji} ×${e.count}`}
                    >
                      {e.emoji}
                    </span>
                  ))}
                  {r.top_emojis.length === 0 && (
                    <Heart className="size-4 text-text-secondary/30" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-xs text-text-secondary">
                    {renderMessageContent(r.content, undefined) ||
                      "(tanpa teks)"}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-mono text-text-secondary/40">
                    {r.username ?? "unknown"} · #
                    {r.channel_name ?? r.channel_id?.slice(0, 8)} ·{" "}
                    {formatReactionTime(r.created_at)}
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Heart className="size-3" />
                  {r.reaction_count}
                </Badge>
              </GlassCard>
            ))}
          </div>
        )}
      </div>

      <div>
        <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-text-secondary/50">
          <Flame className="size-3" />
          Top reaktor — paling sering ngasih reaksi
        </h3>
        {reactorsLoading ? (
          <LoadingSkeleton count={5} height="h-14" />
        ) : !reactors || reactors.length === 0 ? (
          <GlassCard className="p-6">
            <EmptyState
              icon={SmilePlus}
              title="Belum ada reaktor"
              description="User yang ngasih reaksi emoji akan muncul di sini."
            />
          </GlassCard>
        ) : (
          <div className="space-y-2">
            {reactors.map((r, i) => (
              <GlassCard
                key={r.user_id}
                className="flex items-center gap-3 p-3"
              >
                <span className="w-6 shrink-0 text-center font-mono text-xs text-text-secondary/50">
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium text-text-primary">
                    {r.username}
                  </p>
                  <p className="mt-0.5 truncate text-[10px] font-mono text-text-secondary/40">
                    {r.messages_reacted} pesan di-reaksi · {r.emojis_used} emoji
                    unik · {r.adds_count} total reaksi
                  </p>
                </div>
                <Badge variant="secondary" className="shrink-0 gap-1">
                  <Flame className="size-3" />
                  {r.net_count}
                </Badge>
              </GlassCard>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default ReactionsSection;
