// ─── MascotChat.tsx — Floating chat bubble island ───────────────────────────
// Fixed-position toggle button that opens a glass-styled chat panel.
// ─────────────────────────────────────────────────────────────────────────────

import { useCallback, useState } from "react";

const GREETING = "Hi! I'm Bete's mascot. Ask me anything about the server.";

export default function MascotChat() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");

  const toggle = useCallback(() => {
    setIsOpen((prev) => !prev);
  }, []);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      if (!message.trim()) return;
      // TODO: wire up chat submission
      setMessage("");
    },
    [message],
  );

  return (
    <div className="fixed bottom-6 right-6" style={{ zIndex: 60 }}>
      {/* ── Chat Panel ──────────────────────────────────────────────────── */}
      {isOpen && (
        <div className="glass-strong mb-4 flex w-80 flex-col overflow-hidden rounded-2xl shadow-xl animate-fade-in-up">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
            <div className="flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground font-bold">
                B
              </div>
              <span className="text-sm font-semibold text-foreground">
                Mascot
              </span>
            </div>
          </div>

          {/* Body */}
          <div className="flex flex-col gap-3 px-4 py-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              {GREETING}
            </p>

            {/* Quick suggestions */}
            <div className="flex flex-wrap gap-2">
              {["What can you do?", "Show me the dashboard"].map(
                (suggestion) => (
                  <button
                    key={suggestion}
                    type="button"
                    className="rounded-full border border-primary/20 bg-primary/5 px-3 py-1 text-xs text-primary transition-colors hover:bg-primary/15"
                    onClick={() => setMessage(suggestion)}
                  >
                    {suggestion}
                  </button>
                ),
              )}
            </div>
          </div>

          {/* Input */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-white/10 px-4 py-3"
          >
            <input
              type="text"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Type a message..."
              className="min-w-0 flex-1 rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/30"
            />
            <button
              type="submit"
              disabled={!message.trim()}
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary text-xs text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              <svg
                className="h-4 w-4"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M5 12h14M12 5l7 7-7 7"
                />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* ── Toggle Button ───────────────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggle}
        className="flex h-12 w-12 items-center justify-center rounded-full bg-primary text-white shadow-xl transition-transform duration-200 ease-out hover:scale-105 active:scale-95 motion-safe:hover:scale-105"
        aria-label={isOpen ? "Close chat" : "Open chat"}
      >
        {isOpen ? (
          <span className="text-lg leading-none" aria-hidden="true">
            ✕
          </span>
        ) : (
          <span className="text-lg leading-none" aria-hidden="true">
            ✦
          </span>
        )}
      </button>
    </div>
  );
}
