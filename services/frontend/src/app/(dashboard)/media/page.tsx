"use client";

import { MusicPlayer } from "@/components/media/music-player";
import { useWebSocket } from "@/lib/ws/context";

export default function MediaPage() {
  const ws = useWebSocket();

  return (
    <div className="space-y-5 animate-fade-in-up">
      <MusicPlayer ws={ws} />
    </div>
  );
}
