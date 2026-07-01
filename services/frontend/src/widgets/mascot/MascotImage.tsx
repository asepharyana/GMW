/* ═══════════════════════════════════════════════════════════════════════════
 * IMPHNEN MascotImage — Anime mascot PNG dengan floating chat bubble
 * Signature: rounded-xl untuk container, spring transitions, primary glow.
 * Mascot adalah "wajah" IMPHNEN — playful dan approachable.
 * ═══════════════════════════════════════════════════════════════════════════ */

import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

interface MascotImageProps {
  size?: "sm" | "md" | "lg";
  className?: string;
  showChat?: boolean;
  chatMessage?: string;
  persistChat?: boolean;
}

const sizeMap = {
  sm: "w-16 h-auto",
  md: "w-32 h-auto",
  lg: "w-48 h-auto",
};

const chatSizeMap = {
  sm: "max-w-[200px]",
  md: "max-w-xs",
  lg: "max-w-sm",
};

export function MascotImage({
  size = "md",
  className = "",
  showChat = false,
  chatMessage = "",
  persistChat = false,
}: MascotImageProps) {
  const sizeClass = sizeMap[size];
  const chatSizeClass = chatSizeMap[size];
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (showChat && chatMessage) {
      setIsVisible(true);
      if (persistChat) return;
      const timer = setTimeout(() => setIsVisible(false), 8000);
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
  }, [showChat, chatMessage, persistChat]);

  return (
    <div className="relative inline-block">
      <motion.img
        src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png"
        alt="Mascot IMPHNEN"
        className={`object-contain drop-shadow-md ${sizeClass} ${className}`}
        whileHover={{ scale: 1.05 }}
        transition={{ type: "spring", stiffness: 300, damping: 30 }}
      />

      {/* Floating Chat Bubble */}
      {isVisible && chatMessage && (
        <motion.div
          initial={{ opacity: 0, y: 10, scale: 0.8 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 10, scale: 0.8 }}
          transition={{ type: "spring", stiffness: 300, damping: 25 }}
          className={`absolute -top-2 -right-2 ${chatSizeClass} pointer-events-none`}
        >
          <div className="relative">
            {/* Chat bubble */}
            <div className="bg-[#23a1eb]/90 text-white rounded-xl px-3 py-2 shadow-md backdrop-blur-sm border border-[#23a1eb]/30">
              <div className="flex items-start gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 shrink-0 mt-0.5 text-white/80" />
                <p className="text-xs leading-relaxed font-medium line-clamp-3">
                  {chatMessage}
                </p>
              </div>
              <div className="absolute -bottom-1 left-3 w-2.5 h-2.5 bg-[#23a1eb]/80 rounded-full" />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * EmptyStateMascot — Mascot untuk empty states
 * Menampilkan mascot yang redup dengan pesan "Belum ada data"
 */
export function EmptyStateMascot() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <MascotImage size="md" className="opacity-60" />
      <p className="font-sans text-sm text-[#666666]">Belum ada data ditampilkan</p>
    </div>
  );
}
