"use client";

import { Heart } from "lucide-react";
import { GlassCard } from "@/components/glass/card";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { useTopReactions } from "@/hooks";
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
  const { data: reactions, isLoading, error } = useTopReactions(20);

  if (error) {
    return (
      <GlassCard variant="danger" className="p-6 text-sm">
        Gagal load reactions: {error.message}
      </GlassCard>
    );
  }

  if (isLoading) {
    return <LoadingSkeleton count={6} height="h-16" />;
  }

  if (!reactions || reactions.length === 0) {
    return (
      <GlassCard className="p-6">
        <EmptyState
          icon={Heart}
          title="Belum ada reaksi"
          description="Pesan dengan reaksi emoji akan muncul di sini."
        />
      </GlassCard>
    );
  }

  return (
    <div className="space-y-2">
      {reactions.map((r, i) => (
        <GlassCard key={r.message_id} className="flex items-center gap-3 p-3">
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
              {renderMessageContent(r.content, undefined) || "(tanpa teks)"}
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
  );
}
