/**
 * MascotImage — Anime mascot PNG from GitHub CDN
 * Replaces ChibiMascot SVG component with external PNG asset
 */

interface MascotImageProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const sizeMap = {
  sm: "w-16 h-auto",
  md: "w-32 h-auto",
  lg: "w-48 h-auto",
};

export function MascotImage({ size = "md", className = "" }: MascotImageProps) {
  const sizeClass = sizeMap[size];

  return (
    <img
      src="https://raw.githubusercontent.com/IMPHNEN/imphnen-frontend-service/develop/apps/dimentorin/public/image/mascot-1.png"
      alt="Mascot"
      className={`object-contain drop-shadow-md ${sizeClass} ${className}`}
    />
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
