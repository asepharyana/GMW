/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Poppins", "ui-sans-serif", "system-ui", "-apple-system", "sans-serif"],
      },
      colors: {
        border: "oklch(var(--border))",
        input: "oklch(var(--input))",
        ring: "oklch(var(--ring))",
        background: "oklch(var(--background))",
        foreground: "oklch(var(--foreground))",
        "primary-soft": "oklch(var(--primary-soft))",
        "primary-glow": "oklch(var(--primary-glow))",
        "accent-glow": "oklch(var(--accent-glow))",
        primary: { DEFAULT: "oklch(var(--primary))", foreground: "oklch(var(--primary-foreground))" },
        secondary: { DEFAULT: "oklch(var(--secondary))", foreground: "oklch(var(--secondary-foreground))" },
        muted: { DEFAULT: "oklch(var(--muted))", foreground: "oklch(var(--muted-foreground))" },
        accent: { DEFAULT: "oklch(var(--accent))", foreground: "oklch(var(--accent-foreground))" },
        destructive: { DEFAULT: "oklch(var(--destructive))", foreground: "oklch(var(--destructive-foreground))" },
        card: { DEFAULT: "oklch(var(--card))", foreground: "oklch(var(--card-foreground))" },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "bar-pulse": "bar-pulse 0.4s ease-in-out infinite",
        "fade-in-up": "fadeInUp 0.5s ease-out",
        "fade-in": "fadeIn 0.3s ease-out",
        "glow-pulse": "glowPulse 3s ease-in-out infinite",
      },
      keyframes: {
        "bar-pulse": {
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
        glowPulse: {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "0.8" },
        },
      },
    },
  },
  plugins: [],
};
