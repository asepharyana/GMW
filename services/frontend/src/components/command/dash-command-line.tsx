"use client";

/**
 * DashCommandLine — sticky bottom prompt for ops actions.
 *
 * The signature element of the new dashboard. Pure mono input; parses a
 * slash-prefixed verb and dispatches to existing APIs or client-side
 * actions. Autocomplete is intentionally light (suggestions render in
 * monospace below the input).
 */

import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { cn } from "@/lib/utils";

type CommandVerb = "mute" | "jump" | "find" | "clear";

interface CommandResult {
  ok: boolean;
  message: string;
}

const VERBS: CommandVerb[] = ["mute", "jump", "find", "clear"];

interface DashCommandLineProps {
  onCommand?: (verb: CommandVerb, args: string) => CommandResult | undefined;
  placeholder?: string;
}

export function DashCommandLine({
  onCommand,
  placeholder = "type a command — /mute @user 10m, /jump #channel, /find text, /clear",
}: DashCommandLineProps) {
  const [value, setValue] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [_historyIdx, setHistoryIdx] = useState<number>(-1);
  const [result, setResult] = useState<CommandResult | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Global "/" focuses the command line (skip when typing in another input).
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const t = e.target as HTMLElement | null;
      const tag = t?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || t?.isContentEditable) return;
      e.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const suggestions = useMemo(() => {
    const trimmed = value.trimStart();
    if (!trimmed.startsWith("/")) return [] as CommandVerb[];
    const verb = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() ?? "";
    if (!verb) return VERBS;
    return VERBS.filter((v) => v.startsWith(verb));
  }, [value]);

  const submit = useCallback(
    (raw: string) => {
      const trimmed = raw.trim();
      if (!trimmed.startsWith("/")) {
        setResult({ ok: false, message: "commands start with /" });
        return;
      }
      const body = trimmed.slice(1);
      const [verbRaw, ...rest] = body.split(/\s+/);
      const verb = (verbRaw?.toLowerCase() ?? "") as CommandVerb;
      if (!VERBS.includes(verb)) {
        setResult({
          ok: false,
          message: `unknown verb "${verbRaw}" — try ${VERBS.join(", ")}`,
        });
        return;
      }
      const args = rest.join(" ");
      try {
        const ret = onCommand?.(verb, args);
        const message =
          (ret && typeof ret === "object" && "message" in ret && ret.message) ||
          defaultMessage(verb, args);
        setResult({ ok: true, message });
      } catch (err) {
        setResult({
          ok: false,
          message: err instanceof Error ? err.message : "command failed",
        });
      }
      setHistory((h) => [trimmed, ...h].slice(0, 32));
      setHistoryIdx(-1);
    },
    [onCommand],
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (value.trim()) {
      submit(value);
      setValue("");
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHistoryIdx((idx) => {
        const next = idx + 1;
        if (next >= history.length) return idx;
        setValue(history[next] ?? "");
        return next;
      });
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setHistoryIdx((idx) => {
        const next = idx - 1;
        if (next < -1) return idx;
        setValue(next === -1 ? "" : (history[next] ?? ""));
        return next;
      });
    }
  };

  return (
    <form
      onSubmit={onSubmit}
      className="sticky bottom-0 z-10 flex h-11 items-center gap-2 border-t border-[var(--color-hairline)] bg-[var(--color-canvas)] px-3 font-mono text-[12px]"
      role="search"
    >
      <span className="shrink-0 text-[var(--color-signal)]">{">"}</span>
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        aria-label="Command line"
        className="min-w-0 flex-1 bg-transparent text-[var(--color-ink)] outline-none placeholder:text-[var(--color-ink-soft)]"
      />
      {result ? (
        <span
          className={cn(
            "shrink-0 truncate text-[10px] uppercase tracking-wide",
            result.ok
              ? "text-[var(--color-signal)]"
              : "text-[var(--color-vermilion)]",
          )}
        >
          {result.message}
        </span>
      ) : suggestions.length > 0 ? (
        <span className="shrink-0 truncate text-[10px] uppercase tracking-wide text-[var(--color-ink-soft)]">
          {suggestions.map((s) => `/${s}`).join("  ")}
        </span>
      ) : null}
    </form>
  );
}

function defaultMessage(verb: CommandVerb, args: string): string {
  switch (verb) {
    case "mute":
      return args ? `mute queued — ${args}` : "mute needs a target";
    case "jump":
      return args ? `jump queued — ${args}` : "jump needs a channel";
    case "find":
      return args ? `find queued — ${args}` : "find needs text";
    case "clear":
      return "feed cleared";
  }
}
