import { Activity, BarChart3 } from "lucide-react";
import type { Channel, Guild } from "../../../shared/api/client";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Select, Button } from "../../../shared/ui";
import { cn } from "../../../shared/lib/utils";

const TIME_RANGES = [
  { label: "1j", value: 1 },
  { label: "3j", value: 3 },
  { label: "6j", value: 6 },
  { label: "12j", value: 12 },
  { label: "24j", value: 24 },
  { label: "48j", value: 48 },
  { label: "7h", value: 168 },
];

interface ControlBarProps {
  guilds: Guild[];
  channels: Channel[];
  selectedGuild: string;
  selectedChannel: string;
  hours: number;
  isFetching: boolean;
  onGuildChange: (guildId: string) => void;
  onChannelChange: (channelId: string) => void;
  onHoursChange: (hours: number) => void;
  onRefresh: () => void;
}

export function ControlBar({
  guilds,
  channels,
  selectedGuild,
  selectedChannel,
  hours,
  isFetching,
  onGuildChange,
  onChannelChange,
  onHoursChange,
  onRefresh,
}: ControlBarProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-muted-foreground" />
          Analisis Moderasi
        </CardTitle>
        <CardDescription>
          Pantau statistik, tren topik, dan aktivitas user.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={selectedGuild}
            onChange={(e) => onGuildChange(e.target.value)}
            placeholder="Pilih guild"
            options={guilds.map((g) => ({ value: g.id, label: g.name }))}
            className="min-w-[180px]"
          />
          <Select
            value={selectedChannel}
            onChange={(e) => onChannelChange(e.target.value)}
            placeholder="Semua channel"
            options={[
              { value: "", label: "Semua channel" },
              ...channels.map((c) => ({ value: c.id, label: c.name })),
            ]}
            className="min-w-[160px]"
          />
          <div className="flex items-center gap-1 rounded-md bg-muted p-0.5">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                type="button"
                onClick={() => onHoursChange(tr.value)}
                className={cn(
                  "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                  hours === tr.value
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {tr.label}
              </button>
            ))}
          </div>
          <Button
            onClick={onRefresh}
            disabled={isFetching}
            variant="outline"
            size="sm"
            className="ml-auto shrink-0"
          >
            {isFetching ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
                Memuat...
              </span>
            ) : (
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5" />
                Refresh
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
