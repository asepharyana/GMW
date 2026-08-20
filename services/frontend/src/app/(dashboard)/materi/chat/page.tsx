"use client";

import { Bot, ExternalLink, Loader2, Send, User } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Button, GlassCard, Textarea } from "@/components/primitives";
import { PageTransition } from "@/components/shared";
import { searchMateri } from "@/lib/api/materi";
import type {
  MateriRagChatMessage,
  MateriRagChatResult,
} from "@/lib/types/materi";

export const dynamic = "force-dynamic";

export default function MateriChatPage() {
  const [messages, setMessages] = useState<MateriRagChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sources, setSources] = useState<MateriRagChatResult["sources"]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMsg: MateriRagChatMessage = {
      role: "user",
      content: input.trim(),
    };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput("");
    setIsLoading(true);
    setSources([]);

    try {
      const result = await searchMateri(
        userMsg.content,
        newMessages,
        undefined,
      );
      const assistantMsg: MateriRagChatMessage = {
        role: "assistant",
        content: result.answer,
      };
      setMessages([...newMessages, assistantMsg]);
      setSources(result.sources);
    } catch {
      const errorMsg: MateriRagChatMessage = {
        role: "assistant",
        content: "Maaf, ada kesalahan. Silakan coba lagi.",
      };
      setMessages([...newMessages, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <PageTransition>
      <div className="flex flex-col h-[calc(100vh-200px)]">
        <div className="mb-4">
          <h1 className="text-3xl font-bold">AI Chat — Materi &amp; RAG</h1>
          <p className="text-muted-foreground mt-1">
            Tanya tentang materi komunitas. AI akan mencari referensi dari
            dokumen materi dan arsip Discord.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Bot className="mx-auto h-12 w-12 mb-4 opacity-50" />
              <p>Silakan tanyakan sesuatu tentang materi komunitas.</p>
              <p className="text-xs mt-2">
                Contoh: "Apa itu screenshare audio di GMW?" atau "Cara pakai
                voice recording"
              </p>
            </div>
          ) : (
            messages.map((msg, i) => (
              <div
                key={i}
                className={
                  "flex gap-3 " +
                  (msg.role === "user" ? "justify-end" : "justify-start")
                }
              >
                <div
                  className={
                    "max-w-[80%] rounded-lg p-4 " +
                    (msg.role === "user"
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted/50")
                  }
                >
                  <div className="flex items-center gap-2 mb-2">
                    {msg.role === "user" ? (
                      <User className="h-4 w-4" />
                    ) : (
                      <Bot className="h-4 w-4" />
                    )}
                    <span className="text-xs font-medium">
                      {msg.role === "user" ? "Anda" : "AI Agent"}
                    </span>
                  </div>
                  <div className="whitespace-pre-wrap text-sm">
                    {msg.content}
                  </div>
                </div>
              </div>
            ))
          )}

          {isLoading && (
            <div className="flex gap-3 justify-start">
              <div className="bg-muted/50 rounded-lg p-4 max-w-[80%]">
                <div className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">
                    AI sedang mencari di materi...
                  </span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Sources from last AI response */}
        {sources.length > 0 && (
          <GlassCard className="p-4 mb-4">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Sumber:
            </p>
            <div className="space-y-1">
              {sources.map((src, i) => (
                <div key={i} className="text-sm">
                  <span className="font-medium">{src.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {" "}
                    (skor: {src.score.toFixed(2)})
                  </span>
                  <p className="text-xs text-muted-foreground line-clamp-2 mt-1">
                    {src.excerpt}
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        )}

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Tanya tentang materi..."
            disabled={isLoading}
            className="flex-1"
            rows={2}
          />
          <Button
            onClick={handleSend}
            disabled={isLoading || !input.trim()}
            size="icon"
          >
            <Send className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-2 text-xs text-muted-foreground">
          <ExternalLink className="h-3 w-3 inline mr-1" />
          AI mengacu pada materi dan arsip Discord. Jawaban mungkin tidak 100%
          akurat.
        </div>
      </div>
    </PageTransition>
  );
}
