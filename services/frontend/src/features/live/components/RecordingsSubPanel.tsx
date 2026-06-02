// ─── Recordings Sub-Panel — BUG 1 FIX: useEffect instead of useMemo for side effects ──

import { Download, Mic } from "lucide-react";
import { useEffect, useState } from "react";
import { Badge, Button, EmptyStateMascot, Skeleton } from "../../../shared/ui";
import { formatBytes, formatDate } from "../../../shared/lib/utils";

interface VoiceRecording {
  id: string;
  user_id: string;
  username: string;
  avatar_url: string | null;
  guild_id: string | null;
  channel_id: string | null;
  channel_name: string | null;
  filename: string;
  size_bytes: number;
  download_url: string | null;
  upload_status: "pending" | "uploaded" | "failed";
  upload_error: string | null;
  created_at: number;
  uploaded_at: number | null;
}

export function RecordingsSubPanel() {
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // BUG 1 FIX: proper useEffect for async data fetching
  useEffect(() => {
    let cancelled = false;
    async function loadRecordings() {
      try {
        setLoading(true);
        setError(null);
        const response = await fetch("/api/recordings");
        if (!response.ok)
          throw new Error(`Failed to load recordings: ${response.status}`);
        const data = (await response.json()) as VoiceRecording[];
        if (!cancelled) setRecordings(data);
      } catch (err) {
        if (!cancelled)
          setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    loadRecordings();
    const handler = () => loadRecordings();
    window.addEventListener("voice_recording_uploaded", handler);
    return () => {
      cancelled = true;
      window.removeEventListener("voice_recording_uploaded", handler);
    };
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-sky-200 bg-white p-4"
          >
            <Skeleton className="h-10 w-10 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-48" />
              <Skeleton className="h-3 w-64" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-dashed border-destructive p-6 text-center text-sm text-destructive">
        {error}
        <div className="mt-2">
          <Button
            size="sm"
            variant="outline"
            onClick={() => window.location.reload()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (recordings.length === 0) {
    return (
      <EmptyStateMascot variant="sleeping" message="No recordings yet~" />
    );
  }

  return (
    <div className="space-y-3">
      {recordings.map((rec) => (
        <div
          key={rec.id}
          className="flex items-center gap-4 rounded-xl border border-sky-200 bg-white p-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#7EC8E3]/15 text-[#7EC8E3]">
            <Mic className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium">{rec.filename}</div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
              <span>{rec.username}</span>
              <span>·</span>
              <span>{rec.channel_name ?? rec.channel_id ?? "unknown"}</span>
              <span>·</span>
              <span>{formatDate(rec.created_at)}</span>
              <span>·</span>
              <span>{formatBytes(rec.size_bytes)}</span>
            </div>
            {rec.upload_error && (
              <div className="mt-1 text-xs text-destructive">
                {rec.upload_error}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge
              variant={
                rec.upload_status === "uploaded"
                  ? "success"
                  : rec.upload_status === "failed"
                    ? "destructive"
                    : "secondary"
              }
            >
              {rec.upload_status}
            </Badge>
            {rec.download_url && (
              <a
                href={rec.download_url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg bg-[#7EC8E3] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#7EC8E3]/80"
              >
                <Download className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
