"use client";

import { ImageIcon } from "lucide-react";
import type { AttachmentRecord } from "@/lib/types";

interface AttachmentsGridProps {
  attachments: AttachmentRecord[];
  onImageClick?: (index: number) => void;
}

export function AttachmentsGrid({
  attachments,
  onImageClick,
}: AttachmentsGridProps) {
  if (attachments.length === 0) return null;

  const images = attachments.filter((a) => a.type?.startsWith("image/"));
  const others = attachments.filter((a) => !a.type?.startsWith("image/"));

  return (
    <div className="space-y-2">
      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {images.map((att, i) => (
            <div
              key={att.id}
              className="glass relative overflow-hidden rounded-lg group"
            >
              <button
                type="button"
                onClick={() => onImageClick?.(i)}
                className="block w-full cursor-zoom-in"
                aria-label={`Open ${att.filename}`}
              >
                <img
                  src={att.uploaded_url || att.discord_url}
                  alt={att.filename}
                  className="h-32 w-full object-cover transition-transform duration-300 group-hover:scale-105"
                  loading="lazy"
                  decoding="async"
                />
              </button>
              {images.length > 1 && (
                <span className="absolute bottom-1 right-1 rounded bg-black/50 px-1.5 py-0.5 font-mono text-[10px] text-white/80">
                  {i + 1}/{images.length}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
      {others.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {others.map((att) => (
            <div
              key={att.id}
              className="flex items-center gap-1.5 rounded-md bg-glass-bg px-2 py-1 text-xs text-text-secondary"
            >
              <ImageIcon className="size-3 text-text-secondary/50" />
              <span className="font-mono max-w-40 truncate">
                {att.filename}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
