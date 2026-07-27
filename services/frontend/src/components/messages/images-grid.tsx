"use client";

import { ImageIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import type { MessageRecord } from "@/lib/types";
import { extractFirstImage } from "./message-card";

export function ImagesGrid({
  images,
  onSelect,
}: {
  images: MessageRecord[];
  onSelect: (id: string) => void;
}) {
  if (!images || images.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ImageIcon
          className="size-10 text-muted-foreground/40 mb-3"
          aria-label="No images"
        />
        <p className="text-sm text-muted-foreground">No images yet.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 animate-fade-in-up">
      {images.map((msg) => {
        const imgUrl = extractFirstImage(msg.metadata);
        return (
          <Card
            key={msg.id}
            className="group relative overflow-hidden cursor-pointer"
            onClick={() => onSelect(msg.id)}
          >
            <div className="aspect-square relative bg-muted">
              {imgUrl ? (
                <img
                  src={imgUrl}
                  alt={msg.content || "Image"}
                  className="absolute inset-0 size-full object-cover transition-transform duration-300 group-hover:scale-105"
                />
              ) : (
                <div className="flex items-center justify-center size-full text-muted-foreground text-xs">
                  No image
                </div>
              )}
              {msg.content && (
                <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 flex items-end p-3">
                  <p className="text-xs text-white/90 line-clamp-2">
                    {msg.username}: {msg.content}
                  </p>
                </div>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}
