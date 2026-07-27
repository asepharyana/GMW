"use client";

import { RecordingList } from "@/components/recordings/recording-list";
import { useWebSocket } from "@/lib/ws/context";

export default function RecordingsPage() {
  const ws = useWebSocket();

  return (
    <div className="space-y-5 animate-fade-in-up">
      <RecordingList ws={ws} />
    </div>
  );
}
