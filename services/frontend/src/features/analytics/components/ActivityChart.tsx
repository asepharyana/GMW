import type { HourlyBucket } from "../../../shared/api/client";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

interface ActivityChartProps {
  hourly: HourlyBucket[];
  loading: boolean;
}

export function ActivityChart({ hourly, loading }: ActivityChartProps) {
  if (loading && !hourly?.length) {
    return <LoadingBox />;
  }

  if (!hourly?.length) {
    return <EmptyBox text="Belum ada data untuk periode ini." />;
  }

  const data = hourly.map((b) => {
    const utcHour = parseInt(b.hour.slice(11, 13), 10);
    const jakartaHour = (utcHour + 7) % 24;
    return {
      hour: `${String(jakartaHour).padStart(2, "0")}:00`,
      clean: b.clean,
      warned: b.warned,
      flagged: b.flagged,
      error: b.error,
      total: b.count,
    };
  });

  return (
    <Card className="col-span-1 lg:col-span-2 glass border-white/5">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold">
          Aktivitas per Jam
        </CardTitle>
        <CardDescription className="text-xs">
          Distribusi pesan per jam berdasarkan status moderasi.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="space-y-3">
          <div className="grid grid-cols-4 gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
            <span>Clean</span>
            <span>Warned</span>
            <span>Flagged</span>
            <span>Error</span>
          </div>
          <div className="max-h-55 space-y-2 overflow-auto pr-1">
            {data.map((bucket) => {
              const total = Math.max(bucket.total, 1);
              const clean = bucket.clean / total;
              const warned = bucket.warned / total;
              const flagged = bucket.flagged / total;
              const error = bucket.error / total;
              return (
                <div
                  key={bucket.hour}
                  className="grid gap-1 rounded-xl border border-border bg-background/50 p-3"
                >
                  <div className="flex items-center justify-between text-[11px] text-muted-foreground">
                    <span className="font-medium text-foreground">
                      {bucket.hour}
                    </span>
                    <span>{bucket.total} pesan</span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="bg-emerald-500/80"
                      style={{ width: `${clean * 100}%` }}
                    />
                    <div
                      className="bg-amber-500/80"
                      style={{ width: `${warned * 100}%` }}
                    />
                    <div
                      className="bg-red-500/80"
                      style={{ width: `${flagged * 100}%` }}
                    />
                    <div
                      className="bg-orange-500/80"
                      style={{ width: `${error * 100}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function LoadingBox() {
  return (
    <Card className="col-span-1 flex h-65 items-center justify-center text-sm text-muted-foreground lg:col-span-2 glass border-white/5">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="ml-2">Memuat data...</span>
    </Card>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <Card className="col-span-1 flex h-65 items-center justify-center text-sm text-muted-foreground lg:col-span-2 glass border-white/5">
      {text}
    </Card>
  );
}
