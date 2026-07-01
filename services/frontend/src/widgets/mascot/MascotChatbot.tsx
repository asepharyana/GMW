/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN MascotChatbot — AI companion widget
 * Floating chat panel dengan IMPHNEN signature branding.
 * Friendly Geometry: rounded-xl container, rounded-lg elements.
 * Signature timing: 150ms cubic-bezier(0.4, 0, 0.2, 1) untuk interaksi.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, MessageCircle, Minimize2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { createLogger } from "../../shared/lib/logger.js";
import { cn } from "../../shared/lib/utils";

const logger = createLogger("mascot-chat");

export interface ChatMessage {
  id: string;
  role: "user" | "mascot";
  content: string;
  timestamp: number;
  avatar?: string;
}

interface MascotChatbotProps {
  onClose?: () => void;
  isOpen?: boolean;
  onSendMessage?: (message: string) => Promise<string>;
  mascotName?: string;
  mascotAvatar?: string;
  className?: string;
}

export function MascotChatbot({
  onClose,
  isOpen = false,
  onSendMessage,
  mascotName = "Mascot IMPHNEN",
  mascotAvatar = "https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png",
  className,
}: MascotChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      role: "mascot",
      content:
        "Halo! 👋 Aku mascot IMPHNEN. Ada yang bisa aku bantu tentang conversation atau analytics?",
      timestamp: Date.now(),
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (e: { preventDefault: () => void }) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      let response = "Aku sedang memproses pertanyaanmu...";

      if (onSendMessage) {
        response = await onSendMessage(input.trim());
      } else {
        response = generateMascotResponse(input.trim(), messages);
      }

      const mascotMessage: ChatMessage = {
        id: `mascot-${Date.now()}`,
        role: "mascot",
        content: response,
        timestamp: Date.now(),
      };

      setMessages((prev) => [...prev, mascotMessage]);
    } catch (error) {
      logger.error("Error sending message", {
        error: error instanceof Error ? error.message : String(error),
      });
      const errorMessage: ChatMessage = {
        id: `mascot-error-${Date.now()}`,
        role: "mascot",
        content: "Maaf, ada error saat aku memproses. Coba lagi ya! 😅",
        timestamp: Date.now(),
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.95 }}
        transition={{ duration: 0.2, ease: [0.4, 0, 0.2, 1] }}
        className={cn(
          "w-96 bg-white rounded-xl shadow-lg border border-[#e0e0e0] overflow-hidden flex flex-col",
          isMinimized ? "h-14" : "h-[520px]",
          className,
        )}
      >
        {/* ── Header: Branded Gradient ───────────────────────────────── */}
        <div className="bg-gradient-to-r from-[#23a1eb] to-[#1877f2] p-3.5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-white/20 flex items-center justify-center">
              <MessageCircle className="h-4 w-4 text-white" />
            </div>
            <div>
              <h3 className="font-sans text-sm font-semibold text-white leading-tight">
                {mascotName}
              </h3>
              <p className="font-sans text-[11px] text-white/75 leading-tight mt-0.5">
                {loading ? "Mengetik..." : "Online"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
              title={isMinimized ? "Maximize" : "Minimize"}
            >
              {isMinimized ? (
                <Maximize2 className="h-3.5 w-3.5 text-white" />
              ) : (
                <Minimize2 className="h-3.5 w-3.5 text-white" />
              )}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => onClose?.()}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
              title="Close"
            >
              <X className="h-3.5 w-3.5 text-white" />
            </motion.button>
          </div>
        </div>

        {/* ── Messages Area ──────────────────────────────────────────── */}
        {!isMinimized && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-white">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.15, ease: [0.4, 0, 0.2, 1] }}
                  className={cn(
                    "flex gap-2",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {message.role === "mascot" && (
                    <img
                      src={mascotAvatar}
                      alt={mascotName}
                      className="w-6 h-6 rounded-full object-cover shrink-0"
                    />
                  )}
                  <div
                    className={cn(
                      "max-w-xs px-3 py-2 rounded-xl text-sm break-words leading-relaxed",
                      message.role === "user"
                        ? "bg-[#23a1eb] text-white rounded-br-[4px]"
                        : "bg-[#f5f5f5] text-[#1a1a1a] rounded-bl-[4px]",
                    )}
                  >
                    {message.content}
                  </div>
                </motion.div>
              ))}

              {/* ── Typing Indicator ──────────────────────────────── */}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 justify-start"
                >
                  <img
                    src={mascotAvatar}
                    alt={mascotName}
                    className="w-6 h-6 rounded-full object-cover shrink-0"
                  />
                  <div className="bg-[#f5f5f5] rounded-xl rounded-bl-[4px] px-3 py-2.5">
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                        className="w-2 h-2 bg-[#666666] rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: 0.1,
                        }}
                        className="w-2 h-2 bg-[#666666] rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: 0.2,
                        }}
                        className="w-2 h-2 bg-[#666666] rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* ── Input Area ──────────────────────────────────────── */}
            <form
              onSubmit={handleSendMessage}
              className="border-t border-[#e0e0e0] p-3 bg-white"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tanya mascot..."
                  disabled={loading}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#e0e0e0] bg-white text-[#1a1a1a] placeholder:text-[#999999] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#23a1eb]/30 focus-visible:border-[#23a1eb] text-sm disabled:opacity-50 transition-all duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                />
                <motion.button
                  whileHover={{ scale: 1.03 }}
                  whileTap={{ scale: 0.97 }}
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-2 bg-[#23a1eb] text-white rounded-lg hover:bg-[#1a8fd9] disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150 ease-[cubic-bezier(0.4,0,0.2,1)]"
                >
                  <Send className="h-4 w-4" />
                </motion.button>
              </div>
            </form>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}

// Default mascot responses based on keywords
function generateMascotResponse(
  input: string,
  messages: ChatMessage[],
): string {
  const lowerInput = input.toLowerCase();
  const responseMap: Record<string, string> = {
    halo: "Halo juga! 👋 Senang ketemu kamu di IMPHNEN. Ada yang bisa aku bantu?",
    terima: "Sama-sama! 😊 Senang bisa membantu!",
    apa: "Aku adalah mascot virtual IMPHNEN yang membantu kamu memahami conversation dan analytics. Tanya aku apa saja!",
    siapa:
      "Aku mascot IMPHNEN yang baik hati! Siap membantu dengan insights tentang chat dan analytics.",
    chat: "Setiap chat yang terjadi di guild dianalisis untuk memberikan insights yang berguna. Keren kan? 😎",
    pesan:
      "Aku bisa memberikan ringkasan tentang pesan-pesan yang dikirim, siapa yang paling aktif, dan topik populer!",
    analitik:
      "Analytics menunjukkan pola conversation, waktu aktif, partisipan utama, dan banyak hal menarik! 📊",
    berapa:
      "Tanya aku 'berapa pesan hari ini' atau 'berapa orang yang chat' dan aku akan jawab dengan data real-time!",
  };

  for (const [keyword, response] of Object.entries(responseMap)) {
    if (lowerInput.includes(keyword)) {
      return response;
    }
  }

  if (messages.length < 5) {
    return "Bagus! Aku akan belajar tentang apa yang kamu tanya. Coba tanya aku tentang chat, analytics, atau partisipan! 🎯";
  }

  return `Menarik! "${input}" — itu hal yang perlu diperhatikan. Ada yang lain ingin kamu ketahui? 🤔`;
}
