import { AnimatePresence, motion } from "framer-motion";
import {
  Command,
  FileText,
  HelpCircle,
  MessageSquare,
  Moon,
  Search,
  Settings,
  Sun,
  Volume2,
  X,
} from "lucide-react";
import type { KeyboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import type { MessageRecord } from "../api/client";
import { request } from "../api/client";
import { cn } from "../lib/utils";
import { Input } from "./index";

/* ─── Modal backdrop variants ──────────────────────────────────────────── */

const backdropVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1 },
};

const modalVariants = {
  hidden: { opacity: 0, scale: 0.96, y: 20 },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: { type: "spring" as const, stiffness: 350, damping: 28 },
  },
  exit: { opacity: 0, scale: 0.96, y: 10, transition: { duration: 0.15 } },
} as const;

/* ─── Types ────────────────────────────────────────────────────────────── */

type ModalMode = "search" | "shortcuts" | null;

interface CommandPaletteProps {
  isOpen: boolean;
  mode: ModalMode;
  onClose: () => void;
  onNavigate: (tab: string) => void;
  onToggleTheme: () => void;
  isDark: boolean;
}

const shortcuts = [
  { keys: ["Ctrl", "K"], desc: "Open search" },
  { keys: ["?"], desc: "Show keyboard shortcuts" },
  { keys: ["Esc"], desc: "Close modal / cancel" },
  { keys: ["Ctrl", "1"], desc: "Messages & Moderation" },
  { keys: ["Ctrl", "2"], desc: "Voice & Media" },
  { keys: ["Ctrl", "3"], desc: "Dashboard" },
  { keys: ["Ctrl", "4"], desc: "Settings" },
  { keys: ["Space"], desc: "Push-to-talk (when in voice)" },
  { keys: ["T"], desc: "Toggle theme" },
];

/* ─── Help panel ───────────────────────────────────────────────────────── */

function ShortcutsPanel() {
  return (
    <div className="space-y-3 p-4">
      <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
        <HelpCircle className="h-4 w-4 text-primary" />
        Keyboard Shortcuts
      </h3>
      <div className="grid gap-1.5">
        {shortcuts.map((s) => (
          <div
            key={s.keys.join("+")}
            className="flex items-center justify-between rounded-lg px-2 py-1.5 hover:bg-accent/50 transition-colors"
          >
            <span className="text-sm text-muted-foreground">{s.desc}</span>
            <kbd className="flex items-center gap-1">
              {s.keys.map((k) => (
                <span
                  key={k}
                  className="inline-flex h-6 min-w-[24px] items-center justify-center rounded-md border border-border bg-background px-1.5 text-xs font-mono text-foreground shadow-sm"
                >
                  {k === "Ctrl" ? <Command className="h-3 w-3" /> : k}
                </span>
              ))}
            </kbd>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Quick actions ────────────────────────────────────────────────────── */

const quickActions = [
  { id: "messages", label: "Go to Messages", icon: MessageSquare },
  { id: "live", label: "Go to Voice & Media", icon: Volume2 },
  { id: "dashboard", label: "Go to Dashboard", icon: FileText },
  { id: "settings", label: "Open Settings", icon: Settings },
  { id: "theme", label: "Toggle theme", icon: Sun },
];

/* ─── Main component ───────────────────────────────────────────────────── */

export function CommandPalette({
  isOpen,
  mode,
  onClose,
  onNavigate,
  onToggleTheme,
  isDark,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MessageRecord[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  // Focus input when search mode opens
  useEffect(() => {
    if (isOpen && mode === "search") {
      // Small delay for the animation to settle
      const focusTimer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(focusTimer);
    }
  }, [isOpen, mode]);

  // Reset state when closing
  useEffect(() => {
    if (!isOpen) {
      setQuery("");
      setSearchResults([]);
      setActiveIndex(0);
    }
  }, [isOpen]);

  const handleSearch = useCallback(async (q: string) => {
    setQuery(q);
    if (!q.trim()) {
      setSearchResults([]);
      return;
    }
    setIsSearching(true);
    try {
      const params = new URLSearchParams({ q, limit: "10" });
      const data = await request<{ results: MessageRecord[] }>(
        `/api/analysis/search?${params}`,
      );
      setSearchResults(data.results || []);
    } catch {
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  }, []);

  const executeAction = useCallback(
    (action: string) => {
      if (action === "theme") {
        onToggleTheme();
      } else if (action === "settings") {
        onNavigate("settings");
      } else if (action === "messages") {
        onNavigate("messages");
      } else if (action === "live") {
        onNavigate("live");
      } else if (action === "dashboard") {
        onNavigate("dashboard");
      }
      onClose();
    },
    [onNavigate, onToggleTheme, onClose],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIndex((i) => (i < searchResults.length - 1 ? i + 1 : 0));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIndex((i) => (i > 0 ? i - 1 : searchResults.length - 1));
      } else if (e.key === "Enter" && searchResults.length > 0) {
        onClose();
      } else if (e.key === "Escape") {
        onClose();
      }
    },
    [searchResults.length, onClose],
  );

  // Global keyboard listeners for search and help
  useEffect(() => {
    const handler = (e: globalThis.KeyboardEvent) => {
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement ||
        e.target instanceof HTMLSelectElement
      )
        return;

      // Ctrl+K — open search
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        // Don't toggle if already open — just close
        if (isOpen) {
          onClose();
        }
        return;
      }

      // ? — show shortcuts (only when no modal is open)
      if (e.key === "?" && !isOpen) {
        e.preventDefault();
        return;
      }

      // Escape — close any modal
      if (e.key === "Escape" && isOpen) {
        onClose();
      }

      // Ctrl+1-4 — tab navigation
      if (e.ctrlKey || e.metaKey) {
        const tabMap: Record<string, string> = {
          "1": "messages",
          "2": "live",
          "3": "dashboard",
          "4": "settings",
        };
        const tab = tabMap[e.key];
        if (tab) {
          e.preventDefault();
          onNavigate(tab);
        }
      }

      // T — toggle theme (when no input focused)
      if (e.key === "t" && !e.ctrlKey && !e.metaKey && !isOpen) {
        e.preventDefault();
        onToggleTheme();
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, onNavigate, onToggleTheme]);

  const showSearch = mode === "search";
  const showShortcuts = mode === "shortcuts";

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="fixed inset-0 z-[9999] flex items-start justify-center pt-[12vh]"
          variants={backdropVariants}
          initial="hidden"
          animate="visible"
          exit="hidden"
          transition={{ duration: 0.15 }}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Modal */}
          <motion.div
            className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-border/50 bg-card shadow-2xl"
            variants={modalVariants}
            initial="hidden"
            animate="visible"
            exit="exit"
          >
            {/* Search header */}
            {showSearch && (
              <div className="flex items-center gap-3 border-b border-border/50 px-4 py-3">
                <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
                <input
                  ref={inputRef}
                  value={query}
                  onChange={(e) => handleSearch(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Search messages across all channels..."
                  className="flex-1 border-0 bg-transparent p-0 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-none"
                />
                {isSearching && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                )}
                {!isSearching && query && (
                  <button
                    onClick={() => {
                      setQuery("");
                      setSearchResults([]);
                    }}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
                <kbd className="shrink-0 hidden sm:inline-flex h-5 items-center rounded-md border border-border bg-background px-1.5 text-[10px] font-mono text-muted-foreground">
                  ESC
                </kbd>
              </div>
            )}

            {/* Shortcuts header */}
            {showShortcuts && (
              <div className="flex items-center justify-between border-b border-border/50 px-4 py-3">
                <span className="text-sm font-semibold text-foreground flex items-center gap-2">
                  <HelpCircle className="h-4 w-4 text-primary" />
                  Keyboard Shortcuts
                </span>
                <button
                  onClick={onClose}
                  className="rounded-lg p-1 text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}

            {/* Search results */}
            {showSearch && (
              <div className="max-h-[320px] overflow-y-auto">
                {/* Quick actions */}
                {!query && (
                  <div className="p-2">
                    <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      Quick actions
                    </p>
                    {quickActions.map((action) => {
                      const Icon = action.icon;
                      const isThemeAction = action.id === "theme";
                      return (
                        <button
                          key={action.id}
                          onClick={() => executeAction(action.id)}
                          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-sm text-foreground hover:bg-accent transition-colors"
                        >
                          <Icon
                            className={cn(
                              "h-4 w-4",
                              isThemeAction && isDark
                                ? "text-amber-400"
                                : isThemeAction
                                  ? "text-indigo-400"
                                  : "text-primary",
                            )}
                          />
                          <span>{action.label}</span>
                          {isThemeAction && (
                            <span className="ml-auto text-xs text-muted-foreground">
                              {isDark ? "→ Light" : "→ Dark"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                )}

                {/* Results */}
                {query && (
                  <div className="p-2">
                    {searchResults.length > 0 ? (
                      <>
                        <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                          Messages ({searchResults.length})
                        </p>
                        {searchResults.map((msg, i) => (
                          <button
                            key={msg.id}
                            onClick={() => {
                              onClose();
                            }}
                            className={cn(
                              "flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors",
                              i === activeIndex
                                ? "bg-accent"
                                : "hover:bg-accent/50",
                            )}
                          >
                            <MessageSquare className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm text-foreground">
                                {msg.content || "(no content)"}
                              </p>
                              <p className="text-xs text-muted-foreground">
                                {msg.username || msg.user_id || "unknown"}
                                {msg.ai_status === "flagged" && (
                                  <span className="ml-2 text-destructive">
                                    ⚑ flagged
                                  </span>
                                )}
                              </p>
                            </div>
                          </button>
                        ))}
                      </>
                    ) : (
                      <p className="px-2 py-4 text-center text-sm text-muted-foreground">
                        {isSearching
                          ? "Searching..."
                          : "No messages found matching your query."}
                      </p>
                    )}
                  </div>
                )}

                {/* Search footer hint */}
                {!query && (
                  <div className="border-t border-border/50 px-4 py-2">
                    <p className="text-xs text-muted-foreground">
                      Type to search messages — results are fetched from the
                      server
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Shortcuts content */}
            {showShortcuts && <ShortcutsPanel />}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
