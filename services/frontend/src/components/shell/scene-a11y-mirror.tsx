"use client";

/**
 * SceneA11yMirror — screen-reader/keyboard mirror of the live constellation.
 * The canvas itself is decorative (aria-hidden); this list exposes every
 * node as a real link/button so keyboard and AT users get the same graph.
 */
import { usePathname } from "next/navigation";
import { useSceneGraph } from "@/components/shell/scene-graph-context";

export function SceneA11yMirror() {
  const pathname = usePathname() ?? "/";
  const { state, setFocus } = useSceneGraph();
  const nodes = state?.graph.nodes ?? [];

  return (
    <nav
      aria-label={`${pathname} constellation map`}
      className="sr-only focus-within:not-sr-only focus-within:absolute focus-within:left-5 focus-within:top-16 focus-within:z-40 focus-within:max-w-sm focus-within:rounded-2xl focus-within:border focus-within:border-[var(--color-hairline)] focus-within:bg-[var(--color-canvas-2)]/95 focus-within:p-3 focus-within:backdrop-blur-xl"
    >
      <p className="mb-1 font-mono text-xs text-[var(--color-ink-faint)]">
        constellation — {nodes.length} node
      </p>
      <ul className="space-y-1">
        {nodes.map((n) => (
          <li key={n.id}>
            {n.href ? (
              <a
                href={n.href}
                className="rounded-lg px-2 py-1 font-mono text-sm text-[var(--color-ink)] outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                {n.label} ({n.kind})
              </a>
            ) : (
              <button
                type="button"
                onClick={() =>
                  setFocus((prev) => (prev === n.id ? null : n.id))
                }
                className="w-full rounded-lg px-2 py-1 text-left font-mono text-sm text-[var(--color-ink)] outline-none hover:bg-white/5 focus-visible:ring-2 focus-visible:ring-[var(--color-ring)]"
              >
                {n.label} ({n.kind})
              </button>
            )}
          </li>
        ))}
        {nodes.length === 0 ? (
          <li className="px-2 py-1 font-mono text-sm text-[var(--color-ink-faint)]">
            tidak ada node aktif
          </li>
        ) : null}
      </ul>
    </nav>
  );
}
