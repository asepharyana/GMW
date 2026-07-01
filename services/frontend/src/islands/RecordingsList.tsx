// ─── RecordingsList.tsx — Voice recordings list island ──────────────────────
// Fetches recordings from API, renders loading/error/empty/success states.
// Each recording card shows username, channel, timestamp, download button.
// ─────────────────────────────────────────────────────────────────────────────

import { Download, Mic } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { listRecordings } from "../shared/api/client";
import { Skeleton } from "../shared/components/skeleton";
import { formatBytes, formatDate } from "../shared/lib/utils";
import type { VoiceRecording } from "../shared/types/recording";

type ViewState = "loading" | "error" | "empty" | "success";

export default function RecordingsList() {
  const [state, setState] = useState<ViewState>("loading");
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [error, setError] = useState("");

  const fetchRecordings = useCallback(async () => {
    setState("loading");
    try {
      const res = await listRecordings();
      if (res.items.length === 0) {
        setState("empty");
      } else {
        setRecordings(res.items);
        setState("success");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load recordings",
      );
      setState("error");
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  /* ── Loading ──────────────────────────────────────────────────────────── */
  if (state === "loading") {
    return (
      <div
        role="presentation"
        aria-hidden="true"
        className="flex flex-col gap-4"
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg p-3">
            <Skeleton className="size-10 shrink-0 rounded-full" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  /* ── Error ────────────────────────────────────────────────────────────── */
  if (state === "error") {
    return (
      <div
        role="alert"
        className="flex min-h-48 flex-col items-center justify-center gap-4 rounded-xl px-6 py-10 text-center"
        style={{ backgroundColor: "oklch(var(--destructive) / 0.08)" }}
      >
        <div
          className="flex size-12 items-center justify-center rounded-full"
          style={{ backgroundColor: "oklch(var(--destructive) / 0.15)" }}
          aria-hidden="true"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ color: "oklch(var(--destructive))" }}
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <p className="max-w-sm text-sm font-medium text-foreground">{error}</p>
        <div className="mt-2">
          <button
            type="button"
            onClick={fetchRecordings}
            className="btn btn--outline btn--sm"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  /* ── Empty ────────────────────────────────────────────────────────────── */
  if (state === "empty") {
    return (
      <div className="flex min-h-64 flex-col items-center justify-center gap-4 px-6 py-12 text-center">
        <div
          className="flex size-16 items-center justify-center"
          aria-hidden="true"
        >
          <Mic
            className="size-10"
            style={{ color: "oklch(var(--muted-foreground))" }}
          />
        </div>
        <h2 className="text-xl font-semibold text-foreground">No recordings</h2>
        <p className="max-w-sm text-sm text-muted-foreground">
          Voice recordings will appear here once users start speaking in
          monitored voice channels.
        </p>
      </div>
    );
  }

  /* ── Success ──────────────────────────────────────────────────────────── */
  return (
    <div className="grid gap-4">
      {recordings.map((recording) => (
        <RecordingCard key={recording.id} recording={recording} />
      ))}
    </div>
  );
}

/* ─── Individual Recording Card ─────────────────────────────────────────── */

function RecordingCard({ recording }: { recording: VoiceRecording }) {
  return (
    <div className="card card--default card--pad-md">
      <div className="flex items-center justify-between gap-4">
        {/* Left: avatar + info */}
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted">
            {recording.avatar_url ? (
              <img
                src={recording.avatar_url}
                alt={recording.username}
                className="size-10 rounded-full object-cover"
              />
            ) : (
              <Mic className="size-5 text-muted-foreground" />
            )}
          </div>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium text-foreground">
              {recording.username}
            </p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {recording.channel_name && (
                <span className="truncate">#{recording.channel_name}</span>
              )}
              <span className="shrink-0">
                {formatDate(recording.created_at)}
              </span>
              <span className="shrink-0">
                {formatBytes(recording.size_bytes)}
              </span>
            </div>
          </div>
        </div>

        {/* Right: download button */}
        {recording.download_url && (
          <a
            href={recording.download_url}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn--ghost btn--icon shrink-0"
            aria-label={`Download recording by ${recording.username}`}
          >
            <Download className="size-4" />
          </a>
        )}
      </div>
    </div>
  );
}
