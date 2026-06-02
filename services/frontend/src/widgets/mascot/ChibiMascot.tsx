import { cn } from "../../shared/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

type MascotVariant =
  | "idle"
  | "waving"
  | "sleeping"
  | "thinking"
  | "peeking"
  | "crying";

interface ChibiMascotProps {
  variant?: MascotVariant;
  size?: "sm" | "md" | "lg";
  className?: string;
}

// ─── Size map ────────────────────────────────────────────────────────────────

const sizes = { sm: 48, md: 80, lg: 120 } as const;

// ─── Keyframes ───────────────────────────────────────────────────────────────

const keyframes = `
@keyframes cb-bob {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(-3px); }
}
@keyframes cb-wave {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(18deg); }
  75% { transform: rotate(-8deg); }
}
@keyframes cb-sleep {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.94); }
}
@keyframes cb-think {
  0%, 100% { transform: translateY(0) rotate(0deg); }
  50% { transform: translateY(-3px) rotate(4deg); }
}
@keyframes cb-cry {
  0%, 100% { transform: translateY(0) scale(1); }
  25% { transform: translateY(-2px) scale(1.03); }
  75% { transform: translateY(2px) scale(0.97); }
}
@keyframes cb-peek {
  0%, 100% { transform: translateX(0) rotate(0deg); }
  50% { transform: translateX(-4px) rotate(-4deg); }
}
@keyframes cb-teardrop {
  0% { opacity: 1; transform: translateY(0) scaleX(1); }
  100% { opacity: 0; transform: translateY(14px) scaleX(0.4); }
}
@keyframes cb-blink {
  0%, 85%, 100% { transform: scaleY(1); }
  90% { transform: scaleY(0.08); }
}
@keyframes cb-zzz {
  0% { opacity: 0; transform: translateX(0) translateY(0); }
  40% { opacity: 1; transform: translateX(5px) translateY(-5px); }
  100% { opacity: 0; transform: translateX(14px) translateY(-14px); }
}
@keyframes cb-dots {
  0% { opacity: 0; transform: scale(0.6); }
  50% { opacity: 1; transform: scale(1); }
  100% { opacity: 0; transform: scale(0.6); }
}
@keyframes cb-tear-wobble {
  0%, 100% { transform: translateX(0); }
  25% { transform: translateX(-2px); }
  75% { transform: translateX(2px); }
}
@keyframes cb-ear-twitch {
  0%, 100% { transform: rotate(0deg); }
  20% { transform: rotate(12deg); }
  40% { transform: rotate(-6deg); }
  60% { transform: rotate(8deg); }
}
@keyframes cb-arm-chin {
  0%, 100% { transform: rotate(0deg); }
  50% { transform: rotate(6deg); }
}
`;

// ─── Variant animation styles ────────────────────────────────────────────────

function getAnimation(variant: MascotVariant): React.CSSProperties {
  const map: Record<MascotVariant, string> = {
    idle: "cb-bob 2.5s ease-in-out infinite",
    waving: "cb-bob 2.5s ease-in-out infinite",
    sleeping: "cb-sleep 3.5s ease-in-out infinite",
    thinking: "cb-think 2.2s ease-in-out infinite",
    peeking: "cb-peek 2.4s ease-in-out infinite",
    crying: "cb-cry 1.4s ease-in-out infinite",
  };
  return { animation: map[variant] };
}

// ─── Component ───────────────────────────────────────────────────────────────

export function ChibiMascot({
  variant = "idle",
  size = "md",
  className,
}: ChibiMascotProps) {
  const px = sizes[size];
  // Base design dimension is 80px, we scale everything from 0-100 percentage canvas
  const ch = (pct: number) => (pct / 100) * px;

  // Colors
  const skin = "#FFE4D6";
  const skinShadow = "#F5D5C3";
  const hair = "#FFB7C5";
  const hairDark = "#F59CB0";
  const eyeColor = "#7EC8E3";
  const eyeShine = "#FFFFFF";
  const blush = "#FFB7C5";
  const outfit = "#7EC8E3";
  const outfitDark = "#6BB5D0";
  const outline = "#E8C4C9";

  return (
    <>
      <style>{keyframes}</style>
      <div
        className={cn(
          "relative inline-flex items-center justify-center overflow-visible",
          className,
        )}
        style={{
          width: px,
          height: px,
          ...getAnimation(variant),
        }}
        aria-label={`Chibi mascot (${variant})`}
        role="img"
      >
        {/* Inner container — everything is positioned relative to this */}
        <div
          style={{
            position: "relative",
            width: "100%",
            height: "100%",
          }}
        >
          {/* ─── PEEKING variant: a surface to peek over ─── */}
          {variant === "peeking" && (
            <div
              key="peek-surface"
              style={{
                position: "absolute",
                bottom: "28%",
                left: "-10%",
                width: "120%",
                height: "38%",
                background: "linear-gradient(180deg, #E0F2FE 0%, #BAE6FD 100%)",
                borderRadius: "30% 30% 0 0",
                border: `2px solid #7DD3FC`,
                borderBottom: "none",
                zIndex: 15,
                boxShadow: "inset 0 -2px 4px rgba(0,0,0,0.06)",
              }}
            >
              {/* Surface highlight */}
              <div
                style={{
                  position: "absolute",
                  top: "20%",
                  left: "15%",
                  width: "70%",
                  height: "30%",
                  background: "rgba(255,255,255,0.4)",
                  borderRadius: "50%",
                }}
              />
            </div>
          )}

          {/* ─── Body ─── */}
          <div
            key="body"
            style={{
              position: "absolute",
              bottom: "18%",
              left: "50%",
              marginLeft: ch(-20),
              width: ch(40),
              height: ch(28),
              background: `linear-gradient(180deg, ${outfit} 0%, ${outfitDark} 100%)`,
              borderRadius: `${ch(8)} ${ch(8)} ${ch(5)} ${ch(5)}`,
              border: `2px solid ${outline}`,
              zIndex: 1,
            }}
          >
            {/* dress/collar detail */}
            <div
              style={{
                position: "absolute",
                top: "0%",
                left: "10%",
                width: "80%",
                height: "30%",
                background: "rgba(255,255,255,0.15)",
                borderRadius: "0 0 50% 50%",
              }}
            />
          </div>

          {/* ─── Arms ─── */}
          {/* Left arm (always visible, resting) */}
          <div
            key="arm-left"
            style={{
              position: "absolute",
              bottom: "24%",
              left: "50%",
              marginLeft: ch(-38),
              width: ch(7),
              height: ch(18),
              background: `linear-gradient(180deg, ${skinShadow} 0%, ${skin} 100%)`,
              borderRadius: ch(4),
              border: `1.5px solid ${outline}`,
              transformOrigin: "bottom center",
              transform: "rotate(12deg)",
              zIndex: 2,
            }}
          />

          {/* Right arm — varies by variant */}
          {variant === "waving" && (
            <div
              key="arm-right-waving"
              style={{
                position: "absolute",
                bottom: "26%",
                right: "50%",
                marginRight: ch(-36),
                width: ch(7),
                height: ch(18),
                background: `linear-gradient(180deg, ${skin} 0%, ${skinShadow} 100%)`,
                borderRadius: ch(4),
                border: `1.5px solid ${outline}`,
                transformOrigin: "bottom center",
                animation: "cb-wave 0.5s ease-in-out infinite",
                zIndex: 2,
              }}
            />
          )}

          {variant === "thinking" && (
            <div
              key="arm-right-thinking"
              style={{
                position: "absolute",
                bottom: "36%",
                right: "50%",
                marginRight: ch(-32),
                width: ch(6),
                height: ch(15),
                background: `linear-gradient(180deg, ${skin} 0%, ${skinShadow} 100%)`,
                borderRadius: ch(3),
                border: `1.5px solid ${outline}`,
                transformOrigin: "bottom center",
                transform: "rotate(-20deg)",
                animation: "cb-arm-chin 2.2s ease-in-out infinite",
                zIndex: 2,
              }}
            >
              {/* tiny hand */}
              <div
                style={{
                  position: "absolute",
                  top: -ch(2),
                  left: "50%",
                  marginLeft: ch(-2.5),
                  width: ch(5),
                  height: ch(4),
                  background: skin,
                  borderRadius: "50%",
                  border: `1px solid ${outline}`,
                }}
              />
            </div>
          )}

          {variant === "crying" && (
            <div
              key="arm-right-crying"
              style={{
                position: "absolute",
                bottom: "24%",
                right: "50%",
                marginRight: ch(-36),
                width: ch(7),
                height: ch(16),
                background: `linear-gradient(180deg, ${skin} 0%, ${skinShadow} 100%)`,
                borderRadius: ch(4),
                border: `1.5px solid ${outline}`,
                transformOrigin: "bottom center",
                transform: "rotate(-8deg)",
                animation: "cb-tear-wobble 1.4s ease-in-out infinite",
                zIndex: 2,
              }}
            />
          )}

          {variant === "idle" ||
          variant === "sleeping" ||
          variant === "peeking" ? (
            <div
              key="arm-right-rest"
              style={{
                position: "absolute",
                bottom: "24%",
                right: "50%",
                marginRight: ch(-36),
                width: ch(7),
                height: ch(16),
                background: `linear-gradient(180deg, ${skin} 0%, ${skinShadow} 100%)`,
                borderRadius: ch(4),
                border: `1.5px solid ${outline}`,
                transformOrigin: "bottom center",
                transform: "rotate(-8deg)",
                zIndex: 2,
              }}
            />
          ) : null}

          {/* ─── Head (circle) ─── */}
          <div
            key="head"
            style={{
              position: "absolute",
              top: "10%",
              left: "50%",
              marginLeft: ch(-30),
              width: ch(60),
              height: ch(60),
              background: skin,
              borderRadius: "50%",
              border: `2.5px solid ${outline}`,
              zIndex: 3,
              overflow: "visible",
            }}
          >
            {/* ─── SKIN SHADOW (subtle) ─── */}
            <div
              style={{
                position: "absolute",
                bottom: 0,
                left: "15%",
                width: "70%",
                height: "25%",
                background: skinShadow,
                borderRadius: "0 0 50% 50%",
                opacity: 0.4,
                zIndex: 0,
              }}
            />

            {/* ─── EARS ─── */}
            {/* Left ear */}
            <div
              key="ear-left"
              style={{
                position: "absolute",
                top: ch(-5),
                left: ch(-7),
                width: 0,
                height: 0,
                borderLeft: `${ch(6)}px solid transparent`,
                borderRight: `${ch(6)}px solid transparent`,
                borderBottom: `${ch(14)}px solid ${hair}`,
                zIndex: 4,
                filter: `drop-shadow(0 1px 0 ${outline})`,
                transformOrigin: "bottom center",
                ...(variant === "waving"
                  ? { animation: "cb-ear-twitch 1.2s ease-in-out infinite" }
                  : {}),
              }}
            >
              {/* Inner ear */}
              <div
                style={{
                  position: "absolute",
                  top: ch(2),
                  left: ch(-3.5),
                  width: 0,
                  height: 0,
                  borderLeft: `${ch(3.5)}px solid transparent`,
                  borderRight: `${ch(3.5)}px solid transparent`,
                  borderBottom: `${ch(8)}px solid #FFB7C5`,
                  zIndex: 5,
                }}
              />
            </div>

            {/* Right ear */}
            <div
              key="ear-right"
              style={{
                position: "absolute",
                top: ch(-5),
                right: ch(-7),
                width: 0,
                height: 0,
                borderLeft: `${ch(6)}px solid transparent`,
                borderRight: `${ch(6)}px solid transparent`,
                borderBottom: `${ch(14)}px solid ${hair}`,
                zIndex: 4,
                filter: `drop-shadow(0 1px 0 ${outline})`,
                transformOrigin: "bottom center",
                ...(variant === "waving"
                  ? {
                      animation:
                        "cb-ear-twitch 1.2s 0.15s ease-in-out infinite",
                    }
                  : {}),
              }}
            >
              {/* Inner ear */}
              <div
                style={{
                  position: "absolute",
                  top: ch(2),
                  left: ch(-3.5),
                  width: 0,
                  height: 0,
                  borderLeft: `${ch(3.5)}px solid transparent`,
                  borderRight: `${ch(3.5)}px solid transparent`,
                  borderBottom: `${ch(8)}px solid #FFB7C5`,
                  zIndex: 5,
                }}
              />
            </div>

            {/* ─── HAIR BANG ─── */}
            <div
              key="hair-bang"
              style={{
                position: "absolute",
                top: ch(-1),
                left: "12%",
                width: "76%",
                height: "36%",
                background: hair,
                borderRadius: "50% 50% 20% 20%",
                border: `1.5px solid ${hairDark}`,
                zIndex: 6,
                overflow: "hidden",
              }}
            >
              {/* Hair shine */}
              <div
                style={{
                  position: "absolute",
                  top: "15%",
                  left: "20%",
                  width: "35%",
                  height: "40%",
                  background: "rgba(255,255,255,0.3)",
                  borderRadius: "50%",
                  transform: "rotate(-15deg)",
                }}
              />
              {/* Side wisps */}
              <div
                style={{
                  position: "absolute",
                  bottom: "10%",
                  left: "-5%",
                  width: "30%",
                  height: "50%",
                  background: hair,
                  borderRadius: "0 0 50% 50%",
                  borderLeft: `1px solid ${hairDark}`,
                }}
              />
              <div
                style={{
                  position: "absolute",
                  bottom: "10%",
                  right: "-5%",
                  width: "30%",
                  height: "50%",
                  background: hair,
                  borderRadius: "0 0 50% 50%",
                  borderRight: `1px solid ${hairDark}`,
                }}
              />
            </div>

            {/* ─── EYES ─── */}
            {(variant === "sleeping" || variant === "crying") && (
              <>
                {/* Closed / squeezed eyes */}
                <div
                  key="eye-left"
                  style={{
                    position: "absolute",
                    top: "40%",
                    left: "22%",
                    width: "24%",
                    height: variant === "sleeping" ? "4%" : "8%",
                    background: "#555",
                    borderRadius: variant === "sleeping" ? "2px" : "50%",
                    zIndex: 7,
                    animation:
                      variant === "sleeping"
                        ? "cb-sleep 3.5s ease-in-out infinite"
                        : "cb-blink 3s 2s infinite",
                  }}
                />
                <div
                  key="eye-right"
                  style={{
                    position: "absolute",
                    top: "40%",
                    right: "22%",
                    width: "24%",
                    height: variant === "sleeping" ? "4%" : "8%",
                    background: "#555",
                    borderRadius: variant === "sleeping" ? "2px" : "50%",
                    zIndex: 7,
                    animation:
                      variant === "sleeping"
                        ? "cb-sleep 3.5s ease-in-out infinite"
                        : "cb-blink 3s 2s infinite",
                  }}
                />
              </>
            )}

            {variant !== "sleeping" && variant !== "crying" && (
              <>
                {/* Normal big eyes */}
                <div
                  key="eye-left"
                  style={{
                    position: "absolute",
                    top: "38%",
                    left: "20%",
                    width: "26%",
                    height: "34%",
                    background: eyeColor,
                    borderRadius: "50%",
                    border: `1.5px solid #555`,
                    zIndex: 7,
                    animation: "cb-blink 4s 1s infinite",
                    overflow: "hidden",
                  }}
                >
                  {/* Pupil */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "10%",
                      left: "20%",
                      width: "60%",
                      height: "60%",
                      background: "#5BA3C7",
                      borderRadius: "50%",
                    }}
                  />
                  {/* Highlight dot */}
                  <div
                    style={{
                      position: "absolute",
                      top: "15%",
                      left: "20%",
                      width: "35%",
                      height: "35%",
                      background: eyeShine,
                      borderRadius: "50%",
                    }}
                  />
                  {/* Small secondary highlight */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "25%",
                      right: "15%",
                      width: "15%",
                      height: "15%",
                      background: "rgba(255,255,255,0.6)",
                      borderRadius: "50%",
                    }}
                  />
                </div>
                <div
                  key="eye-right"
                  style={{
                    position: "absolute",
                    top: "38%",
                    right: "20%",
                    width: "26%",
                    height: "34%",
                    background: eyeColor,
                    borderRadius: "50%",
                    border: `1.5px solid #555`,
                    zIndex: 7,
                    animation: "cb-blink 4s 1s infinite",
                    overflow: "hidden",
                  }}
                >
                  {/* Pupil */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "10%",
                      left: "20%",
                      width: "60%",
                      height: "60%",
                      background: "#5BA3C7",
                      borderRadius: "50%",
                    }}
                  />
                  {/* Highlight dot */}
                  <div
                    style={{
                      position: "absolute",
                      top: "15%",
                      left: "20%",
                      width: "35%",
                      height: "35%",
                      background: eyeShine,
                      borderRadius: "50%",
                    }}
                  />
                  {/* Small secondary highlight */}
                  <div
                    style={{
                      position: "absolute",
                      bottom: "25%",
                      right: "15%",
                      width: "15%",
                      height: "15%",
                      background: "rgba(255,255,255,0.6)",
                      borderRadius: "50%",
                    }}
                  />
                </div>
              </>
            )}

            {/* ─── NOSE (pink) ─── */}
            <div
              key="nose"
              style={{
                position: "absolute",
                top: "58%",
                left: "50%",
                marginLeft: ch(-1.5),
                width: ch(3),
                height: ch(2.2),
                background: "#FF9EBB",
                borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                zIndex: 9,
              }}
            />

            {/* ─── MOUTH ─── */}
            <div
              key="mouth"
              style={{
                position: "absolute",
                top: "64%",
                left: "50%",
                marginLeft: ch(-3),
                width: ch(6),
                height: ch(2.5),
                borderBottom: `2px solid ${outline}`,
                borderLeft: "1px solid transparent",
                borderRight: "1px solid transparent",
                borderRadius: "0 0 50% 50%",
                zIndex: 8,
              }}
            />

            {/* ─── BLUSH ─── */}
            <div
              key="blush-left"
              style={{
                position: "absolute",
                top: "52%",
                left: "6%",
                width: "16%",
                height: "12%",
                background: blush,
                borderRadius: "50%",
                opacity: 0.45,
                zIndex: 7,
              }}
            />
            <div
              key="blush-right"
              style={{
                position: "absolute",
                top: "52%",
                right: "6%",
                width: "16%",
                height: "12%",
                background: blush,
                borderRadius: "50%",
                opacity: 0.45,
                zIndex: 7,
              }}
            />

            {/* ─── CRYING: Teardrops ─── */}
            {variant === "crying" && (
              <>
                <div
                  key="tear-left"
                  style={{
                    position: "absolute",
                    top: "70%",
                    left: "14%",
                    width: "6%",
                    height: "12%",
                    background:
                      "linear-gradient(180deg, rgba(137,207,240,0.9) 0%, rgba(137,207,240,0.3) 100%)",
                    borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                    animation: "cb-teardrop 1.6s ease-in infinite",
                    zIndex: 10,
                  }}
                />
                <div
                  key="tear-right"
                  style={{
                    position: "absolute",
                    top: "72%",
                    right: "14%",
                    width: "6%",
                    height: "12%",
                    background:
                      "linear-gradient(180deg, rgba(137,207,240,0.9) 0%, rgba(137,207,240,0.3) 100%)",
                    borderRadius: "50% 50% 50% 50% / 60% 60% 40% 40%",
                    animation: "cb-teardrop 1.6s 0.3s ease-in infinite",
                    zIndex: 10,
                  }}
                />
              </>
            )}
          </div>

          {/* ─── VARIANT EXTRAS (outside head) ─── */}

          {/* Thinking dots */}
          {variant === "thinking" && (
            <>
              <div
                key="think-dot1"
                style={{
                  position: "absolute",
                  top: "4%",
                  right: "12%",
                  width: ch(3.5),
                  height: ch(3.5),
                  background: "#A0A0A0",
                  borderRadius: "50%",
                  animation: "cb-dots 1.6s ease-in-out infinite",
                  zIndex: 10,
                }}
              />
              <div
                key="think-dot2"
                style={{
                  position: "absolute",
                  top: "-1%",
                  right: "6%",
                  width: ch(4.5),
                  height: ch(4.5),
                  background: "#909090",
                  borderRadius: "50%",
                  animation: "cb-dots 1.6s 0.3s ease-in-out infinite",
                  zIndex: 10,
                }}
              />
              <div
                key="think-dot3"
                style={{
                  position: "absolute",
                  top: "-7%",
                  right: "3%",
                  width: ch(5.5),
                  height: ch(5.5),
                  background: "#808080",
                  borderRadius: "50%",
                  animation: "cb-dots 1.6s 0.6s ease-in-out infinite",
                  zIndex: 10,
                }}
              />
            </>
          )}

          {/* Sleeping zzz */}
          {variant === "sleeping" && (
            <>
              <div
                key="zzz1"
                style={{
                  position: "absolute",
                  top: "3%",
                  right: "6%",
                  fontSize: ch(8),
                  fontWeight: 700,
                  color: "#7EC8E3",
                  animation: "cb-zzz 2.8s ease-in-out infinite",
                  zIndex: 10,
                  fontFamily: "sans-serif",
                  lineHeight: 1,
                }}
              >
                z
              </div>
              <div
                key="zzz2"
                style={{
                  position: "absolute",
                  top: "-4%",
                  right: "12%",
                  fontSize: ch(10),
                  fontWeight: 700,
                  color: "#7EC8E3",
                  animation: "cb-zzz 2.8s 0.5s ease-in-out infinite",
                  zIndex: 10,
                  fontFamily: "sans-serif",
                  lineHeight: 1,
                }}
              >
                z
              </div>
              <div
                key="zzz3"
                style={{
                  position: "absolute",
                  top: "-12%",
                  right: "16%",
                  fontSize: ch(13),
                  fontWeight: 700,
                  color: "#5BA3C7",
                  animation: "cb-zzz 2.8s 1s ease-in-out infinite",
                  zIndex: 10,
                  fontFamily: "sans-serif",
                  lineHeight: 1,
                }}
              >
                Z
              </div>
            </>
          )}
        </div>
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
