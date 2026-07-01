// ─── AuthGuard.client.tsx — Astro React island for login page ──────────────
// Thin wrapper around AuthOverlay that redirects to the main app on success.
// Loaded via client:load on the login page.
// ────────────────────────────────────────────────────────────────────────────

import { useCallback } from "react";
import { AuthOverlay } from "./index";

interface AuthGuardProps {
  redirectTo?: string;
}

export default function AuthGuard({ redirectTo = "/live" }: AuthGuardProps) {
  const handleAuthenticated = useCallback(() => {
    window.location.href = redirectTo;
  }, [redirectTo]);

  return <AuthOverlay isPublic={false} onAuthenticated={handleAuthenticated} />;
}
