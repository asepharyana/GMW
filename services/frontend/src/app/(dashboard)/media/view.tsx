"use client";

import { MusicPlayer } from "@/components/media/music-player";
import type { MediaState } from "@/lib/types";
import { useWebSocket } from "@/lib/ws/context";

export default function MediaView({
  initialStatus,
}: {
  initialStatus?: MediaState;
}) {
  const ws = useWebSocket();

  return (
    <div className="space-y-5 animate-fade-in-up">
      <MusicPlayer ws={ws} initialData={initialStatus} />
    </div>
  );
}
