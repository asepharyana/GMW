/**
 * Runtime configuration manager.
 *
 * Stores settings that can change at runtime (e.g., DASHBOARD_IS_PUBLIC)
 * in a JSON file. Falls back to env-based defaults from the static config.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { createChildLogger } from "@bete/shared/logger";
import type { config } from "./index.js";
type Config = typeof config;

const logger = createChildLogger("runtime-config");

const DATA_DIR = resolve(import.meta.dirname ?? process.cwd(), "..", "data");
const SETTINGS_FILE = resolve(DATA_DIR, "settings.json");

interface RuntimeSettings {
  dashboardIsPublic: boolean;
}

/** Nilai fallback dari env. Dipakai saat settings.json belum pernah dibuat. */
function envDefaultSettings(): RuntimeSettings {
  return {
    dashboardIsPublic: process.env.DASHBOARD_IS_PUBLIC === "true",
  };
}

function ensureDataDir(): void {
  if (!existsSync(DATA_DIR)) {
    mkdirSync(DATA_DIR, { recursive: true });
  }
}

function loadSettings(): RuntimeSettings {
  try {
    ensureDataDir();
    const fallback = envDefaultSettings();
    if (!existsSync(SETTINGS_FILE)) {
      writeFileSync(SETTINGS_FILE, JSON.stringify(fallback, null, 2));
      return { ...fallback };
    }
    const raw = readFileSync(SETTINGS_FILE, "utf-8");
    const parsed = JSON.parse(raw) as Partial<RuntimeSettings>;
    return { ...fallback, ...parsed };
  } catch (err) {
    logger.error({ err }, "Failed to load runtime settings");
    return envDefaultSettings();
  }
}

function saveSettings(settings: RuntimeSettings): void {
  try {
    ensureDataDir();
    writeFileSync(SETTINGS_FILE, JSON.stringify(settings, null, 2));
  } catch (err) {
    logger.error({ err }, "Failed to save runtime settings");
  }
}

// ─── Singleton ───────────────────────────────────────────────────────────────

let _cache: RuntimeSettings | null = null;

function getSettings(): RuntimeSettings {
  if (!_cache) {
    _cache = loadSettings();
  }
  return _cache;
}

function invalidateCache(): void {
  _cache = null;
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Whether the dashboard is publicly accessible without auth, using runtime
 * override if available, otherwise falling back to the env-based static config.
 */
export function isDashboardPublic(staticConfig?: Config): boolean {
  const runtime = getSettings();
  return runtime.dashboardIsPublic;
}

export function getRuntimeSettings(): RuntimeSettings {
  return { ...getSettings() };
}

/**
 * Update runtime settings. Pass only the fields you want to change.
 * Invalidates the internal cache so the next read picks up changes.
 */
export function updateRuntimeSettings(
  patch: Partial<RuntimeSettings>,
): RuntimeSettings {
  const current = getSettings();
  const updated = { ...current, ...patch };
  saveSettings(updated);
  invalidateCache();
  return { ...updated };
}

/**
 * Reset runtime settings to env-based defaults (does NOT change the file).
 */
export function resetRuntimeSettings(): void {
  invalidateCache();
}
