import { motion } from "framer-motion";
import {
  Bell,
  BellOff,
  Moon,
  Palette,
  Sun,
  Monitor,
  Settings,
  Shield,
  Globe,
  Lock,
  Volume2,
  VolumeX,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { ThemeMode } from "../../hooks/useTheme";
import { cardItem, cardStagger } from "../../shared/hooks/useFramerStagger";
import { Card, CardContent, CardHeader, CardTitle, Button } from "../../shared/ui";
import {
  getAdminSettings,
  updateAdminSettings,
  clearSessionToken,
} from "../../shared/api/client";
import type { AdminSettings as AdminSettingsType } from "../../entities/ui/types";

/* ─── Storage keys ─────────────────────────────────────────────────────── */

const NOTIF_ENABLED_KEY = "bete-notif-enabled";
const NOTIF_SOUND_KEY = "bete-notif-sound";

/* ─── Types ────────────────────────────────────────────────────────────── */

interface NotificationPrefs {
  enabled: boolean;
  sound: boolean;
}

function loadNotifPrefs(): NotificationPrefs {
  try {
    const raw = localStorage.getItem(NOTIF_ENABLED_KEY);
    const soundRaw = localStorage.getItem(NOTIF_SOUND_KEY);
    return {
      enabled: raw !== "false", // default true
      sound: soundRaw !== "false", // default true
    };
  } catch {
    return { enabled: true, sound: true };
  }
}

/* ─── Props ────────────────────────────────────────────────────────────── */

interface SettingsPanelProps {
  themeMode: ThemeMode;
  isDark: boolean;
  onThemeModeChange: (mode: ThemeMode) => void;
}

/* ─── Component ────────────────────────────────────────────────────────── */

export function SettingsPanel({
  themeMode,
  isDark,
  onThemeModeChange,
}: SettingsPanelProps) {
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(loadNotifPrefs);
  const [adminSettings, setAdminSettings] = useState<AdminSettingsType | null>(null);
  const [adminSaving, setAdminSaving] = useState(false);
  const [adminError, setAdminError] = useState<string | null>(null);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);
  const adminSuccessTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load admin settings on mount
  useEffect(() => {
    getAdminSettings()
      .then(setAdminSettings)
      .catch(() => {
        // Not authenticated — ignore
      });
  }, []);

  const handleTogglePublic = async () => {
    if (!adminSettings) return;
    const newValue = !adminSettings.dashboardIsPublic;
    setAdminSaving(true);
    setAdminError(null);
    setAdminSuccess(null);
    // Clear any existing auto-clear timer
    if (adminSuccessTimerRef.current) {
      clearTimeout(adminSuccessTimerRef.current);
    }
    try {
      const updated = await updateAdminSettings({ dashboardIsPublic: newValue });
      setAdminSettings(updated);
      setAdminSuccess(
        newValue
          ? "Dashboard is now public — accessible without password."
          : "Dashboard is now private — admin password required.",
      );
      // Auto-clear success message after 4s
      adminSuccessTimerRef.current = setTimeout(() => setAdminSuccess(null), 4000);
    } catch (err) {
      setAdminError(err instanceof Error ? err.message : "Failed to update");
    } finally {
      setAdminSaving(false);
    }
  };

  const handleLogout = () => {
    clearSessionToken();
    window.location.reload();
  };

  const updateNotif = useCallback(
    (patch: Partial<NotificationPrefs>) => {
      setNotifPrefs((prev) => {
        const next = { ...prev, ...patch };
        try {
          localStorage.setItem(NOTIF_ENABLED_KEY, String(next.enabled));
          localStorage.setItem(NOTIF_SOUND_KEY, String(next.sound));
        } catch {
          /* quota */
        }
        // Dispatch event so other components can react
        window.dispatchEvent(
          new CustomEvent("notif_prefs_changed", { detail: next }),
        );
        return next;
      });
    },
    [],
  );

  const themeOptions: Array<{
    value: ThemeMode;
    label: string;
    icon: typeof Sun;
    desc: string;
  }> = [
    {
      value: "light",
      label: "Light",
      icon: Sun,
      desc: "Always use light theme",
    },
    {
      value: "dark",
      label: "Dark",
      icon: Moon,
      desc: "Always use dark theme",
    },
    {
      value: "system",
      label: "System",
      icon: Monitor,
      desc: "Follow system preference",
    },
  ];

  return (
    <motion.div
      className="mx-auto max-w-2xl space-y-6"
      variants={cardStagger}
      initial="initial"
      animate="animate"
    >
      {/* ── Theme section ────────────────────────────────────────────── */}
      <motion.div variants={cardItem}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Palette className="h-5 w-5" />
              Theme
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              {themeOptions.map((opt) => {
                const Icon = opt.icon;
                const isActive = themeMode === opt.value;
                return (
                  <button
                    key={opt.value}
                    onClick={() => onThemeModeChange(opt.value)}
                    className={`
                      flex flex-col items-center gap-2 rounded-xl border-2 p-4 text-center transition-all
                      ${
                        isActive
                          ? "border-primary bg-primary/5 text-primary"
                          : "border-border text-muted-foreground hover:border-primary/40 hover:text-foreground"
                      }
                    `}
                  >
                    <Icon
                      className={`h-6 w-6 ${
                        opt.value === "dark" && !isActive
                          ? "text-indigo-400"
                          : opt.value === "light" && !isActive
                            ? "text-amber-500"
                            : ""
                      }`}
                    />
                    <span className="text-sm font-semibold">{opt.label}</span>
                    <span className="text-xs">{opt.desc}</span>
                    {isActive && (
                      <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                    )}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Current: <span className="font-medium text-foreground capitalize">{isDark ? "Dark" : "Light"}</span>
              {themeMode === "system" && " (follows system)"}
            </p>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Notifications section ────────────────────────────────────── */}
      <motion.div variants={cardItem}>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Bell className="h-5 w-5" />
              Notifications
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Toggle — enable/disable all notifs */}
            <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-3">
                {notifPrefs.enabled ? (
                  <Bell className="h-5 w-5 text-primary" />
                ) : (
                  <BellOff className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Moderation alerts
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Show toast when a message is flagged by AI
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={notifPrefs.enabled}
                onClick={() => updateNotif({ enabled: !notifPrefs.enabled })}
                className={`
                  relative h-6 w-11 rounded-full transition-colors
                  ${notifPrefs.enabled ? "bg-primary" : "bg-muted"}
                `}
              >
                <span
                  className={`
                    absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white dark:bg-gray-800 shadow-sm transition-transform
                    ${notifPrefs.enabled ? "translate-x-5" : "translate-x-0"}
                  `}
                />
              </button>
            </label>

            {/* Toggle — sound */}
            <label className="flex items-center justify-between rounded-lg border border-border p-3 cursor-pointer hover:bg-accent/50 transition-colors">
              <div className="flex items-center gap-3">
                {notifPrefs.sound ? (
                  <Volume2 className="h-5 w-5 text-primary" />
                ) : (
                  <VolumeX className="h-5 w-5 text-muted-foreground" />
                )}
                <div>
                  <p className="text-sm font-medium text-foreground">
                    Sound effects
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Play a sound when new moderation alerts arrive
                  </p>
                </div>
              </div>
              <button
                role="switch"
                aria-checked={notifPrefs.sound}
                onClick={() => updateNotif({ sound: !notifPrefs.sound })}
                className={`
                  relative h-6 w-11 rounded-full transition-colors
                  ${notifPrefs.sound ? "bg-primary" : "bg-muted"}
                `}
              >
                <span
                  className={`
                    absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white dark:bg-gray-800 shadow-sm transition-transform
                    ${notifPrefs.sound ? "translate-x-5" : "translate-x-0"}
                  `}
                />
              </button>
            </label>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── Admin section ────────────────────────────────────────────── */}
      <motion.div variants={cardItem}>
        <Card className="border-primary/20">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Settings className="h-5 w-5" />
              Admin Settings
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Dashboard visibility toggle */}
            <div className="rounded-lg border border-border p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  {adminSettings?.dashboardIsPublic ? (
                    <Globe className="mt-0.5 h-5 w-5 text-emerald-500 dark:text-emerald-400 shrink-0" />
                  ) : (
                    <Lock className="mt-0.5 h-5 w-5 text-amber-500 dark:text-amber-400 shrink-0" />
                  )}
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      Dashboard Visibility:{" "}
                      <span className={adminSettings?.dashboardIsPublic ? "text-emerald-500 dark:text-emerald-400" : "text-amber-500 dark:text-amber-400"}>
                        {adminSettings?.dashboardIsPublic ? "Public" : "Private"}
                      </span>
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {adminSettings?.dashboardIsPublic
                        ? "Anyone can view the dashboard. Admin password still required for management."
                        : "Admin password required to access the dashboard."}
                    </p>
                  </div>
                </div>
                <Button
                  onClick={handleTogglePublic}
                  disabled={adminSaving}
                  variant={adminSettings?.dashboardIsPublic ? "outline" : "default"}
                  size="sm"
                  className="shrink-0"
                >
                  {adminSaving ? (
                    <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                  ) : adminSettings?.dashboardIsPublic ? (
                    "Make Private"
                  ) : (
                    "Make Public"
                  )}
                </Button>
              </div>
              {adminError && (
                <p className="mt-2 text-xs text-destructive">{adminError}</p>
              )}
              {adminSuccess && (
                <p className="mt-2 text-xs text-emerald-500 dark:text-emerald-400">{adminSuccess}</p>
              )}
            </div>

            {/* Status indicators */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Runtime</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${adminSettings?.dashboardIsPublic ? "bg-emerald-400 dark:bg-emerald-500" : "bg-amber-400 dark:bg-amber-500"}`} />
                  <span className="text-sm font-medium">{adminSettings?.dashboardIsPublic ? "Public" : "Private"}</span>
                </div>
              </div>
              <div className="rounded-lg bg-muted/50 px-3 py-2">
                <p className="text-xs text-muted-foreground">Env Default</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-block h-2 w-2 rounded-full ${adminSettings?.envDashboardIsPublic ? "bg-emerald-400 dark:bg-emerald-500" : "bg-amber-400 dark:bg-amber-500"}`} />
                  <span className="text-sm font-medium">{adminSettings?.envDashboardIsPublic ? "Public" : "Private"}</span>
                </div>
              </div>
            </div>

            {/* Logout */}
            <div className="flex justify-end border-t border-border pt-4">
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

            {/* Info */}
            <div className="rounded-lg bg-muted/30 px-3 py-2">
              <div className="flex items-start gap-2">
                <Shield className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <p className="text-xs text-muted-foreground">
                  Admin password is set via the <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">ADMIN_PASSWORD</code> env var.
                  Runtime settings are persisted in <code className="rounded bg-muted px-1 py-0.5 font-mono text-[10px]">data/settings.json</code>.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* ── About section ────────────────────────────────────────────── */}
      <motion.div variants={cardItem}>
        <Card>
          <CardHeader>
            <CardTitle className="text-muted-foreground">About</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Bete Dashboard v1.0 — Discord AI Moderation & Voice Recording
              System.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Theme settings are saved locally. Notification preferences are
              persisted across sessions.
            </p>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}
