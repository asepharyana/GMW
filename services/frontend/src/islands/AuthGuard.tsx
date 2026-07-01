// ─── AuthGuard.tsx — Standalone authentication island ────────────────────────
// Three-state auth wrapper: null=loading, false=unauthenticated (login form),
// true=authenticated (renders children).
// ─────────────────────────────────────────────────────────────────────────────

import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import {
  getAdminPassword,
  getSessionToken,
  setAdminPassword,
} from "../shared/api/client.js";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "../shared/components/index.js";

interface AuthGuardProps {
  children: ReactNode;
}

export default function AuthGuard({ children }: AuthGuardProps) {
  const [authState, setAuthState] = useState<boolean | null>(null);
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  // On mount: check for existing session token or legacy admin password
  useEffect(() => {
    const token = getSessionToken();
    const storedPassword = getAdminPassword();
    setAuthState(token || storedPassword ? true : false);
  }, []);

  const handleLogin = useCallback(
    (e: FormEvent) => {
      e.preventDefault();
      if (!password) return;
      setError(null);
      // Store the password to localStorage; actual validation happens
      // when child components call the API (gets 401 on invalid creds).
      setAdminPassword(password);
      setAuthState(true);
    },
    [password],
  );

  // ── Loading state ──────────────────────────────────────────────────────────
  if (authState === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex flex-col items-center gap-4">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  // ── Unauthenticated — show login form ──────────────────────────────────────
  if (authState === false) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md border-primary/30 shadow-lg shadow-primary/10">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex items-center justify-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <svg
                  className="h-6 w-6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={2}
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                  />
                </svg>
              </div>
            </div>
            <CardTitle>Access Required</CardTitle>
            <CardDescription>
              Enter the admin password to access the dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <div className="space-y-1">
                  <Input
                    type="password"
                    placeholder="Enter admin password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                  />
                  {error && <p className="text-xs text-destructive">{error}</p>}
                </div>
              </div>
              <Button type="submit" className="w-full" disabled={!password}>
                Unlock
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  // ── Authenticated — render children ────────────────────────────────────────
  return <>{children}</>;
}
