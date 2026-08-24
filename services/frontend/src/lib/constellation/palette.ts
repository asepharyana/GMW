/**
 * Color helpers for the constellation stage.
 * Reads CSS custom properties (oklch strings) and converts them to
 * THREE-friendly hex integers. Pure math + DOM reader separated.
 */

/** oklch(L C H) → sRGB hex integer (#rrggbb). Returns null on invalid input. */
export function oklchToHexInt(l: number, c: number, h: number): number | null {
  if (!Number.isFinite(l) || !Number.isFinite(c) || !Number.isFinite(h)) {
    return null;
  }
  // oklch → oklab
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);

  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;

  const L = l_ * l_ * l_;
  const M = m_ * m_ * m_;
  const S = s_ * s_ * s_;

  let r = 4.0767416621 * L - 3.3077115913 * M + 0.2309699292 * S;
  let g = -1.2684380046 * L + 2.6097574011 * M - 0.3413193965 * S;
  let bb = -0.0041960863 * L - 0.7034186147 * M + 1.707614701 * S;

  r = gamma(r);
  g = gamma(g);
  bb = gamma(bb);

  if ([r, g, bb].some((v) => !Number.isFinite(v))) return null;

  const to255 = (v: number) => Math.max(0, Math.min(255, Math.round(v * 255)));
  return (to255(r) << 16) | (to255(g) << 8) | to255(bb);
}

function gamma(v: number): number {
  const abs = Math.abs(v);
  if (abs <= 0.0031308) return 12.92 * v;
  return (Math.sign(v) || 1) * (1.055 * abs ** (1 / 2.4) - 0.055);
}

/** Parse "oklch(0.86 0.19 128)" (or legacy "rgb(...)") into hex int. */
export function cssColorToHexInt(color: string): number | null {
  const oklch = color.match(/oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.-]+)/i);
  if (oklch) {
    const lStr = oklch[1] ?? "";
    const l = lStr.endsWith("%")
      ? (Number.parseFloat(lStr) || 0) / 100
      : Number.parseFloat(lStr);
    return oklchToHexInt(
      l,
      Number.parseFloat(oklch[2] ?? "0"),
      Number.parseFloat(oklch[3] ?? "0"),
    );
  }
  const rgb = color.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i);
  if (rgb) {
    return (
      (Math.round(Number(rgb[1])) << 16) |
      (Math.round(Number(rgb[2])) << 8) |
      Math.round(Number(rgb[3]))
    );
  }
  const hex = color.match(/^#([0-9a-f]{6})$/i);
  if (hex?.[1]) return Number.parseInt(hex[1], 16);
  return null;
}

export interface StagePalette {
  signal: number;
  vermilion: number;
  amber: number;
  ink: number;
  inkSoft: number;
  inkFaint: number;
}

const FALLBACK_DARK: StagePalette = {
  signal: 0x7dd87a,
  vermilion: 0xe05642,
  amber: 0xd9a441,
  ink: 0xf2ede2,
  inkSoft: 0xa89f90,
  inkFaint: 0x807767,
};

/** Read theme tokens off :root computed style; fall back to dark set. */
export function readPalette(): StagePalette {
  if (typeof window === "undefined") return FALLBACK_DARK;
  const cs = getComputedStyle(document.documentElement);
  const pick = (name: string, fb: number): number =>
    cssColorToHexInt(cs.getPropertyValue(name).trim()) ?? fb;
  return {
    signal: pick("--color-signal", FALLBACK_DARK.signal),
    vermilion: pick("--color-vermilion", FALLBACK_DARK.vermilion),
    amber: pick("--color-amber", FALLBACK_DARK.amber),
    ink: pick("--color-ink", FALLBACK_DARK.ink),
    inkSoft: pick("--color-ink-soft", FALLBACK_DARK.inkSoft),
    inkFaint: pick("--color-ink-faint", FALLBACK_DARK.inkFaint),
  };
}
