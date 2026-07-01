import { motion } from "framer-motion";
import { Lock, RefreshCw, Shield, Unlock, WifiOff } from "lucide-react";
import { useCallback, useState } from "react";
import { login, setSessionToken } from "../../api/client.js";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
} from "../index";

interface AuthOverlayProps {
  onAuthenticated: () => void;
  isPublic: boolean;
  configError?: string | null;
  onRetryConfig?: () => void;
}

export function AuthOverlay({
  onAuthenticated,
  isPublic,
  configError,
  onRetryConfig,
}: AuthOverlayProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [isNetworkError, setIsNetworkError] = useState(false);

  const handleSubmit = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setIsNetworkError(false);
    try {
      const result = await login(password);
      // Store session token (new auth method)
      if (result.token) {
        setSessionToken(result.token);
      }
      // Clean up legacy stored password from localStorage if it was there
      // from a previous session (before JWT migration)
      localStorage.removeItem("admin-password");
      onAuthenticated();
    } catch (err) {
      const isNetwork =
        err instanceof TypeError &&
        (err.message === "Failed to fetch" ||
          err.message.includes("NetworkError") ||
          err.message.includes("network"));
      setIsNetworkError(isNetwork);
      setError(
        isNetwork
          ? "Cannot reach server — check your connection or try again."
          : "Invalid password",
      );
    } finally {
      setLoading(false);
    }
  };

  // ── Retry config fetch (initial loading state) ──────────────────────────────
  const [retryCount, setRetryCount] = useState(0);

  const handleRetry = useCallback(() => {
    setRetryCount((r) => r + 1);
  }, []);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="flex min-h-screen items-center justify-center p-4"
    >
      <Card className="w-full max-w-md border-primary/30 shadow-lg shadow-primary/10">
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              {isPublic ? (
                <Shield className="h-6 w-6" />
              ) : (
                <Lock className="h-6 w-6" />
              )}
            </div>
          </div>
          <CardTitle>
            {isPublic ? "Admin Authentication" : "Admin Access Required"}
          </CardTitle>
          <CardDescription>
            {isPublic
              ? "Enter the admin password to manage settings and perform administrative actions."
              : "Enter the admin password to access the dashboard."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {configError && (
            <div className="mb-4 flex flex-col items-center gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-center">
              <WifiOff className="h-6 w-6 text-amber-500" />
              <p className="text-xs text-amber-600">{configError}</p>
              {onRetryConfig && (
                <Button
                  onClick={onRetryConfig}
                  variant="outline"
                  size="sm"
                  className="gap-2 border-amber-500/30 text-amber-600 hover:bg-amber-500/10"
                >
                  <RefreshCw className="h-3.5 w-3.5" />
                  Retry Connection
                </Button>
              )}
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Input
                type="password"
                placeholder="Enter admin password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoFocus
              />
              {error && (
                <div
                  className={`flex items-start gap-2 rounded-lg p-2 text-xs ${
                    isNetworkError
                      ? "bg-amber-500/10 text-amber-600"
                      : "text-destructive"
                  }`}
                >
                  {isNetworkError ? (
                    <WifiOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  ) : (
                    <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  )}
                  <span>{error}</span>
                </div>
              )}
            </div>
            <Button
              type="submit"
              className="w-full"
              disabled={loading || !password}
            >
              {loading ? "Authenticating..." : "Unlock"}
            </Button>
          </form>

          {isPublic && (
            <p className="mt-4 text-xs text-center text-muted-foreground">
              <Unlock className="inline h-3 w-3 mr-1" />
              The dashboard is in public mode — most data is visible without
              authentication. Admin password is only needed for management
              actions.
            </p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
