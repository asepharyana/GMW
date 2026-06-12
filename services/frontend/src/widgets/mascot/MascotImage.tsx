import { motion } from "framer-motion";
import { MessageCircle } from "lucide-react";
import { useEffect, useState } from "react";

/**
 * MascotImage — Anime mascot PNG from GitHub CDN
 * Replaces ChibiMascot SVG component with external PNG asset
 * Now includes optional floating chat bubble with AI insights
 */

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
  sm: "max-w-xs",
  md: "max-w-sm",
  lg: "max-w-md",
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
      const timer = setTimeout(() => setIsVisible(false), 8000); // Auto hide after 8s
      return () => clearTimeout(timer);
    }
    setIsVisible(false);
  }, [showChat, chatMessage, persistChat]);

  return (
    <div className="relative inline-block">
      <motion.img
        src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png"
        alt="Mascot"
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
            <div className="bg-primary/90 text-primary-foreground rounded-xl px-4 py-2.5 shadow-lg backdrop-blur-sm border border-primary/30">
              <div className="flex items-start gap-2">
                <MessageCircle className="h-4 w-4 shrink-0 mt-0.5 text-white/80" />
                <p className="text-xs leading-relaxed font-medium line-clamp-3">
                  {chatMessage}
                </p>
              </div>

              {/* Chat bubble tail */}
              <div className="absolute -bottom-1 -left-1 w-3 h-3 bg-primary/80 rounded-full opacity-70" />
            </div>
          </div>
        </motion.div>
      )}
    </div>
  );
}

/**
 * EmptyStateMascot — Mascot for empty states
 * Replaces ChibiMascot when showing empty data states
 */
export function EmptyStateMascot() {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-12">
      <MascotImage size="md" className="opacity-60" />
      <p className="text-sm text-muted-foreground">No data to display</p>
    </div>
  );
}
