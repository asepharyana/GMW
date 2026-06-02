import { cn } from "../../shared/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type MascotVariant = "idle" | "waving" | "sleeping" | "thinking" | "peeking" | "crying";

interface ChibiMascotProps {
  variant?: MascotVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// ─── Size map ────────────────────────────────────────────────────────────────

const sizes = { sm: 48, md: 80, lg: 120 } as const;

// ─── Keyframes ───────────────────────────────────────────────────────────────

const keyframes = `
@keyframes chibi-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes chibi-wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(15deg); }
  75% { transform: rotate(-10deg); }
}
@keyframes chibi-sleep {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.92); }
}
@keyframes chibi-think {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-4px) rotate(5deg); }
}
@keyframes chibi-cry {
  0%, 100% { transform: translateY(0) scale(1); }
  25% { transform: translateY(-2px) scale(1.02); }
  75% { transform: translateY(1px) scale(0.98); }
}
@keyframes chibi-peek {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  50% { transform: translateX(-3px) rotate(-3deg); }
}
@keyframes chibi-teardrop {
  0% { opacity: 1; transform: translateY(0) scaleX(1); }
  100% { opacity: 0; transform: translateY(12px) scaleX(0.5); }
}
@keyframes chibi-blink {
  0%, 90%, 100% { transform: scaleY(1); }
  95% { transform: scaleY(0.1); }
}
@keyframes chibi-zzz {
  0% { opacity: 0; transform: translateX(0) translateY(0); }
  50% { opacity: 1; transform: translateX(6px) translateY(-6px); }
  100% { opacity: 0; transform: translateX(12px) translateY(-12px); }
}
@keyframes chibi-dots {
  0% { opacity: 0; }
  50% { opacity: 1; }
  100% { opacity: 0; }
}
`;

// ─── Variant animation styles ────────────────────────────────────────────────

function getAnimation(variant: MascotVariant): React.CSSProperties {
  const map: Record<MascotVariant, string> = {
    idle: "chibi-bob 2.5s ease-in-out infinite",
    waving: "chibi-bob 2.5s ease-in-out infinite",
    sleeping: "chibi-sleep 3s ease-in-out infinite",
    thinking: "chibi-think 2s ease-in-out infinite",
    peeking: "chibi-peek 2s ease-in-out infinite",
    crying: "chibi-cry 1.5s ease-in-out infinite",
  };
  return { animation: map[variant] };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChibiMascot({ variant = "idle", size = "md", className }: ChibiMascotProps) {
  const px = sizes[size];
  const scale = px / 80; // base design is 80px

  // Parts of the chibi
  const headSize = 50 * scale;
  const earSize = 18 * scale;
  const eyeSize = 8 * scale;
  const blushSize = 10 * scale;
  const bodyHeight = 30 * scale;
  const bodyWidth = 40 * scale;

  // Colors
  const skin = "#FFE4D6";
  const skinShadow = "#F5D5C3";
  const hair = "#FFB7C5";
  const hairDark = "#F59CB0";
  const eyeColor = "#7EC8E3";
  const eyeShine = "#FFFFFF";
  const blush = "#FFB7C5";
  const outfit = "#7EC8E3";
  const outline = "#E8C4C9";

  const parts: React.ReactNode[] = [];

  // ─── Body ───
  const Body = (
    <div
      key="body"
      style={{
        position: "absolute",
        bottom: 0,
        left: "50%",
        marginLeft: -(bodyWidth / 2),
        width: bodyWidth,
        height: bodyHeight,
        background: `linear-gradient(180deg, ${outfit} 0%, #6BB5D0 100%)`,
        borderRadius: `${bodyWidth * 0.4}px ${bodyWidth * 0.4}px ${bodyWidth * 0.2}px ${bodyWidth * 0.2}px`,
        border: `2px solid ${outline}`,
        zIndex: 1,
      }}
    />
  );
  parts.push(Body);

  // ─── Arms (waving variant) ───
  if (variant === "waving") {
    const Arm = (
      <div
        key="arm-right"
        style={{
          position: "absolute",
          bottom: bodyHeight * 0.4,
          right: "50%",
          marginRight: -(bodyWidth / 2) - 8 * scale,
          width: 8 * scale,
          height: 20 * scale,
          background: skin,
          borderRadius: 4 * scale,
          border: `1.5px solid ${outline}`,
          transformOrigin: "bottom center",
          animation: "chibi-wave 0.6s ease-in-out infinite",
          zIndex: 2,
        }}
      />
    );
    parts.push(Arm);
  }

  // ─── Head ───
  const Head = (
    <div
      key="head"
      style={{
        position: "absolute",
        top: 0,
        left: "50%",
        marginLeft: -(headSize / 2),
        width: headSize,
        height: headSize,
        background: skin,
        borderRadius: "50%",
        border: `2.5px solid ${outline}`,
        zIndex: 3,
        overflow: "visible",
      }}
    />
  );
  parts.push(Head);

  // ─── Cat ears ───
  const earStyle: React.CSSProperties = {
    position: "absolute",
    top: -earSize * 0.4,
    width: 0,
    height: 0,
    borderLeft: `${earSize * 0.6}px solid transparent`,
    borderRight: `${earSize * 0.6}px solid transparent`,
    borderBottom: `${earSize}px solid ${hair}`,
    zIndex: 4,
    filter: `drop-shadow(0 1px 0 ${outline})`,
  };

  parts.push(
    <div
      key="ear-left"
      style={{
        ...earStyle,
        left: "50%",
        marginLeft: -(headSize * 0.4) - earSize * 0.3,
      }}
    />,
  );
  parts.push(
    <div
      key="ear-right"
      style={{
        ...earStyle,
        right: "50%",
        marginRight: -(headSize * 0.4) - earSize * 0.3,
      }}
    />,
  );

  // Inner ear (pink)
  const innerEarStyle: React.CSSProperties = {
    position: "absolute",
    top: -earSize * 0.2,
    width: 0,
    height: 0,
    borderLeft: `${earSize * 0.35}px solid transparent`,
    borderRight: `${earSize * 0.35}px solid transparent`,
    borderBottom: `${earSize * 0.6}px solid ${blush}`,
    zIndex: 5,
  };

  parts.push(
    <div
      key="ear-inner-left"
      style={{
        ...innerEarStyle,
        left: "50%",
        marginLeft: -(headSize * 0.4) - earSize * 0.15,
      }}
    />,
  );
  parts.push(
    <div
      key="ear-inner-right"
      style={{
        ...innerEarStyle,
        right: "50%",
        marginRight: -(headSize * 0.4) - earSize * 0.15,
      }}
    />,
  );

  // ─── Hair bang ───
  parts.push(
    <div
      key="hair-bang"
      style={{
        position: "absolute",
        top: -2 * scale,
        left: "50%",
        marginLeft: -(headSize * 0.35),
        width: headSize * 0.7,
        height: headSize * 0.35,
        background: hair,
        borderRadius: `${headSize * 0.35}px ${headSize * 0.35}px 0 0`,
        border: `1.5px solid ${hairDark}`,
        zIndex: 6,
      }}
    />,
  );

  // ─── Eyes ───
  if (variant === "sleeping") {
    // Closed eyes (lines)
    parts.push(
      <div
        key="eye-left"
        style={{
          position: "absolute",
          top: headSize * 0.4,
          left: "50%",
          marginLeft: -(eyeSize * 1.2) - eyeSize,
          width: eyeSize * 1.5,
          height: 2.5 * scale,
          background: "#555",
          borderRadius: 2 * scale,
          zIndex: 7,
          animation: "chibi-sleep 3s ease-in-out infinite",
        }}
      />,
    );
    parts.push(
      <div
        key="eye-right"
        style={{
          position: "absolute",
          top: headSize * 0.4,
          left: "50%",
          marginLeft: eyeSize * 0.8,
          width: eyeSize * 1.5,
          height: 2.5 * scale,
          background: "#555",
          borderRadius: 2 * scale,
          zIndex: 7,
          animation: "chibi-sleep 3s ease-in-out infinite",
        }}
      />,
    );
  } else if (variant === "crying") {
    // Squeezed eyes
    parts.push(
      <div
        key="eye-left"
        style={{
          position: "absolute",
          top: headSize * 0.42,
          left: "50%",
          marginLeft: -(eyeSize * 1.2) - eyeSize,
          width: eyeSize * 1.5,
          height: eyeSize * 0.6,
          background: "#555",
          borderRadius: "50%",
          zIndex: 7,
          animation: "chibi-blink 3s 2s infinite",
        }}
      />,
    );
    parts.push(
      <div
        key="eye-right"
        style={{
          position: "absolute",
          top: headSize * 0.42,
          left: "50%",
          marginLeft: eyeSize * 0.8,
          width: eyeSize * 1.5,
          height: eyeSize * 0.6,
          background: "#555",
          borderRadius: "50%",
          zIndex: 7,
          animation: "chibi-blink 3s 2s infinite",
        }}
      />,
    );

    // Teardrops
    parts.push(
      <div
        key="tear-left"
        style={{
          position: "absolute",
          top: headSize * 0.55,
          left: "50%",
          marginLeft: -(eyeSize * 1.5),
          width: 3 * scale,
          height: 6 * scale,
          background: "#89CFF0",
          borderRadius: "50%",
          animation: "chibi-teardrop 1.5s ease-in infinite",
          zIndex: 8,
        }}
      />,
    );
    parts.push(
      <div
        key="tear-right"
        style={{
          position: "absolute",
          top: headSize * 0.58,
          left: "50%",
          marginLeft: eyeSize * 1.5,
          width: 3 * scale,
          height: 6 * scale,
          background: "#89CFF0",
          borderRadius: "50%",
          animation: "chibi-teardrop 1.5s 0.5s ease-in infinite",
          zIndex: 8,
        }}
      />,
    );
  } else {
    // Normal big eyes
    const eyeStyle: React.CSSProperties = {
      position: "absolute",
      top: headSize * 0.38,
      width: eyeSize,
      height: eyeSize * 1.1,
      background: eyeColor,
      borderRadius: "50%",
      border: `1.5px solid #555`,
      zIndex: 7,
      animation: "chibi-blink 4s 1s infinite",
    };

    parts.push(
      <div
        key="eye-left"
        style={{
          ...eyeStyle,
          left: "50%",
          marginLeft: -(eyeSize * 1.2) - eyeSize * 0.5,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 1.5 * scale,
            left: 1.5 * scale,
            width: eyeSize * 0.35,
            height: eyeSize * 0.35,
            background: eyeShine,
            borderRadius: "50%",
          }}
        />
      </div>,
    );
    parts.push(
      <div
        key="eye-right"
        style={{
          ...eyeStyle,
          left: "50%",
          marginLeft: eyeSize * 0.3,
        }}
      >
        <div
          style={{
            position: "absolute",
            top: 1.5 * scale,
            left: 1.5 * scale,
            width: eyeSize * 0.35,
            height: eyeSize * 0.35,
            background: eyeShine,
            borderRadius: "50%",
          }}
        />
      </div>,
    );
  }

  // ─── Blush ───
  const blushStyle: React.CSSProperties = {
    position: "absolute",
    top: headSize * 0.52,
    width: blushSize,
    height: blushSize * 0.6,
    background: blush,
    borderRadius: "50%",
    opacity: 0.5,
    zIndex: 7,
  };

  parts.push(
    <div key="blush-left" style={{ ...blushStyle, left: "50%", marginLeft: -(headSize * 0.4) }} />,
  );
  parts.push(
    <div
      key="blush-right"
      style={{ ...blushStyle, right: "50%", marginRight: -(headSize * 0.4) }}
    />,
  );

  // ─── Mouth ───
  if (variant === "crying") {
    parts.push(
      <div
        key="mouth"
        style={{
          position: "absolute",
          top: headSize * 0.6,
          left: "50%",
          marginLeft: -(5 * scale),
          width: 10 * scale,
          height: 2 * scale,
          borderBottom: `2px solid ${outline}`,
          borderRadius: "50%",
          zIndex: 8,
        }}
      />,
    );
  } else {
    parts.push(
      <div
        key="mouth"
        style={{
          position: "absolute",
          top: headSize * 0.6,
          left: "50%",
          marginLeft: -(3 * scale),
          width: 6 * scale,
          height: 3 * scale,
          borderBottom: `2px solid ${outline}`,
          borderLeft: `1px solid transparent`,
          borderRight: `1px solid transparent`,
          borderRadius: "0 0 50% 50%",
          zIndex: 8,
        }}
      />,
    );
  }

  // ─── Variant extras ───

  // Thinking dots
  if (variant === "thinking") {
    parts.push(
      <div
        key="think-dot1"
        style={{
          position: "absolute",
          top: -12 * scale,
          right: -10 * scale,
          width: 4 * scale,
          height: 4 * scale,
          background: "#999",
          borderRadius: "50%",
          animation: "chibi-dots 1.5s ease-in-out infinite",
          zIndex: 10,
        }}
      />,
    );
    parts.push(
      <div
        key="think-dot2"
        style={{
          position: "absolute",
          top: -18 * scale,
          right: -14 * scale,
          width: 5 * scale,
          height: 5 * scale,
          background: "#999",
          borderRadius: "50%",
          animation: "chibi-dots 1.5s 0.3s ease-in-out infinite",
          zIndex: 10,
        }}
      />,
    );
    parts.push(
      <div
        key="think-dot3"
        style={{
          position: "absolute",
          top: -25 * scale,
          right: -12 * scale,
          width: 6 * scale,
          height: 6 * scale,
          background: "#999",
          borderRadius: "50%",
          animation: "chibi-dots 1.5s 0.6s ease-in-out infinite",
          zIndex: 10,
        }}
      />,
    );
  }

  // Sleeping zzz
  if (variant === "sleeping") {
    parts.push(
      <div
        key="zzz1"
        style={{
          position: "absolute",
          top: -14 * scale,
          right: -8 * scale,
          fontSize: 9 * scale,
          fontWeight: 700,
          color: "#7EC8E3",
          animation: "chibi-zzz 2.5s ease-in-out infinite",
          zIndex: 10,
          fontFamily: "sans-serif",
        }}
      >
        z
      </div>,
    );
    parts.push(
      <div
        key="zzz2"
        style={{
          position: "absolute",
          top: -22 * scale,
          right: -2 * scale,
          fontSize: 11 * scale,
          fontWeight: 700,
          color: "#7EC8E3",
          animation: "chibi-zzz 2.5s 0.5s ease-in-out infinite",
          zIndex: 10,
          fontFamily: "sans-serif",
        }}
      >
        z
      </div>,
    );
    parts.push(
      <div
        key="zzz3"
        style={{
          position: "absolute",
          top: -32 * scale,
          right: 6 * scale,
          fontSize: 13 * scale,
          fontWeight: 700,
          color: "#7EC8E3",
          animation: "chibi-zzz 2.5s 1s ease-in-out infinite",
          zIndex: 10,
          fontFamily: "sans-serif",
        }}
      >
        Z
      </div>,
    );
  }

  return (
    <>
      <style>{keyframes}</style>
      <div
        className={cn("relative inline-flex items-center justify-center", className)}
        style={{
          width: px,
          height: px,
          ...getAnimation(variant),
        }}
        aria-label={`Chibi mascot (${variant})`}
        role="img"
      >
        {parts}
      </div>
    </>
  );
}

// ─── Empty state with mascot ─────────────────────────────────────────────────

interface EmptyStateMascotProps {
  variant?: MascotVariant;
  message: string;
  action?: { label: string; onClick: () => void };
  className?: string;
}

export function EmptyStateMascot({
  variant = "idle",
  message,
  action,
  className,
}: EmptyStateMascotProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-sky-200 bg-white/60 p-8 text-center",
        className,
      )}
    >
      <ChibiMascot variant={variant} size="md" />
      <p className="text-sm text-muted-foreground">{message}</p>
      {action && (
        <button
          onClick={action.onClick}
          className="rounded-xl bg-primary px-4 py-2 text-sm font-medium text-white shadow-sm transition-all hover:bg-primary/90 active:scale-95"
        >
          {action.label}
        </button>
      )}
    </div>
  );
}
