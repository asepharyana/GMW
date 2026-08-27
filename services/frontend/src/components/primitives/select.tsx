"use client";

import { Check, ChevronDown } from "lucide-react";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";

export interface SelectOption {
  value: string;
  label: string;
  hint?: string;
}

/**
 * Custom select whose dropdown is portalled to `document.body` so it
 * never gets clipped by a parent `overflow-y-auto` or `overflow-hidden`.
 * Position is computed via `getBoundingClientRect()` + fixed positioning.
 */
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
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number }>({
    top: 0,
    left: 0,
    width: 0,
  });

  // Measure trigger to position the portalled dropdown.
  // Clamp horizontally inside the viewport so it never overflows on narrow
  // (mobile) screens — a trigger near the right edge would otherwise render the
  // dropdown partly off-screen and un-clickable.
  const measure = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const w = Math.max(rect.width, 160); // never narrower than a comfortable minimum
    const vw = window.innerWidth;
    const left = Math.min(Math.max(rect.left, 8), vw - w - 8);
    setPos({ top: rect.bottom + 6, left, width: w });
  }, []);

  useLayoutEffect(() => {
    if (open) measure();
  }, [open, measure]);

  // Reposition on scroll / resize while open
  useEffect(() => {
    if (!open) return;
    const onReposition = () => measure();
    window.addEventListener("scroll", onReposition, true);
    window.addEventListener("resize", onReposition);
    return () => {
      window.removeEventListener("scroll", onReposition, true);
      window.removeEventListener("resize", onReposition);
    };
  }, [open, measure]);

  // Close on outside click (covers both trigger and dropdown)
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (triggerRef.current?.contains(t) || dropdownRef.current?.contains(t))
        return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  const selected = options.find((o) => o.value === value);

  return (
    <>
      <div className={cn("relative", className)}>
        <button
          ref={triggerRef}
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={selected?.label ?? placeholder}
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
      </div>

      {open &&
        createPortal(
          <div
            ref={dropdownRef}
            role="listbox"
            className="glass fixed z-[9999] max-h-72 overflow-auto p-1.5"
            style={{
              top: pos.top,
              left: pos.left,
              width: pos.width,
              animation: "fade-up 0.14s ease",
            }}
          >
            {options.length === 0 && (
              <div className="px-3 py-2 text-xs text-ink-faint">No options</div>
            )}
            {options.map((o) => (
              <button
                key={o.value}
                type="button"
                role="option"
                aria-selected={o.value === value}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
                className={cn(
                  "flex w-full min-h-[38px] items-center justify-between gap-2 rounded-[8px] px-3 py-2 text-left text-sm transition-colors sm:min-h-0 sm:py-2",
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
          </div>,
          document.body,
        )}
    </>
  );
}
