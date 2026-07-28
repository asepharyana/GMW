"use client";

import { Flag } from "lucide-react";
import type { MessageRecord } from "@/lib/types";
import { MessageCard } from "./message-card";

export function ReviewList({
  reviews,
  onSelect,
  onReanalyze,
}: {
  reviews: MessageRecord[];
  onSelect: (id: string) => void;
  onReanalyze: (id: string) => void;
}) {
  if (!reviews || reviews.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <Flag className="size-10 text-muted-foreground/40 mb-3" />
        <p className="text-sm text-muted-foreground">
          No flagged messages to review.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2 animate-fade-in-up">
      {reviews.map((msg) => (
        <MessageCard
          key={msg.id}
          message={msg}
          onClick={onSelect}
          onReanalyze={onReanalyze}
        />
      ))}
    </div>
  );
}
