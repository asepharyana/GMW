import type { ModerationBreakdown } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import { Card, CardContent, Skeleton } from "../../../shared/ui";

interface SummaryCardsProps {
  messages: ModerationBreakdown | null;
  activeUsersCount: number;
  totalChannels: number;
  loading: boolean;
}

interface CardDef {
  label: string;
  value: string;
  accent: string;
  barColor: string;
  barPct?: number;
  icon: string;
}

export function SummaryCards({
  messages,
  activeUsersCount,
  totalChannels,
  loading,
}: SummaryCardsProps) {
  const avgPerHour = messages
    ? Math.round(messages.total / Math.max(1, 24))
    : 0;
  const cleanPct =
    messages && messages.total > 0
      ? Math.round((messages.clean / messages.total) * 100)
      : 0;
  const flaggedPct =
    messages && messages.total > 0
      ? Math.round((messages.flagged / messages.total) * 100)
      : 0;
  const warnedPct =
    messages && messages.total > 0
      ? Math.round((messages.warned / messages.total) * 100)
      : 0;

  const cards: CardDef[] = [
    {
      label: "Total Pesan",
      value: formatNum(messages?.total),
      accent: "text-foreground",
      barColor: "bg-primary",
      barPct: 100,
      icon: "💬",
    },
    {
      label: "Rata-rata/jam",
      value: formatNum(avgPerHour),
      accent: "text-muted-foreground",
      barColor: "bg-primary/60",
      barPct: avgPerHour > 0 ? Math.min((avgPerHour / 50) * 100, 100) : 0,
      icon: "📊",
    },
    {
      label: "Clean",
      value: cleanPct > 0 ? `${cleanPct}%` : "—",
      accent: "text-primary",
      barColor: "bg-primary",
      barPct: cleanPct,
      icon: "✅",
    },
    {
      label: "Warned",
      value: warnedPct > 0 ? `${warnedPct}%` : "—",
      accent: "text-yellow-600",
      barColor: "bg-yellow-400",
      barPct: warnedPct,
      icon: "⚠️",
    },
    {
      label: "Flagged",
      value: flaggedPct > 0 ? `${flaggedPct}%` : "—",
      accent: "text-accent",
      barColor: "bg-accent",
      barPct: flaggedPct,
      icon: "🚩",
    },
    {
      label: "Pending",
      value: formatNum(messages?.pending),
      accent: "text-muted-foreground",
      barColor: "bg-muted-foreground/40",
      barPct:
        messages && messages.total > 0
          ? Math.round((messages.pending / messages.total) * 100)
          : 0,
      icon: "⏳",
    },
    {
      label: "User Aktif",
      value: formatNum(activeUsersCount),
      accent: "text-primary",
      barColor: "bg-primary",
      barPct: activeUsersCount > 0 ? Math.min((activeUsersCount / 20) * 100, 100) : 0,
      icon: "👤",
    },
    {
      label: "Channel",
      value: formatNum(totalChannels),
      accent: "text-primary",
      barColor: "bg-primary",
      barPct: totalChannels > 0 ? Math.min((totalChannels / 20) * 100, 100) : 0,
      icon: "📡",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((card) => (
        <Card key={card.label} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5 mb-1.5">
              <span className="flex h-5 w-5 items-center justify-center text-[11px]">
                {card.icon}
              </span>
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {card.label}
              </div>
            </div>
            <div
              className={cn(
                "font-mono text-lg font-bold tabular-nums",
                loading ? "opacity-30" : card.accent,
              )}
            >
              {loading ? (
                <Skeleton className="h-7 w-12 mt-1" />
              ) : (
                card.value
              )}
            </div>
            {/* Mini bar indicator */}
            {card.barPct != null && !loading && (
              <div className="mt-1.5 h-1 overflow-hidden rounded-sm bg-muted/30">
                <div
                  className={cn("h-full rounded-sm transition-all duration-500", card.barColor)}
                  style={{ width: `${card.barPct}%` }}
                />
              </div>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

function formatNum(v: number | undefined | null): string {
  if (v == null || v === 0) return "—";
  return v.toLocaleString("id-ID");
}
