// ─── SettingsForm.tsx — Appearance settings island ─────────────────────────
// Reads/writes theme preference (dark/light/system) to localStorage key
// "bete-dashboard-theme", applies data-theme attribute and .dark class.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useEffect, useState } from "react";

type Theme = "dark" | "light" | "system";

const STORAGE_KEY = "bete-dashboard-theme";

const THEME_OPTIONS: { value: Theme; label: string }[] = [
  { value: "dark", label: "Dark" },
  { value: "light", label: "Light" },
  { value: "system", label: "System" },
];

function getStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "dark" || stored === "light" || stored === "system") {
      return stored;
    }
  } catch {
    // localStorage unavailable
  }
  return "dark";
}

function resolveTheme(theme: Theme): "dark" | "light" {
  if (theme === "system") {
    return window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light";
  }
  return theme;
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  const actual = resolveTheme(theme);
  root.setAttribute("data-theme", actual);
  root.classList.toggle("dark", actual === "dark");
}

function storeTheme(theme: Theme): void {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    // quota exceeded or unavailable
  }
}

export default function SettingsForm() {
  const [theme, setTheme] = useState<Theme>(getStoredTheme);

  useEffect(() => {
    applyTheme(theme);
    storeTheme(theme);
  }, [theme]);

  const handleThemeChange = useCallback((value: Theme) => {
    setTheme(value);
  }, []);

  return (
    <section>
      <h2 className="mb-4 text-lg font-semibold text-foreground">Appearance</h2>
      <p className="mb-4 text-sm text-muted-foreground">
        Choose your preferred color scheme for the dashboard.
      </p>
      <div className="flex gap-2">
        {THEME_OPTIONS.map((option) => (
          <button
            key={option.value}
            type="button"
            className={`btn ${
              theme === option.value ? "btn--primary" : "btn--outline"
            } btn--sm`}
            onClick={() => handleThemeChange(option.value)}
            aria-pressed={theme === option.value}
          >
            {option.label}
          </button>
        ))}
      </div>
    </section>
  );
}
