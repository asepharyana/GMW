// ─── Recordings Sub-Panel ──

import { Download, Mic, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { VoiceRecording } from "../../../shared/api/client";
import { deleteRecording, listRecordings } from "../../../shared/api/client";
import { formatBytes, formatDate } from "../../../shared/lib/utils";
import { Badge, Button, Skeleton } from "../../../shared/ui";
import { EmptyStateMascot } from "../../../widgets/mascot/MascotImage";

export function RecordingsSubPanel() {
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deletingIds, setDeletingIds] = useState<Set<string>>(new Set());

  const loadRecordings = useCallback(async (
    opts?: { signal?: AbortSignal },
  ) => {
    try {
      setLoading(true);
      setError(null);
      const data = await listRecordings();
      if (!opts?.signal?.aborted) setRecordings(data);
    } catch (err) {
      if (!opts?.signal?.aborted)
        setError(err instanceof Error ? err.message : String(err));
    } finally {
      if (!opts?.signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const ab = new AbortController();
    loadRecordings({ signal: ab.signal });
    const handler = () => loadRecordings();
    window.addEventListener("voice_recording_uploaded", handler);
    return () => {
      ab.abort();
      window.removeEventListener("voice_recording_uploaded", handler);
    };
  }, [loadRecordings]);

  const handleDelete = useCallback(async (id: string) => {
    if (!confirm("Delete this recording?")) return;
    setDeletingIds((prev) => new Set(prev).add(id));
    try {
      await deleteRecording(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeletingIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  if (loading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <div
            key={i}
            className="flex items-center gap-4 rounded-xl border border-border bg-card p-4"
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
            onClick={() => loadRecordings()}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  if (recordings.length === 0) {
    return <EmptyStateMascot />;
  }

  return (
    <div className="space-y-3">
      {recordings.map((rec) => (
        <div
          key={rec.id}
          className="flex items-center gap-4 rounded-xl border border-sky-200 bg-white p-4"
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
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
            <Button
              size="sm"
              variant="ghost"
              disabled={deletingIds.has(rec.id)}
              onClick={() => handleDelete(rec.id)}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
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
                className="rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground hover:bg-primary/90"
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
