"use client";

import {
  Bot,
  Check,
  Copy,
  MessageCircle,
  RotateCw,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Avatar, Button, GlassPanel, toast } from "@/components/primitives";
import { MarkdownLite } from "@/components/shared";
import { useChatbotUserId } from "@/hooks/use-chatbot-user";
import { chatbotApi } from "@/lib/api";
import { cn } from "@/lib/utils";

interface Msg {
  id: string;
  role: "user" | "bot";
  content: string;
  ts: number;
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "";
  }
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-1.5 rounded-full bg-ink-faint animate-bounce"
          style={{ animationDelay: `${i * 0.15}s`, animationDuration: "0.9s" }}
        />
      ))}
    </div>
  );
}

export function Chatbot() {
  const userId = useChatbotUserId();
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !userId) return;
    chatbotApi
      .getHistory(userId)
      .then((res) => {
        setMsgs(
          res.history.slice(-12).flatMap((h) => [
            {
              id: `${h.id}-u`,
              role: "user" as const,
              content: h.user_message,
              ts: Date.parse(h.created_at) || Date.now(),
            },
            {
              id: `${h.id}-b`,
              role: "bot" as const,
              content: h.bot_response,
              ts: Date.parse(h.created_at) || Date.now(),
            },
          ]),
        );
      })
      .catch(() => {});
  }, [open, userId]);

  // Auto-scroll to newest whenever the thread or typing state changes.
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll must fire on thread/typing changes even though the body only reads the ref
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [msgs, loading, open]);

  // Auto-grow the composer.
  // biome-ignore lint/correctness/useExhaustiveDependencies: height recompute is keyed to input changes; body only reads the textarea element
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
  }, [input]);

  const copy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1200);
    } catch {
      /* clipboard unavailable */
    }
  };

  const clearAll = async () => {
    if (!userId) return;
    setMsgs([]);
    try {
      await chatbotApi.clearHistory(userId);
    } catch {
      /* best-effort */
    }
  };

  const send = async (text: string) => {
    if (!text.trim() || loading || !userId) return;
    setFailed(null);
    setInput("");
    setMsgs((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: text, ts: Date.now() },
    ]);
    setLoading(true);
    try {
      const res = await chatbotApi.send(text, undefined, userId);
      setMsgs((m) => [
        ...m,
        {
          id: `b-${Date.now()}`,
          role: "bot",
          content: res.response,
          ts: Date.parse(res.timestamp) || Date.now(),
        },
      ]);
    } catch (e) {
      setFailed(text);
      toast({ title: "Chat error", description: String(e), tone: "vermilion" });
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Open assistant"
        onClick={() => setOpen((o) => !o)}
        className="fixed right-4 bottom-24 z-50 flex items-center justify-center rounded-full bg-signal text-signal-ink shadow-[0_10px_30px_-8px_var(--color-signal-glow)] transition-transform hover:scale-105 md:right-5 md:bottom-5"
        style={{ width: 52, height: 52 }}
      >
        {open ? <X className="size-5" /> : <MessageCircle className="size-5" />}
      </button>

      {open && (
        <GlassPanel
          className="fixed right-4 bottom-24 z-50 flex w-[min(94vw,360px)] flex-col p-0 md:right-5 md:bottom-20"
          style={{
            animation: "fade-up 0.16s ease",
            height: "min(68dvh, 520px)",
          }}
        >
          <div className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <span className="flex size-8 items-center justify-center rounded-full bg-signal/15 text-signal">
              <Bot className="size-4" />
            </span>
            <div>
              <div className="text-sm font-semibold text-ink">
                GMW Assistant
              </div>
              <div className="mono text-[0.6rem] text-ink-faint">
                context-aware
              </div>
            </div>
            <button
              type="button"
              aria-label="Clear conversation"
              onClick={clearAll}
              className="ml-auto rounded-[9px] p-1.5 text-ink-faint transition-colors hover:bg-white/5 hover:text-ink-soft"
            >
              <Trash2 className="size-4" />
            </button>
          </div>

          <div
            ref={listRef}
            className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
          >
            {msgs.length === 0 && !loading && (
              <div className="py-8 text-center text-xs text-ink-faint">
                Ask about moderation, voice, or media.
              </div>
            )}
            {msgs.map((m) => (
              <div
                key={m.id}
                className={cn(
                  "group flex gap-2",
                  m.role === "user" ? "justify-end" : "justify-start",
                )}
              >
                {m.role === "bot" && (
                  <Avatar
                    name="GMW"
                    size={26}
                    className="mt-0.5 bg-signal/15 text-signal"
                  />
                )}
                <div className="flex max-w-[82%] flex-col">
                  <div
                    className={cn(
                      "rounded-2xl px-3 py-2 text-sm",
                      m.role === "user"
                        ? "rounded-br-sm bg-signal/20 text-ink"
                        : "rounded-bl-sm bg-white/5 text-ink-soft",
                    )}
                  >
                    {m.role === "bot" ? (
                      <MarkdownLite content={m.content} />
                    ) : (
                      <span className="whitespace-pre-wrap break-words">
                        {m.content}
                      </span>
                    )}
                  </div>
                  <div
                    className={cn(
                      "mt-0.5 flex items-center gap-1.5 text-[0.6rem] text-ink-faint",
                      m.role === "user" && "flex-row-reverse",
                    )}
                  >
                    <span className="mono">{formatTime(m.ts)}</span>
                    <button
                      type="button"
                      aria-label="Copy message"
                      onClick={() => copy(m.id, m.content)}
                      className="rounded p-0.5 opacity-0 transition-opacity hover:text-ink-soft group-hover:opacity-100"
                    >
                      {copiedId === m.id ? (
                        <Check className="size-3 text-signal" />
                      ) : (
                        <Copy className="size-3" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="flex gap-2">
                <Avatar
                  name="GMW"
                  size={26}
                  className="bg-signal/15 text-signal"
                />
                <div className="rounded-2xl rounded-bl-sm bg-white/5 px-3 py-2">
                  <TypingDots />
                </div>
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {failed && (
            <div className="mx-3 mb-1 flex items-center gap-2 rounded-[10px] border border-vermilion/30 bg-vermilion/10 px-3 py-1.5 text-xs text-vermilion">
              <span className="flex-1 truncate">Send failed</span>
              <button
                type="button"
                onClick={() => send(failed)}
                className="inline-flex items-center gap-1 font-medium hover:underline"
              >
                <RotateCw className="size-3" /> Retry
              </button>
            </div>
          )}

          <div className="flex items-end gap-2 border-t border-hairline p-3">
            <textarea
              ref={taRef}
              rows={1}
              placeholder="Message…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              className="max-h-[140px] min-h-[40px] flex-1 resize-none rounded-[11px] bg-white/5 border border-hairline px-3 py-2 text-sm text-ink placeholder:text-ink-faint transition-colors focus:outline-none focus:border-signal/50 focus:bg-white/8"
            />
            <Button
              variant="primary"
              size="icon"
              onClick={() => send(input)}
              disabled={loading}
            >
              <MessageCircle className="size-4" />
            </Button>
          </div>
        </GlassPanel>
      )}
    </>
  );
}
