"use client";

import { ChevronLeft, ChevronRight, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";

interface LightboxProps {
  images: Array<{ src: string; alt?: string }>;
  initialIndex?: number;
  open: boolean;
  onClose: () => void;
}

/**
 * Fullscreen image viewer with keyboard navigation (←/→/Esc) and
 * touch-swipe support. Mounted at page level so a single instance
 * serves the message list, image grid and attachments grid.
 */
export function Lightbox({
  images,
  initialIndex = 0,
  open,
  onClose,
}: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);

  useEffect(() => {
    if (open) setIndex(initialIndex);
  }, [open, initialIndex]);

  const prev = useCallback(() => {
    setIndex((i) => (i - 1 + images.length) % images.length);
  }, [images.length]);

  const next = useCallback(() => {
    setIndex((i) => (i + 1) % images.length);
  }, [images.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowLeft") prev();
      if (e.key === "ArrowRight") next();
    };
    document.addEventListener("keydown", onKey);
    // Lock body scroll while the lightbox is open
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose, prev, next]);

  if (!open || images.length === 0) return null;

  const current = images[index] ?? images[0];

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-label="Image viewer"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
      tabIndex={-1}
    >
      {/* Close */}
      <button
        type="button"
        onClick={onClose}
        className="absolute right-4 top-4 z-10 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
        aria-label="Close viewer"
      >
        <X className="size-5" />
      </button>

      {/* Image */}
      <div className="max-h-[85vh] max-w-[90vw]">
        <img
          key={current.src}
          src={current.src}
          alt={current.alt ?? ""}
          className="max-h-[85vh] max-w-[90vw] rounded-lg object-contain shadow-2xl"
          loading="eager"
          draggable={false}
        />
      </div>

      {/* Counter */}
      {images.length > 1 && (
        <span className="absolute bottom-4 left-1/2 -translate-x-1/2 rounded-full bg-white/10 px-3 py-1 font-mono text-xs text-white/80">
          {index + 1} / {images.length}
        </span>
      )}

      {/* Nav */}
      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              prev();
            }}
            className="absolute left-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Previous image"
          >
            <ChevronLeft className="size-6" />
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              next();
            }}
            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white/80 transition-colors hover:bg-white/20 hover:text-white"
            aria-label="Next image"
          >
            <ChevronRight className="size-6" />
          </button>
        </>
      )}
    </div>
  );
}
