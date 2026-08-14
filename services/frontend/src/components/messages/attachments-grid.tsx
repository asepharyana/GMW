"use client";

import type { AttachmentRef } from "@/lib/types";
import { cn } from "@/lib/utils";

export function AttachmentsGrid({
  attachments,
  onOpen,
}: {
  attachments: AttachmentRef[];
  onOpen: (url: string) => void;
}) {
  if (attachments.length === 0) return null;
  const images = attachments.filter((a) => /image/i.test(a.contentType ?? ""));
  if (images.length === 0) return null;
  return (
    <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
      {images.map((a, i) => (
        <button
          key={`${a.url}-${i}`}
          type="button"
          onClick={() => onOpen(a.url)}
          className="group relative aspect-video overflow-hidden rounded-[var(--radius-r-control)] border border-[var(--color-hairline)]"
        >
          <img
            src={a.url}
            alt={a.name}
            loading="lazy"
            className="size-full object-cover transition-transform duration-200 group-hover:scale-105"
          />
        </button>
      ))}
    </div>
  );
}
