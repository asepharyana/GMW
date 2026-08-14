"use client";

import { Flame, Heart, SmilePlus } from "lucide-react";
import { Avatar } from "@/components/primitives/avatar";
import { Badge } from "@/components/primitives/badge";
import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { useTopReactions, useTopReactors } from "@/hooks";

export interface ReactionsSectionProps {
  initialReactions?: Awaited<ReturnType<typeof useTopReactions>>["data"];
}

export function ReactionsSection() {
  const { data: reactions, isLoading: reactionsLoading } = useTopReactions();
  const { data: reactors, isLoading: reactorsLoading } = useTopReactors();

  if (reactionsLoading || reactorsLoading) return <LoadingSkeleton count={5} />;

  const topReactions = (reactions ?? []).slice(0, 6);
  const topReactors = (reactors ?? []).slice(0, 6);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <div className="surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Heart className="size-4 text-[var(--color-vermilion)]" />
          Top reactions
        </h3>
        {topReactions.length === 0 ? (
          <EmptyState
            icon={SmilePlus}
            title="No reactions"
            description="No reactions yet."
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {topReactions
              .flatMap((m) =>
                m.top_emojis.map((e) => ({ emoji: e.emoji, count: e.count })),
              )
              .reduce<{ emoji: string; count: number }[]>((acc, cur) => {
                const found = acc.find((x) => x.emoji === cur.emoji);
                if (found) found.count += cur.count;
                else acc.push(cur);
                return acc;
              }, [])
              .sort((a, b) => b.count - a.count)
              .slice(0, 8)
              .map((r) => (
                <span
                  key={r.emoji}
                  className="flex items-center gap-1.5 rounded-[var(--radius-r-control)] bg-[var(--color-surface-2)] px-2.5 py-1 text-sm"
                >
                  <span>{r.emoji}</span>
                  <span className="mono text-xs text-[var(--color-ink-soft)]">
                    {r.count}
                  </span>
                </span>
              ))}
          </div>
        )}
      </div>

      <div className="surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold">
          <Flame className="size-4 text-[var(--color-amber)]" />
          Top reactors
        </h3>
        {topReactors.length === 0 ? (
          <EmptyState
            icon={SmilePlus}
            title="No reactors"
            description="No reactors yet."
          />
        ) : (
          <div className="flex flex-col gap-2">
            {topReactors.map((r) => (
              <div key={r.user_id} className="flex items-center gap-3">
                <Avatar name={r.username} size={28} />
                <span className="flex-1 text-sm">{r.username}</span>
                <Badge tone="signal">+{r.net_count}</Badge>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
