"use client";

import { Check, ChevronDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

export function Select({
  value,
  onChange,
  options,
  placeholder = "Select…",
  className,
  size = "md",
}: {
  value: string | null;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  className?: string;
  size?: "sm" | "md";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "flex w-full items-center justify-between gap-2 rounded-[8px] border border-hairline bg-surface-2 text-left text-ink transition-colors hover:border-signal/40",
          "focus:outline-none focus:border-signal/60",
          size === "sm" ? "h-9 px-3 text-xs" : "h-10 px-3.5 text-sm",
        )}
      >
        <span className={cn("truncate", !selected && "text-ink-faint")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={cn(
            "size-4 shrink-0 text-ink-faint transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          className="glass absolute z-50 mt-1.5 max-h-72 w-full overflow-auto p-1.5"
          style={{ animation: "fade-up 0.14s ease" }}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-xs text-ink-faint">No options</div>
          )}
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => {
                onChange(o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-sm transition-colors",
                o.value === value
                  ? "bg-signal/15 text-signal"
                  : "text-ink hover:bg-surface",
              )}
            >
              <span className="truncate">{o.label}</span>
              {o.hint && (
                <span className="mono text-[0.65rem] text-ink-faint">
                  {o.hint}
                </span>
              )}
              {o.value === value && <Check className="size-3.5 shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
