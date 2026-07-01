import { motion } from "framer-motion";
import {
  Eye,
  EyeOff,
  Globe,
  Lock,
  RefreshCw,
  Save,
  Settings,
  Shield,
} from "lucide-react";
import { useEffect, useState } from "react";
import type { AdminSettings } from "../../shared/api/client";
import {
  getAdminSettings,
  updateAdminSettings,
  clearSessionToken,
  logout,
} from "../../shared/api/client";
import { cardItem, cardStagger } from "../../shared/hooks/useFramerStagger";
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../shared/ui";

export function AdminPanel() {
  const [settings, setSettings] = useState<AdminSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogout = async () => {
    // Call server-side logout to increment token version
    try {
      await logout();
    } catch {
      // Even if server call fails, still clear local state for security
    }
    // Clear local token and legacy password
    clearSessionToken();
    localStorage.removeItem("admin-password");
    window.location.reload();
  };

  const fetchSettings = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getAdminSettings();
      setSettings(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleTogglePublic = async () => {
    if (!settings) return;
    const newValue = !settings.dashboardIsPublic;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const updated = await updateAdminSettings({
        dashboardIsPublic: newValue,
      });
      setSettings(updated);
      setSuccess(
        newValue
          ? "Dashboard is now public — accessible without password."
          : "Dashboard is now private — admin password required.",
      );
      setTimeout(() => setSuccess(null), 4000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update settings");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-primary">Admin Settings</CardTitle>
          <CardDescription>Loading settings...</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center py-8">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error && !settings) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-primary">Admin Settings</CardTitle>
          <CardDescription className="text-destructive">{error}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button onClick={fetchSettings} variant="outline" size="sm">
            <RefreshCw className="mr-2 h-4 w-4" /> Retry
          </Button>
        </CardContent>
      </Card>
    );
  }

  const isPublic = settings?.dashboardIsPublic ?? false;

  return (
    <motion.div variants={cardStagger} initial="initial" animate="animate">
      <motion.div variants={cardItem}>
        <Card className="border-primary/20">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-primary">
                  <Settings className="h-5 w-5" />
                  Admin Settings
                </CardTitle>
                <CardDescription>
                  Manage dashboard visibility and runtime configuration.
                </CardDescription>
              </div>
              <Button
                onClick={fetchSettings}
                variant="ghost"
                size="sm"
                disabled={loading}
              >
                <RefreshCw
                  className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
                />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* ── Success / Error messages ── */}
            {success && (
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-600 dark:text-emerald-400">
                {success}
              </div>
            )}
            {error && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                {error}
              </div>
            )}

            {/* ── Dashboard Visibility ── */}
            <div className="rounded-xl border border-border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    {isPublic ? (
                      <Globe className="h-4 w-4 text-emerald-500" />
                    ) : (
                      <Lock className="h-4 w-4 text-amber-500" />
                    )}
                    <h3 className="font-semibold">
                      Dashboard Visibility:{" "}
                      <span
                        className={
                          isPublic ? "text-emerald-500" : "text-amber-500"
                        }
                      >
                        {isPublic ? "Public" : "Private"}
                      </span>
                    </h3>
                  </div>
                  <p className="text-sm text-muted-foreground">
                    {isPublic
                      ? "Anyone can view the dashboard without a password. Admin password is still required for management actions."
                      : "Admin password is required to access any part of the dashboard."}
                  </p>
                </div>
                <Button
                  onClick={handleTogglePublic}
                  disabled={saving}
                  variant={isPublic ? "outline" : "default"}
                  size="sm"
                  className="shrink-0"
                >
                  {saving ? (
                    <>
                      <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                      Saving...
                    </>
                  ) : isPublic ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Make Private
                    </>
                  ) : (
                    <>
                      <Eye className="mr-2 h-4 w-4" />
                      Make Public
                    </>
                  )}
                </Button>
              </div>

              {/* ── Status indicators ── */}
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">Runtime</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        isPublic ? "bg-emerald-400" : "bg-amber-400"
                      }`}
                    />
                    <span className="text-sm font-medium">
                      {isPublic ? "Public" : "Private"}
                    </span>
                  </div>
                </div>
                <div className="rounded-lg bg-muted/50 px-3 py-2">
                  <p className="text-xs text-muted-foreground">
                    Env Default
                  </p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <span
                      className={`inline-block h-2 w-2 rounded-full ${
                        settings?.envDashboardIsPublic
                          ? "bg-emerald-400"
                          : "bg-amber-400"
                      }`}
                    />
                    <span className="text-sm font-medium">
                      {settings?.envDashboardIsPublic ? "Public" : "Private"}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* ── Logout ── */}
            <div className="flex justify-end">
              <Button
                onClick={handleLogout}
                variant="outline"
                size="sm"
                className="text-muted-foreground"
              >
                <Lock className="mr-2 h-4 w-4" />
                Logout
              </Button>
            </div>

            {/* ── Info card ── */}
            <div className="rounded-xl border border-border/50 bg-muted/30 p-4">
              <div className="flex items-start gap-3">
                <Shield className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="space-y-1 text-xs text-muted-foreground">
                  <p>
                    <strong>Admin password</strong> is configured via the
                    <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      ADMIN_PASSWORD
                    </code>
                    environment variable. For security, it cannot be changed
                    through this panel — update it in your deployment
                    configuration and restart the service.
                  </p>
                  <p className="mt-2">
                    Runtime settings are persisted across restarts in the
                    <code className="mx-1 rounded bg-muted px-1 py-0.5 font-mono text-[10px]">
                      data/settings.json
                    </code>
                    file. Changes take effect immediately, no restart needed.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
