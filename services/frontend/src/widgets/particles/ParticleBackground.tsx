import { useEffect, useState } from "react";

export function ParticleBackground() {
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  if (reducedMotion) return null;

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: -1 }}
    >
      {/* Top-right glow orb */}
      <div className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full bg-primary/10 blur-3xl animate-glow-pulse" />
      {/* Bottom-left glow orb */}
      <div
        className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full bg-blue-400/10 blur-3xl animate-glow-pulse"
        style={{ animationDelay: "1.5s" }}
      />
    </div>
  );
}
