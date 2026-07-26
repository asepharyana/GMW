"use client";

import { Disc3, Music, Play, SkipForward, Square, Volume2 } from "lucide-react";
import Image from "next/image";
import { useCallback, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { useMediaState } from "@/hooks";
import { useWebSocket } from "@/lib/ws/context";

export default function MediaPage() {
  const ws = useWebSocket();
  const { mediaState, refresh, queue, skip, stop, setVolume } = useMediaState();
  const [queueUrl, setQueueUrl] = useState("");

  useEffect(() => {
    refresh();
  }, [refresh]);

  // WS subscription for real-time media state
  useEffect(() => {
    const unsub = ws.on("media_state", () => refresh());
    return unsub;
  }, [ws, refresh]);

  const handleQueue = useCallback(() => {
    if (!queueUrl.trim()) return;
    queue(queueUrl.trim());
    setQueueUrl("");
  }, [queueUrl, queue]);

  return (
    <div className="space-y-5 animate-fade-in-up">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold">
            <Music className="size-4 text-primary" />
            Music Player
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Queue a URL (YouTube, audio file…)"
              value={queueUrl}
              onChange={(e) => setQueueUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleQueue()}
              className="flex-1 h-9"
            />
            <Button onClick={handleQueue} disabled={!queueUrl.trim()}>
              <Play className="size-4 mr-1.5" />
              Queue
            </Button>
          </div>

          {mediaState?.current && (
            <div className="rounded-lg bg-gradient-to-br from-primary/5 to-primary/[0.02] border border-primary/10 p-4 space-y-2">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider flex items-center gap-1.5">
                <Disc3 className="size-3" />
                Now Playing
              </p>
              <div className="flex items-start gap-3">
                {mediaState.current.thumbnailUrl && (
                  <Image
                    src={mediaState.current.thumbnailUrl}
                    alt=""
                    width={56}
                    height={56}
                    className="size-14 rounded-lg object-cover shadow-sm"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {mediaState.current.title ?? mediaState.current.source}
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {mediaState.current.durationMs
                      ? `${Math.floor(mediaState.current.durationMs / 60000)}:${String(
                          Math.floor(
                            (mediaState.current.durationMs % 60000) / 1000,
                          ),
                        ).padStart(2, "0")}`
                      : "Live"}
                  </p>
                </div>
              </div>
            </div>
          )}

          {!mediaState?.current && !mediaState?.queue?.length && (
            <p className="text-sm text-muted-foreground py-8 text-center">
              No media queued. Paste a URL above to start playing.
            </p>
          )}

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={stop}>
              <Square className="size-4 mr-1" />
              Stop
            </Button>
            <Button variant="outline" size="sm" onClick={skip}>
              <SkipForward className="size-4 mr-1" />
              Skip
            </Button>
            <div className="flex items-center gap-2 ml-auto">
              <Volume2 className="size-4 text-muted-foreground" />
              <Slider
                className="w-24"
                defaultValue={[mediaState?.musicVolume ?? 0.5]}
                value={[mediaState?.musicVolume ?? 0.5]}
                onValueChange={setVolume}
                min={0}
                max={1}
                step={0.05}
              />
            </div>
          </div>

          {mediaState && mediaState.queue.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs text-muted-foreground font-medium">
                Queue ({mediaState.queue.length})
              </p>
              <div className="space-y-1">
                {mediaState.queue.map((item, i) => (
                  <div
                    key={item.id ?? i}
                    className="flex items-center gap-2 rounded-md bg-muted/30 px-3 py-2 text-sm"
                  >
                    <span className="text-xs text-muted-foreground font-mono w-5 text-right">
                      {i + 1}.
                    </span>
                    <span className="truncate flex-1">
                      {item.title ?? item.source}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
