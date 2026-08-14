"use client";

import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Dialog } from "@/components/primitives/dialog";
import { cn } from "@/lib/utils";

export function Lightbox({
  open,
  onClose,
  src,
  alt,
  images = [],
  initialIndex = 0,
}: {
  open: boolean;
  onClose: () => void;
  src?: string;
  alt?: string;
  images?: Array<{ src: string; alt?: string }>;
  initialIndex?: number;
}) {
  const gallery = images.length > 0 ? images : src ? [{ src, alt }] : [];
  const [idx, setIdx] = useState(initialIndex);
  useEffect(() => setIdx(initialIndex), [initialIndex]);
  if (!gallery.length) return null;
  const current = gallery[idx];
  const hasNav = gallery.length > 1;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      className="p-0 border-0 bg-transparent shadow-none"
    >
      <div className="relative flex items-center justify-center p-4">
        {hasNav && (
          <button
            type="button"
            onClick={() =>
              setIdx((i) => (i - 1 + gallery.length) % gallery.length)
            }
            className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Previous"
          >
            ◀
          </button>
        )}
        <img
          src={current.src}
          alt={current.alt ?? alt ?? "attachment"}
          className="max-h-[80vh] max-w-full rounded-[var(--radius-r)] object-contain"
        />
        {hasNav && (
          <button
            type="button"
            onClick={() => setIdx((i) => (i + 1) % gallery.length)}
            className="absolute right-16 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60"
            aria-label="Next"
          >
            ▶
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="absolute top-2 right-2 rounded-full bg-black/40 p-1.5 text-white hover:bg-black/60"
          aria-label="Close"
        >
          <X className="size-4" />
        </button>
      </div>
    </Dialog>
  );
}
