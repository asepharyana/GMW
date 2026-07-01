/** ═══════════════════════════════════════════════════════════════════════
 *  IMPHNEN Design System — Tailwind Configuration
 *  Approachable Modernism untuk komunitas programmer Indonesia 🇮🇩
 *  ═══════════════════════════════════════════════════════════════════════ */

/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      /* ─── Typography — Poppins Monofamily ─────────────────────────── */
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        display: ["Poppins", "sans-serif"],
      },
      fontSize: {
        display: ["60px", { lineHeight: "68px", fontWeight: "700", letterSpacing: "-0.04em" }],
        "headline-lg": ["40px", { lineHeight: "48px", fontWeight: "600", letterSpacing: "-0.02em" }],
        "headline-md": ["28px", { lineHeight: "36px", fontWeight: "600", letterSpacing: "-0.01em" }],
        "title-lg": ["20px", { lineHeight: "28px", fontWeight: "600" }],
        "body-lg": ["18px", { lineHeight: "28px", fontWeight: "400", letterSpacing: "0.01em" }],
        "body-md": ["16px", { lineHeight: "24px", fontWeight: "400", letterSpacing: "0.01em" }],
        "label-md": ["14px", { lineHeight: "20px", fontWeight: "600", letterSpacing: "0.02em" }],
        "label-sm": ["12px", { lineHeight: "16px", fontWeight: "500", letterSpacing: "0.03em" }],
      },

      /* ─── Brand Colors — IMPHNEN Signature ────────────────────────── */
      colors: {
        /* Surface */
        background: "#ffffff",
        foreground: "#1a1a1a",
        muted: {
          DEFAULT: "#f5f5f5",
          foreground: "#666666",
        },
        accent: {
          DEFAULT: "#f0f0f0",
          foreground: "#1a1a1a",
        },
        card: {
          DEFAULT: "#ffffff",
          foreground: "#1a1a1a",
        },
        popover: {
          DEFAULT: "#ffffff",
          foreground: "#1a1a1a",
        },

        /* Primary — #23a1eb */
        primary: {
          DEFAULT: "#23a1eb",
          foreground: "#ffffff",
          soft: "#e1f0fd",
          hover: "#1a8fd9",
          active: "#0877c1",
        },

        /* Secondary — #1877f2 (Facebook) */
        secondary: {
          DEFAULT: "#1877f2",
          foreground: "#ffffff",
          soft: "#e7f1ff",
        },

        /* Tertiary — #5865f2 (Discord) */
        tertiary: {
          DEFAULT: "#5865f2",
          foreground: "#ffffff",
          soft: "#eef0ff",
        },

        /* Semantic */
        success: {
          DEFAULT: "#22c55e",
          soft: "#dcfce7",
        },
        warning: {
          DEFAULT: "#f59e0b",
          soft: "#fef3c7",
        },
        destructive: {
          DEFAULT: "#e4405f",
          foreground: "#ffffff",
          soft: "#ffebee",
        },
        info: {
          DEFAULT: "#3b82f6",
          soft: "#dbeafe",
        },

        /* Border & Ring */
        border: "#e0e0e0",
        input: "#e0e0e0",
        ring: "#23a1eb",
      },

      /* ─── Border Radius — Friendly Geometry ───────────────────────── */
      borderRadius: {
        sm: "0.25rem",
        DEFAULT: "0.5rem",
        md: "0.75rem",
        lg: "1rem",
        xl: "1.5rem",
        full: "9999px",
      },

      /* ─── Box Shadow — Subtle Elevation ───────────────────────────── */
      boxShadow: {
        sm: "0 1px 2px rgba(0, 0, 0, 0.06)",
        DEFAULT: "0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04)",
        md: "0 4px 12px rgba(0, 0, 0, 0.08)",
        lg: "0 16px 40px rgba(0, 0, 0, 0.12)",
        glow: "0 0 0 3px rgba(35, 161, 235, 0.15)",
      },

      /* ─── Spacing — Rhythm System ────────────────────────────────── */
      spacing: {
        xs: "4px",
        sm: "12px",
        md: "24px",
        lg: "40px",
        xl: "64px",
        gutter: "24px",
      },
      maxWidth: {
        container: "1280px",
      },

      /* ─── Transition Timing ───────────────────────────────────────── */
      transitionDuration: {
        fast: "150ms",
        base: "200ms",
        slow: "300ms",
      },
      transitionTimingFunction: {
        snappy: "cubic-bezier(0.4, 0, 0.2, 1)",
      },

      /* ─── Animations — Signature IMPHNEN ──────────────────────────── */
      animation: {
        "bar-pulse": "barPulse 0.4s ease-in-out infinite",
        "fade-in-up": "fadeInUp 0.5s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "scale-in": "scaleIn 0.3s ease-out",
        "slide-in-right": "slideInRight 0.3s ease-out",
        "shimmer": "shimmer 1.5s ease-in-out infinite",
        "notification-pulse": "notificationPulse 2s ease-in-out infinite",
        "mascot-wiggle": "mascotWiggle 0.6s ease-in-out",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
      },

      keyframes: {
        barPulse: {
          "0%, 100%": { transform: "scaleY(0.8)" },
          "50%": { transform: "scaleY(1.2)" },
        },
        fadeInUp: {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        scaleIn: {
          "0%": { opacity: "0", transform: "scale(0.95)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        slideInRight: {
          "0%": { opacity: "0", transform: "translateX(20px)" },
          "100%": { opacity: "1", transform: "translateX(0)" },
        },
        notificationPulse: {
          "0%": { boxShadow: "0 0 0 0 rgba(35, 161, 235, 0.4)" },
          "70%": { boxShadow: "0 0 0 8px transparent" },
          "100%": { boxShadow: "0 0 0 0 transparent" },
        },
        mascotWiggle: {
          "0%, 100%": { transform: "rotate(0deg)" },
          "15%": { transform: "rotate(-8deg)" },
          "30%": { transform: "rotate(6deg)" },
          "45%": { transform: "rotate(-4deg)" },
          "60%": { transform: "rotate(2deg)" },
        },
      },
    },
  },
  plugins: [],
};
