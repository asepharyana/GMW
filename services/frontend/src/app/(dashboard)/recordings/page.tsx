"use client";

import { Download, Headphones, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { recordingsApi } from "@/lib/api";
import { formatBytes } from "@/lib/format";
import type { VoiceRecording } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export default function RecordingsPage() {
  const ws = useWebSocket();
  const [recordings, setRecordings] = useState<VoiceRecording[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRecordings = useCallback(async () => {
    setLoading(true);
    try {
      const result = await recordingsApi.list(50);
      setRecordings(result.items);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecordings();
  }, [fetchRecordings]);

  // WS subscription for live updates
  useEffect(() => {
    const unsub = ws.on("voice_recording_uploaded", (rec) => {
      setRecordings((prev) => [rec as VoiceRecording, ...prev]);
    });
    return () => unsub();
  }, [ws]);

  const handleDelete = useCallback(async (id: string) => {
    try {
      await recordingsApi.delete(id);
      setRecordings((prev) => prev.filter((r) => r.id !== id));
    } catch {
      // ignore
    }
  }, []);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Headphones className="size-4 text-primary" />
            Voice Recordings
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }, (_, i) => (
                <div
                  key={i}
                  className="h-16 rounded-lg bg-muted/30 animate-pulse"
                />
              ))}
            </div>
          ) : recordings.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No recordings yet.
            </p>
          ) : (
            <div className="space-y-2">
              {recordings.map((rec) => (
                <div
                  key={rec.id}
                  className="flex items-center gap-3 rounded-lg border border-border/50 p-3 hover:bg-muted/30 transition-colors"
                >
                  <Avatar className="size-8">
                    <AvatarImage src={rec.avatar_url ?? undefined} />
                    <AvatarFallback>
                      {(rec.username ?? "?").charAt(0).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {rec.username}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {rec.channel_name ?? rec.channel_id ?? "Unknown channel"}
                      {" — "}
                      {new Date(rec.created_at).toLocaleString()}
                    </p>
                  </div>
                  <Badge
                    variant="outline"
                    className="text-[10px] font-mono shrink-0"
                  >
                    {formatBytes(rec.size_bytes)}
                  </Badge>
                  {rec.download_url && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        if (rec.download_url) window.open(rec.download_url, "_blank");
                      }}
                    >
                      <Download className="size-4" />
                    </Button>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(rec.id)}
                    className="hover:text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
