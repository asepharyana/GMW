"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { type ReactNode, useEffect } from "react";
import { cn } from "@/lib/utils";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  side?: "left" | "right" | "bottom";
  className?: string;
}

export function Sheet({
  open,
  onClose,
  children,
  side = "left",
  className,
}: SheetProps) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const dir =
    side === "left"
      ? { initial: { x: "-100%" }, animate: { x: 0 } }
      : side === "right"
        ? { initial: { x: "100%" }, animate: { x: 0 } }
        : { initial: { y: "100%" }, animate: { y: 0 } };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-black/55 backdrop-blur-sm"
            onClick={onClose}
            aria-hidden
          />
          <motion.aside
            className={cn(
              "absolute bg-[var(--color-canvas)] shadow-2xl",
              side === "left" &&
                "left-0 top-0 h-full w-72 border-r border-[var(--color-hairline)]",
              side === "right" &&
                "right-0 top-0 h-full w-72 border-l border-[var(--color-hairline)]",
              side === "bottom" &&
                "bottom-0 left-0 w-full rounded-t-2xl border-t border-[var(--color-hairline)]",
              className,
            )}
            initial={reduce ? { opacity: 0 } : dir.initial}
            animate={reduce ? { opacity: 1 } : dir.animate}
            exit={reduce ? { opacity: 0 } : dir.initial}
            transition={{ type: "spring", stiffness: 320, damping: 32 }}
          >
            {children}
          </motion.aside>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
