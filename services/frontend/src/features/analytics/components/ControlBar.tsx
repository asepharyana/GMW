import { Activity, BarChart3 } from "lucide-react";
import { cn } from "../../../shared/lib/utils";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

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
  guildName: string | null;
  hours: number;
  isFetching: boolean;
  onHoursChange: (hours: number) => void;
  onRefresh: () => void;
}

export function ControlBar({
  guildName,
  hours,
  isFetching,
  onHoursChange,
  onRefresh,
}: ControlBarProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <BarChart3 className="h-5 w-5 text-primary" />
          Analisis Moderasi
        </CardTitle>
        <CardDescription>
          {guildName ? (
            <>
              Pantau statistik, tren topik, dan aktivitas user di seluruh
              channel{" "}
              <span className="font-medium text-primary">{guildName}</span>.
            </>
          ) : (
            "Pantau statistik, tren topik, dan aktivitas user."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1 rounded-lg bg-muted/30 p-0.5 ring-1 ring-muted/50">
            {TIME_RANGES.map((tr) => (
              <button
                key={tr.value}
                type="button"
                onClick={() => onHoursChange(tr.value)}
                className={cn(
                  "rounded-md px-2.5 py-1 text-xs font-medium transition-all",
                  hours === tr.value
                    ? "bg-primary text-white shadow-sm"
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
            className="ml-auto shrink-0 rounded-lg border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
          >
            {isFetching ? (
              <span className="flex items-center gap-1.5">
                <span className="h-3 w-3 animate-spin rounded-sm border-2 border-primary border-t-transparent" />
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
