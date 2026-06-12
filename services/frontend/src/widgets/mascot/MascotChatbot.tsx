import { AnimatePresence, motion } from "framer-motion";
import { Maximize2, MessageCircle, Minimize2, Send, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { cn } from "../../shared/lib/utils";

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
  mascotName = "Mascot",
  mascotAvatar = "https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png",
  className,
}: MascotChatbotProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: "init-1",
      role: "mascot",
      content:
        "Halo! 👋 Saya mascot mu. Ada yang bisa aku bantu tentang conversation atau analytics?",
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
        // Default mascot responses
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
      console.error("Error sending message:", error);
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
        className={cn(
          "w-96 bg-card rounded-xl shadow-2xl border border-border overflow-hidden flex flex-col",
          isMinimized ? "h-16" : "h-[520px]",
          className,
        )}
      >
        {/* Header */}
        <div className="bg-gradient-to-r from-primary to-primary/80 text-white p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center">
              <MessageCircle className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-sm">{mascotName}</h3>
              <p className="text-xs text-white/80">
                {loading ? "Mengetik..." : "Online"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsMinimized(!isMinimized)}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title={isMinimized ? "Maximize" : "Minimize"}
            >
              {isMinimized ? (
                <Maximize2 className="h-4 w-4" />
              ) : (
                <Minimize2 className="h-4 w-4" />
              )}
            </motion.button>
            <motion.button
              whileHover={{ scale: 1.1 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => {
                onClose?.();
              }}
              className="p-1.5 hover:bg-white/20 rounded-lg transition-colors"
              title="Close"
            >
              <X className="h-4 w-4" />
            </motion.button>
          </div>
        </div>

        {/* Messages */}
        {!isMinimized && (
          <>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-card">
              {messages.map((message) => (
                <motion.div
                  key={message.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={cn(
                    "flex gap-2",
                    message.role === "user" ? "justify-end" : "justify-start",
                  )}
                >
                  {message.role === "mascot" && (
                    <img
                      src={mascotAvatar}
                      alt={mascotName}
                      className="w-6 h-6 rounded-full object-cover"
                    />
                  )}
                  <div
                    className={cn(
                      "max-w-xs px-3 py-2 rounded-xl text-sm break-words",
                      message.role === "user"
                        ? "bg-primary text-primary-foreground rounded-br-none"
                        : "bg-muted text-foreground rounded-bl-none",
                    )}
                  >
                    {message.content}
                  </div>
                </motion.div>
              ))}
              {loading && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex gap-2 justify-start"
                >
                  <img
                    src={mascotAvatar}
                    alt={mascotName}
                    className="w-6 h-6 rounded-full object-cover"
                  />
                  <div className="bg-muted rounded-xl rounded-bl-none px-3 py-2">
                    <div className="flex gap-1">
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{ duration: 0.6, repeat: Infinity }}
                        className="w-2 h-2 bg-muted-foreground rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: 0.1,
                        }}
                        className="w-2 h-2 bg-muted-foreground rounded-full"
                      />
                      <motion.div
                        animate={{ y: [0, -4, 0] }}
                        transition={{
                          duration: 0.6,
                          repeat: Infinity,
                          delay: 0.2,
                        }}
                        className="w-2 h-2 bg-muted-foreground rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <form
              onSubmit={handleSendMessage}
              className="border-t border-border p-3 bg-card"
            >
              <div className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Tanya mascot..."
                  disabled={loading}
                  className="flex-1 px-3 py-2 rounded-lg border border-input bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring text-sm disabled:opacity-50"
                />
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="p-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
    halo: "Halo juga! 👋 Senang ketemu kamu. Ada yang bisa aku bantu?",
    terima: "Sama-sama! 😊",
    apa: "Aku adalah mascot virtual yang membantu kamu memahami conversation dan analytics. Tanya aku apa saja!",
    siapa:
      "Aku mascot mu yang baik hati! Siap membantu dengan insights tentang chat dan analytics.",
    chat: "Setiap chat yang terjadi di sini aku analisis untuk memberikan insights yang berguna. Keren kan? 😎",
    pesan:
      "Aku bisa memberikan ringkasan tentang pesan-pesan yang dikirim, siapa yang paling aktif, dan topik populer!",
    analitik:
      "Analytics menunjukkan pola conversation, waktu aktif, partisipan utama, dan banyak hal menarik lainnya! 📊",
    berapa:
      "Tanya aku 'berapa pesan hari ini' atau 'berapa orang yang chat' dan aku akan jawab dengan data real-time!",
  };

  for (const [keyword, response] of Object.entries(responseMap)) {
    if (lowerInput.includes(keyword)) {
      return response;
    }
  }

  // Default response
  if (messages.length < 5) {
    return "Bagus! Aku akan belajar tentang apa yang kamu tanya. Coba tanya aku tentang chat, analytics, atau partisipan! 🎯";
  }

  return `Menarik! "${input}" - itu hal yang perlu diperhatikan. Ada yang lain ingin kamu ketahui? 🤔`;
}
