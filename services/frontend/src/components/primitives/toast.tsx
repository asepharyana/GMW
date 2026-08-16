"use client";

import { AlertTriangle, CheckCircle2, Info, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

type ToastTone = "signal" | "vermilion" | "neutral";
interface Toast {
  id: number;
  title: string;
  description?: string;
  tone: ToastTone;
}

let nextId = 1;
const listeners = new Set<(t: Toast[]) => void>();
let store: Toast[] = [];

function emit() {
  store = [...store];
  listeners.forEach((l) => l(store));
}

export function toast(t: {
  title: string;
  description?: string;
  tone?: ToastTone;
}) {
  const item: Toast = { id: nextId++, tone: t.tone ?? "neutral", ...t };
  store = [...store, item];
  listeners.forEach((l) => l(store));
  setTimeout(() => {
    store = store.filter((x) => x.id !== item.id);
    emit();
  }, 4200);
}

export function useToast() {
  return { toast };
}

const icons = {
  signal: CheckCircle2,
  vermilion: AlertTriangle,
  neutral: Info,
};

export function Toaster({ position = "bottom-right" }: { position?: string }) {
  const [items, setItems] = useState<Toast[]>([]);
  useEffect(() => {
    listeners.add(setItems);
    setItems(store);
    return () => {
      listeners.delete(setItems);
    };
  }, []);

  const pos =
    position === "bottom-right"
      ? "bottom-[calc(1rem+env(safe-area-inset-bottom))] right-[calc(1rem+env(safe-area-inset-right))]"
      : position === "top-right"
        ? "top-4 right-4"
        : "bottom-4 left-1/2 -translate-x-1/2";

  return (
    <div
      className={cn(
        "pointer-events-none fixed z-[100] flex w-[min(92vw,360px)] flex-col gap-2",
        pos,
      )}
    >
      {items.map((t) => {
        const Icon = icons[t.tone];
        return (
          <div
            key={t.id}
            className="glass pointer-events-auto flex items-start gap-3 p-3.5"
            style={{ animation: "fade-up 0.18s ease" }}
          >
            <Icon
              className={cn(
                "mt-0.5 size-4 shrink-0",
                t.tone === "signal" && "text-signal",
                t.tone === "vermilion" && "text-vermilion",
                t.tone === "neutral" && "text-ink-soft",
              )}
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-ink">{t.title}</div>
              {t.description && (
                <div className="mt-0.5 text-xs text-ink-soft">
                  {t.description}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => {
                store = store.filter((x) => x.id !== t.id);
                emit();
              }}
              className="text-ink-faint hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
