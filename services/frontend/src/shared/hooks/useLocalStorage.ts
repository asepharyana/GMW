// ─── Validated localStorage hook with shape checking ────────────────────────
import { useCallback, useState } from "react";

interface ShapeValidator<T> {
  /** Returns true if the parsed value matches the expected shape */
  validate: (value: unknown) => value is T;
  /** Default value when storage is empty or invalid */
  defaults: T;
}

export function useLocalStorage<T>(key: string, validator: ShapeValidator<T>) {
  const [value, setValue] = useState<T>(() => loadStored(key, validator));

  const update = useCallback(
    (patch: T | ((prev: T) => T)) => {
      setValue((prev) => {
        const next =
          typeof patch === "function" ? (patch as (prev: T) => T)(prev) : patch;
        try {
          localStorage.setItem(key, JSON.stringify(next));
        } catch {
          // ignore quota errors
        }
        return next;
      });
    },
    [key],
  );

  return { value, setValue: update };
}

function loadStored<T>(key: string, validator: ShapeValidator<T>): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return validator.defaults;
    const parsed = JSON.parse(raw) as unknown;
    if (validator.validate(parsed)) return parsed;
    return validator.defaults;
  } catch {
    return validator.defaults;
  }
}

// ─── Pre-built validators for common shapes ─────────────────────────────────

export function recordValidator(): ShapeValidator<Record<string, unknown>> {
  return {
    validate: (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v),
    defaults: {},
  };
}

export function uiStateValidator(): ShapeValidator<Record<string, unknown>> {
  return {
    validate: (v): v is Record<string, unknown> =>
      typeof v === "object" && v !== null && !Array.isArray(v),
    defaults: { activeTab: "messages" },
  };
}
