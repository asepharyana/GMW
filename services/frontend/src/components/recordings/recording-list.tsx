"use client";

import { Download, Headphones, Trash2 } from "lucide-react";

import { EmptyState, LoadingSkeleton } from "@/components/shared";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  useDeleteRecording,
  useRecordings,
  useRecordingsWsSync,
} from "@/hooks";
import { formatBytes } from "@/lib/format";
import type { WsHook } from "@/lib/ws-hook";

interface RecordingListProps {
  ws: WsHook;
}

export function RecordingList({ ws }: RecordingListProps) {
  const { data: recordings, isLoading } = useRecordings();
  const deleteMut = useDeleteRecording();

  useRecordingsWsSync(ws);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <Headphones className="size-4 text-primary" />
          Voice Recordings
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <LoadingSkeleton count={5} height="h-16" />
        ) : !recordings || recordings.length === 0 ? (
          <EmptyState icon={Headphones} title="No recordings yet." />
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
                  <p className="text-sm font-medium truncate">{rec.username}</p>
                  <p className="text-xs text-muted-foreground">
                    {rec.channel_name ?? rec.channel_id ?? "Unknown channel"} —{" "}
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
                      if (rec.download_url)
                        window.open(rec.download_url, "_blank");
                    }}
                  >
                    <Download className="size-4" />
                  </Button>
                )}
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => deleteMut.mutate(rec.id)}
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
  );
}
