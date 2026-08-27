"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isActivePath, navItems } from "@/lib/navigation";
import { cn } from "@/lib/utils";

function NavItem({
  href,
  label,
  active,
  Icon,
}: {
  href: string;
  label: string;
  active: boolean;
  Icon: React.ComponentType<React.SVGProps<SVGSVGElement>>;
}) {
  const itemRef = useRef<HTMLAnchorElement>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number } | null>(
    null,
  );
  const [hovering, setHovering] = useState(false);

  // Measure the item and position the tooltip via a Portal on document.body
  // so it always paints above the main content (which has its own stacking
  // contexts from backdrop-blur panels).
  const showTooltip = () => {
    const el = itemRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    setTipPos({ top: rect.top + rect.height / 2, left: rect.right + 10 });
    setHovering(true);
  };
  const hideTooltip = () => {
    setHovering(false);
    setTipPos(null);
  };

  return (
    <a
      ref={itemRef}
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onMouseEnter={showTooltip}
      onMouseLeave={hideTooltip}
      onFocus={showTooltip}
      onBlur={hideTooltip}
      className={cn(
        "nav-dock-item group relative flex size-9 items-center justify-center rounded-[8px] transition-all duration-150",
        active
          ? "is-active bg-signal/15 text-signal font-semibold shadow-xs border border-signal/30"
          : "text-ink-muted hover:bg-surface-2 hover:text-ink",
      )}
    >
      <Icon className="relative z-10 size-4" strokeWidth={active ? 2.2 : 1.8} />
      {active && (
        <span className="absolute -left-[5px] h-3.5 w-[2px] rounded-full bg-signal shadow-[0_0_8px_var(--color-signal-glow)]" />
      )}

      {/* Tooltip — portalled to body so it never hides behind content */}
      {hovering &&
        tipPos &&
        typeof document !== "undefined" &&
        createPortal(
          <span
            role="tooltip"
            className="pointer-events-none fixed z-[9999] translate-y-[-50%] whitespace-nowrap rounded-md border border-hairline bg-surface px-2.5 py-1 font-sans text-[11px] font-medium tracking-tight text-ink shadow-xl backdrop-blur-md"
            style={{
              top: tipPos.top,
              left: tipPos.left,
              animation: "fade-up 0.12s ease",
            }}
          >
            {label}
          </span>,
          document.body,
        )}
    </a>
  );
}

export function NavRail() {
  const pathname = usePathname();
  const path = pathname ?? "/";
  const railRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const rail = railRef.current;
    if (!rail) return;
    const items = rail.querySelectorAll<HTMLElement>(".nav-dock-item");
    if (items.length === 0) return;

    items.forEach((el, i) => {
      el.style.opacity = "0";
      el.style.animationFillMode = "forwards";
      el.style.animationTimingFunction = "ease-out";
      el.style.animationName = "stagger-slide-in";
      el.style.animationDuration = "0.3s";
      el.style.animationDelay = `${i * 0.025}s`;
    });

    return () => {
      items.forEach((el) => {
        el.style.removeProperty("opacity");
        el.style.removeProperty("animation-name");
        el.style.removeProperty("animation-duration");
        el.style.removeProperty("animation-delay");
        el.style.removeProperty("animation-fill-mode");
        el.style.removeProperty("animation-timing-function");
      });
    };
  }, []);

  return (
    <nav
      ref={railRef}
      className="glass mb-[calc(0.75rem+env(safe-area-inset-bottom))] ml-[calc(0.75rem+env(safe-area-inset-left))] mt-[calc(0.75rem+env(safe-area-inset-top))] hidden w-[54px] flex-col items-center gap-1 py-3 md:flex"
    >
      <div className="flex flex-1 flex-col gap-1">
        {navItems.map((item) => (
          <NavItem
            key={item.href}
            href={item.href}
            label={item.label}
            active={isActivePath(path, item.matchPrefix)}
            Icon={item.icon}
          />
        ))}
      </div>
    </nav>
  );
}
