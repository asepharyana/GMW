import type { AttachmentStats } from "../../../shared/api/client";
import { cn } from "../../../shared/lib/utils";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../../shared/ui";

interface AttachmentStatsPanelProps {
  stats: AttachmentStats | null;
  loading: boolean;
}

export function AttachmentStatsPanel({
  stats,
  loading,
}: AttachmentStatsPanelProps) {
  if (loading && !stats) {
    return <LoadingBox />;
  }

  if (!stats || stats.total_attachments === 0) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Belum ada lampiran/media.
        </CardContent>
      </Card>
    );
  }

  const uploadPct = stats.total_attachments > 0
    ? Math.round((stats.uploaded / stats.total_attachments) * 100)
    : 0;

  const failedPct = stats.total_attachments > 0
    ? Math.round((stats.failed / stats.total_attachments) * 100)
    : 0;

  const totalSizeMB = stats.total_size_bytes / (1024 * 1024);

  const cards = [
    { label: "Total Media", value: formatNum(stats.total_attachments), accent: "text-foreground" },
    { label: "Upload Success", value: `${uploadPct}%`, accent: "text-primary" },
    { label: "Gagal Upload", value: `${failedPct}%`, accent: "text-accent" },
    { label: "Total Ukuran", value: `${totalSizeMB.toFixed(1)} MB`, accent: "text-muted-foreground" },
    { label: "Pengupload", value: formatNum(stats.unique_uploaders), accent: "text-primary" },
  ];

  const statusCards = [
    {
      label: "Uploaded",
      value: formatNum(stats.uploaded),
      total: stats.total_attachments,
      barClass: "bg-gradient-to-r from-primary to-teal-300",
    },
    {
      label: "Pending",
      value: formatNum(stats.pending),
      total: stats.total_attachments,
      barClass: "bg-yellow-400/60",
    },
    {
      label: "Failed",
      value: formatNum(stats.failed),
      total: stats.total_attachments,
      barClass: "bg-accent/70",
    },
  ];

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <span className="text-lg">🖼️</span>
          Statistik Media
        </CardTitle>
        <CardDescription className="text-xs">
          {stats.top_mime_type ? (
            <>
              Upload status media — tipe dominan:{" "}
              <span className="font-medium text-primary">{stats.top_mime_type}</span>
            </>
          ) : (
            "Upload status media di semua channel."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {cards.map((c) => (
            <div
              key={c.label}
              className="rounded-xl border border-sky-100 bg-white p-3"
            >
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {c.label}
              </div>
              <div className={cn("mt-1 font-mono text-lg font-bold tabular-nums", c.accent)}>
                {c.value}
              </div>
            </div>
          ))}
        </div>

        <div className="space-y-2">
          <h4 className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Status Upload
          </h4>
          {statusCards.map((s) => (
            <div key={s.label} className="flex items-center gap-2">
              <span className="w-20 text-[10px] font-medium text-muted-foreground">
                {s.label}
              </span>
              <div className="flex-1 h-2 overflow-hidden rounded-full bg-sky-50">
                <div
                  className={cn("h-full rounded-full", s.barClass)}
                  style={{
                    width: `${(Number(s.value.replace(/\./g, "")) / Math.max(s.total, 1)) * 100}%`,
                  }}
                />
              </div>
              <span className="w-10 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                {s.value}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

function formatNum(v: number | undefined | null): string {
  if (v == null || v === 0) return "0";
  return v.toLocaleString("id-ID");
}

function LoadingBox() {
  return (
    <Card>
      <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}
