import type { ModerationBreakdown } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import { Card, CardContent, Skeleton } from "../../../shared/ui";

interface SummaryCardsProps {
  messages: ModerationBreakdown | null;
  activeUsersCount: number;
  totalChannels: number;
  loading: boolean;
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

  const icons: Record<string, string> = {
    "Total Pesan": "💬",
    "Rata-rata/jam": "📊",
    Clean: "✅",
    Warned: "⚠️",
    Flagged: "🚩",
    Pending: "⏳",
    "User Aktif": "👤",
    Channel: "📡",
  };

  const warnedPct =
    messages && messages.total > 0
      ? Math.round((messages.warned / messages.total) * 100)
      : 0;

  const cards = [
    {
      label: "Total Pesan",
      value: formatNum(messages?.total),
      accent: "text-foreground",
    },
    {
      label: "Rata-rata/jam",
      value: formatNum(avgPerHour),
      accent: "text-muted-foreground",
    },
    {
      label: "Clean",
      value: cleanPct > 0 ? `${cleanPct}%` : "—",
      accent: "text-primary",
    },
    {
      label: "Warned",
      value: warnedPct > 0 ? `${warnedPct}%` : "—",
      accent: "text-yellow-600",
    },
    {
      label: "Flagged",
      value: flaggedPct > 0 ? `${flaggedPct}%` : "—",
      accent: "text-accent",
    },
    {
      label: "Pending",
      value: formatNum(messages?.pending),
      accent: "text-muted-foreground",
    },
    {
      label: "User Aktif",
      value: formatNum(activeUsersCount),
      accent: "text-primary",
    },
    {
      label: "Channel",
      value: formatNum(totalChannels),
      accent: "text-primary",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-8">
      {cards.map((card) => (
        <Card key={card.label} className="overflow-hidden">
          <CardContent className="p-3">
            <div className="flex items-center gap-1.5">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-[10px]">
                {icons[card.label] ?? "📋"}
              </span>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {card.label}
              </div>
            </div>
            <div
              className={cn(
                "mt-1 font-mono text-lg font-bold tabular-nums",
                card.accent,
              )}
            >
              {loading ? <Skeleton className="h-7 w-12 mt-1" /> : card.value}
            </div>
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
