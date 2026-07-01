/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN Particle Background — Glow orbs yang subtle
 * Menggunakan primary (#23a1eb) dan tertiary (#5865f2) glow.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { useEffect, useState } from "react";

export function ParticleBackground() {
  const [reducedMotion, setReducedMotion] = useState(true);
  const [isMobile, setIsMobile] = useState(true);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const mqReduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mqReduced.matches);
    const mqMobile = window.matchMedia("(max-width: 768px)");
    setIsMobile(mqMobile.matches);
    const handleReduced = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    const handleMobile = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mqReduced.addEventListener("change", handleReduced);
    mqMobile.addEventListener("change", handleMobile);
    requestAnimationFrame(() => setShouldRender(true));
    return () => {
      mqReduced.removeEventListener("change", handleReduced);
      mqMobile.removeEventListener("change", handleMobile);
    };
  }, []);

  if (reducedMotion || isMobile || !shouldRender) return null;

  const root = getComputedStyle(document.documentElement);
  const primaryColor = root.getPropertyValue("--primary").trim() || "#23a1eb";
  const tertiaryColor = root.getPropertyValue("--tertiary").trim() || "#5865f2";
  const secondaryColor = root.getPropertyValue("--secondary").trim() || "#1877f2";

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden"
      aria-hidden="true"
      style={{ zIndex: -1 }}
    >
      {/* Top-right glow — IMPHNEN Primary #23a1eb */}
      <div
        className="absolute -top-40 -right-40 h-[500px] w-[500px] rounded-full blur-3xl animate-glow-pulse"
        style={{
          backgroundColor: `${primaryColor}14`,
        }}
      />

      {/* Bottom-left glow — Discord Tertiary #5865f2 */}
      <div
        className="absolute -bottom-40 -left-40 h-[400px] w-[400px] rounded-full blur-3xl"
        style={{
          backgroundColor: `${tertiaryColor}0f`,
          animation: "glowPulse 3s ease-in-out infinite",
          animationDelay: "1.5s",
        }}
      />

      {/* Center-subtle glow — Secondary #1877f2 */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 h-[600px] w-[600px] rounded-full blur-3xl"
        style={{
          backgroundColor: `${secondaryColor}08`,
        }}
      />
    </div>
  );
}
