"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type ToastTone = "signal" | "amber" | "vermilion" | "neutral";

interface ToastItem {
  id: number;
  title?: string;
  description?: string;
  tone: ToastTone;
}

interface ToastContextValue {
  toast: (t: {
    title?: string;
    description?: string;
    tone?: ToastTone;
  }) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    return {
      toast: (_: {
        title?: string;
        description?: string;
        tone?: ToastTone;
      }) => {},
    };
  }
  return ctx;
}

const toneBar: Record<ToastTone, string> = {
  signal: "bg-[var(--color-signal)]",
  amber: "bg-[var(--color-amber)]",
  vermilion: "bg-[var(--color-vermilion)]",
  neutral: "bg-[var(--color-ink-soft)]",
};

export interface ToasterProps {
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
}

export function Toaster({ position = "bottom-right" }: ToasterProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const reduce = useReducedMotion();

  const toast = useCallback(
    (t: { title?: string; description?: string; tone?: ToastTone }) => {
      const id = Date.now() + Math.random();
      const item: ToastItem = {
        id,
        tone: t.tone ?? "neutral",
        title: t.title,
        description: t.description,
      };
      setItems((prev) => [...prev, item]);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.id !== id));
      }, 4500);
    },
    [],
  );

  useEffect(() => {
    // expose a no-op provider only; actual provider wraps below
  }, []);

  const posClass =
    position === "bottom-right"
      ? "bottom-4 right-4"
      : position === "bottom-left"
        ? "bottom-4 left-4"
        : position === "top-right"
          ? "top-4 right-4"
          : "top-4 left-4";

  return (
    <ToastContext.Provider value={{ toast }}>
      <div
        className={cn(
          "fixed z-[60] flex w-[min(92vw,360px)] flex-col gap-2",
          posClass,
        )}
      >
        <AnimatePresence>
          {items.map((it) => (
            <motion.div
              key={it.id}
              layout
              initial={
                reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }
              }
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={
                reduce ? { opacity: 0 } : { opacity: 0, x: 40, scale: 0.96 }
              }
              transition={{ type: "spring", stiffness: 360, damping: 30 }}
              className="surface-2 relative flex gap-3 overflow-hidden p-3 pr-9 shadow-xl"
            >
              <span
                className={cn("w-1 shrink-0 rounded-full", toneBar[it.tone])}
              />
              <div className="min-w-0 flex-1">
                {it.title && (
                  <div className="text-sm font-semibold text-[var(--color-ink)]">
                    {it.title}
                  </div>
                )}
                {it.description && (
                  <div className="text-xs text-[var(--color-ink-soft)]">
                    {it.description}
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() =>
                  setItems((prev) => prev.filter((i) => i.id !== it.id))
                }
                className="absolute right-2 top-2 text-[var(--color-ink-soft)] hover:text-[var(--color-ink)]"
                aria-label="Dismiss"
              >
                <X className="size-3.5" />
              </button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  );
}
