// ─── PageHeader.tsx — Standalone header island for non-SPA pages ────────────
// Renders a title on the left and the ThemeToggle on the right.
// Does not depend on wsStatus / voiceStatus / theme context.
// ──────────────────────────────────────────────────────────────────────────────

import ThemeToggle from "./ThemeToggle.js";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
}

export default function PageHeader({ title, subtitle }: PageHeaderProps) {
  return (
    <header className="sticky top-0 z-10 border-b border-border/50 bg-background/70 px-4 py-4 backdrop-blur-sm md:px-8">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <img
            src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/docs/logo.svg"
            alt="IMPHNEN"
            className="h-7 w-7"
          />
          <h1 className="text-xl font-bold tracking-tight">
            <span className="gradient-text">IMPHNEN</span>
            <span className="mx-2 text-muted-foreground">&middot;</span>
            {title}
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {subtitle && (
            <p className="hidden text-sm text-muted-foreground md:block">
              {subtitle}
            </p>
          )}
          <ThemeToggle />
        </div>
      </div>
    </header>
  );
}
