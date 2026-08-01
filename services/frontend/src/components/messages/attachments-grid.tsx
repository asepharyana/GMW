"use client";

import type { AttachmentRecord } from "@/lib/types";

interface AttachmentsGridProps {
  attachments: AttachmentRecord[];
}

export function AttachmentsGrid({ attachments }: AttachmentsGridProps) {
  if (attachments.length === 0) return null;

  return (
    <div className="grid grid-cols-2 gap-2">
      {attachments.map((att) => (
        <div
          key={att.id}
          className="glass rounded-lg overflow-hidden group relative"
        >
          {att.type?.startsWith("image/") ? (
            <img
              src={att.uploaded_url || att.discord_url}
              alt={att.filename}
              className="w-full h-32 object-cover transition-transform group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="flex items-center gap-2 p-3 text-xs text-text-secondary">
              <span className="font-mono truncate">{att.filename}</span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
