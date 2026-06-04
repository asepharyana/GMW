import { useState } from "react";
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

const UPLOAD_COLORS = {
  uploaded: { color: "#38bdf8", label: "Uploaded" },
  pending: { color: "#facc15", label: "Pending" },
  failed: { color: "#f472b6", label: "Failed" },
} as const;

function UploadDonut({
  uploaded,
  pending,
  failed,
  total,
}: { uploaded: number; pending: number; failed: number; total: number }) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const size = 120;
  const strokeWidth = 20;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const center = size / 2;

  const entries = [
    { key: "uploaded" as const, ...UPLOAD_COLORS.uploaded, value: uploaded },
    { key: "pending" as const, ...UPLOAD_COLORS.pending, value: pending },
    { key: "failed" as const, ...UPLOAD_COLORS.failed, value: failed },
  ].filter((e) => e.value > 0);

  let cumulative = 0;
  const segments = entries.map((e) => {
    const offset = cumulative;
    const length = (e.value / total) * circumference;
    cumulative += length;
    return { ...e, length, offset };
  });

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="hsl(var(--muted))"
          strokeWidth={strokeWidth}
          opacity={0.15}
        />
        {segments.map((seg) => {
          const isHovered = hoveredKey === seg.key;
          return (
            <circle
              key={seg.key}
              cx={center}
              cy={center}
              r={radius}
              fill="none"
              stroke={seg.color}
              strokeWidth={strokeWidth}
              strokeDasharray={`${seg.length} ${circumference - seg.length}`}
              strokeDashoffset={-seg.offset}
              strokeLinecap="round"
              className={cn(
                "transition-all duration-200",
                hoveredKey && !isHovered ? "opacity-30" : "opacity-100",
              )}
              onMouseEnter={() => setHoveredKey(seg.key)}
              onMouseLeave={() => setHoveredKey(null)}
            />
          );
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
        <span className="text-lg font-bold tabular-nums leading-none">
          {total}
        </span>
        <span className="text-[9px] text-muted-foreground mt-0.5">Total</span>
      </div>
      {hoveredKey && (
        <div className="absolute -bottom-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-muted bg-white px-2.5 py-1 text-xs shadow-lg z-10 pointer-events-none">
          {(() => {
            const e = entries.find((en) => en.key === hoveredKey);
            if (!e) return null;
            return `${e.label}: ${e.value}`;
          })()}
        </div>
      )}
    </div>
  );
}

export function AttachmentStatsPanel({
  stats,
  loading,
}: AttachmentStatsPanelProps) {
  if (loading && !stats) return <LoadingBox />;
  if (!stats || stats.total_attachments === 0) {
    return (
      <Card>
        <CardContent className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
          Belum ada lampiran/media.
        </CardContent>
      </Card>
    );
  }

  const uploadPct =
    stats.total_attachments > 0
      ? Math.round((stats.uploaded / stats.total_attachments) * 100)
      : 0;
  const failedPct =
    stats.total_attachments > 0
      ? Math.round((stats.failed / stats.total_attachments) * 100)
      : 0;
  const totalSizeMB = stats.total_size_bytes / (1024 * 1024);

  const metricCards = [
    { label: "Total Media", value: formatNum(stats.total_attachments), accent: "text-foreground" },
    { label: "Upload Success", value: `${uploadPct}%`, accent: "text-primary" },
    { label: "Gagal Upload", value: `${failedPct}%`, accent: "text-accent" },
    { label: "Total Ukuran", value: `${totalSizeMB.toFixed(1)} MB`, accent: "text-muted-foreground" },
    { label: "Pengupload", value: formatNum(stats.unique_uploaders), accent: "text-primary" },
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
              <span className="font-medium text-primary">
                {stats.top_mime_type}
              </span>
            </>
          ) : (
            "Upload status media di semua channel."
          )}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
          {metricCards.map((c) => (
            <div
              key={c.label}
              className="rounded-lg border border-muted/50 bg-white p-3"
            >
              <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                {c.label}
              </div>
              <div
                className={cn(
                  "mt-1 font-mono text-lg font-bold tabular-nums",
                  c.accent,
                )}
              >
                {c.value}
              </div>
            </div>
          ))}
        </div>

        {/* Donut + status bars */}
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <UploadDonut
            uploaded={stats.uploaded}
            pending={stats.pending}
            failed={stats.failed}
            total={stats.total_attachments}
          />

          {/* Status legend with inline bars */}
          <div className="flex-1 w-full space-y-2">
            {[
              {
                key: "uploaded",
                ...UPLOAD_COLORS.uploaded,
                value: stats.uploaded,
              },
              {
                key: "pending",
                ...UPLOAD_COLORS.pending,
                value: stats.pending,
              },
              {
                key: "failed",
                ...UPLOAD_COLORS.failed,
                value: stats.failed,
              },
            ].map((s) => {
              const pct = (s.value / stats.total_attachments) * 100;
              return (
                <div key={s.key} className="flex items-center gap-2">
                  <span className="w-20 text-[10px] font-medium text-muted-foreground truncate">
                    {s.label}
                  </span>
                  <div className="flex-1 h-2 overflow-hidden rounded-md bg-muted/30">
                    <div
                      className="h-full rounded-md transition-all duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: s.color,
                      }}
                    />
                  </div>
                  <span className="w-8 text-right font-mono text-[10px] tabular-nums text-muted-foreground">
                    {s.value}
                  </span>
                </div>
              );
            })}
          </div>
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
        <span className="h-4 w-4 animate-spin rounded-sm border-2 border-current border-t-transparent" />
        <span className="ml-2">Memuat data...</span>
      </CardContent>
    </Card>
  );
}
