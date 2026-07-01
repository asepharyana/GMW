# Color System — Éclat Spectral

> *"Color is the keyboard, the eyes are the harmonies, the soul is the piano with many strings."*
> — Wassily Kandinsky, diadaptasi untuk sistem desain modern.

---

## 🎯 Filosofi Warna

Sistem warna BETE dibangun di atas tiga fondasi:

1. **OKLCH** — Color space perceptually uniform untuk konsistensi antar device
2. **HCT (Hue-Chroma-Tone)** — Sistem warna Material You yang adaptif
3. **Semantic Tokens** — Abstraksi makna, bukan nilai literal

Setiap warna memiliki **lightness (L), chroma (C), hue (H)** yang independen. Ini memungkinkan:
- **Scale generation** — Variasi lightness dari 0–100% dengan chroma yang sama
- **Theming** — Cukup ganti hue, seluruh tema bergeser
- **Accessibility** — Kontras dihitung dari lightness, cocok untuk WCAG AA/AAA

---

## 🎨 Primary Palette

### Brand Spectrum: "Aetherial Blue"

Rona utama IMPHNEN — biru yang dingin seperti es Amphoreus, namun hangat dalam interaksi.

```css
/* OKLCH Base — Primary */
--clr-primary-50:  oklch(0.95 0.025 255);
--clr-primary-100: oklch(0.90 0.045 255);
--clr-primary-200: oklch(0.80 0.080 255);
--clr-primary-300: oklch(0.70 0.120 255);
--clr-primary-400: oklch(0.62 0.150 255);
--clr-primary-500: oklch(0.55 0.175 255);  /* ★ Base primary */
--clr-primary-600: oklch(0.47 0.160 255);
--clr-primary-700: oklch(0.40 0.140 255);
--clr-primary-800: oklch(0.32 0.115 255);
--clr-primary-900: oklch(0.25 0.090 255);
--clr-primary-950: oklch(0.18 0.060 255);
```

**Deskripsi Hue 255°:** Biru jernih dengan sedikit cyan — warna langit senja di Amphoreus. Tidak terlalu agresif seperti biru korporat (#007bff), tidak terlalu playful seperti cyan (#00bcd4).

### Neutral Spectrum: "Glacial Scale"

Abu-abu yang tidak hangat (tidak kekuningan) dan tidak dingin (tidak kebiruan) — benar-benar netral.

```css
--clr-neutral-50:  oklch(0.985 0.001 286);
--clr-neutral-100: oklch(0.970 0.001 286);
--clr-neutral-200: oklch(0.920 0.003 286);
--clr-neutral-300: oklch(0.870 0.005 286);
--clr-neutral-400: oklch(0.750 0.010 286);
--clr-neutral-500: oklch(0.620 0.015 286);  /* ★ Base neutral */
--clr-neutral-600: oklch(0.500 0.020 286);
--clr-neutral-700: oklch(0.380 0.025 286);
--clr-neutral-800: oklch(0.260 0.030 286);
--clr-neutral-900: oklch(0.180 0.030 286);
--clr-neutral-950: oklch(0.110 0.025 286);
```

---

## 🌈 Extended Palette

### Accent Colors

| Palette | Hue | Chroma | Base (500) | Karakter |
|---------|-----|--------|------------|----------|
| **Ruby** (Destructive) | 25° | 0.165 | `oklch(0.55 0.165 25)` | Darah — urgensi, error |
| **Emerald** (Success) | 145° | 0.130 | `oklch(0.60 0.130 145)` | Pertumbuhan — sukses, aman |
| **Amber** (Warning) | 75° | 0.120 | `oklch(0.70 0.120 75)` | Matahari — peringatan, atensi |
| **Amethyst** (Premium) | 285° | 0.100 | `oklch(0.55 0.100 285)` | Mewah — fitur premium, VIP |
| **Rose** (AI / Feminine) | 350° | 0.110 | `oklch(0.60 0.110 350)` | Kecerdasan — AI analysis, insight |
| **Cyan** (Info) | 200° | 0.120 | `oklch(0.65 0.120 200)` | Informasi — tooltip, hint |

Setiap palette memiliki scale 50–950 mengikuti pola primary. Contoh:

```css
--clr-ruby-500:    oklch(0.55 0.165 25);
--clr-ruby-600:    oklch(0.47 0.150 25);
--clr-emerald-500: oklch(0.60 0.130 145);
--clr-amber-500:   oklch(0.70 0.120 75);
```

### Semantic Surface Colors — Dark Theme

```css
/* Base surfaces */
--clr-surface-base:       oklch(0.11 0.010 286);  /* Darkest bg */
--clr-surface-elevated:   oklch(0.14 0.015 286);  /* Card surface */
--clr-surface-overlay:    oklch(0.17 0.020 286);  /* Modal/dropdown */
--clr-surface-sunken:     oklch(0.08 0.005 286);  /* Input bg */

/* Interactive states */
--clr-interactive-hover:   oklch(0.20 0.025 286);
--clr-interactive-active:  oklch(0.24 0.030 286);
--clr-interactive-selected: oklch(0.25 0.060 255 / 0.15); /* Primary tint */
```

### Semantic Surface Colors — Light Theme

```css
--clr-surface-base:       oklch(0.97 0.002 286);
--clr-surface-elevated:   oklch(1.00 0.000 286);
--clr-surface-overlay:    oklch(0.95 0.003 286);
--clr-surface-sunken:     oklch(0.92 0.004 286);

--clr-interactive-hover:   oklch(0.90 0.005 286);
--clr-interactive-active:  oklch(0.85 0.008 286);
--clr-interactive-selected: oklch(0.90 0.060 255 / 0.3);
```

---

## 📐 Text Colors & Accessibility

### Foreground Scale

```css
--clr-text-primary:   oklch(0.95 0.005 286);  /* High emphasis — body */
--clr-text-secondary: oklch(0.70 0.015 286);  /* Medium emphasis — metadata */
--clr-text-tertiary:  oklch(0.50 0.020 286);  /* Low emphasis — placeholder */
--clr-text-disabled:  oklch(0.35 0.020 286);  /* Disabled state */
--clr-text-inverse:   oklch(0.11 0.010 286);  /* On colored backgrounds */

/* On-brand backgrounds */
--clr-text-on-primary:   oklch(0.97 0.005 286);  /* Text on primary bg */
--clr-text-on-destructive: oklch(0.97 0.005 286); /* Text on destructive bg */
```

### Kontras Minimum

| Level | Rasio | Usage | Elemen |
|-------|-------|-------|--------|
| **AA** | 4.5:1 | Body text normal | `--clr-text-primary` di atas surface |
| **AA Large** | 3:1 | Teks ≥18px/≥14px bold | Heading, label |
| **AAA** | 7:1 | Teks penting | Legal, alert, critical info |

### Verifikasi Kontras

```typescript
// utils/contrast.ts
function meetsWCAGAA(foreground: OklchColor, background: OklchColor): boolean {
  const contrast = relativeLuminance(background) / relativeLuminance(foreground);
  return contrast >= 4.5;
}

// Helper function untuk mendapatkan lightness aman
function accessibleLightness(hue: number, chroma: number, bgLightness: number): number {
  // Mencari lightness minimum yang memenuhi 4.5:1
  for (let l = 1.0; l > 0; l -= 0.01) {
    if (getContrastRatio(l, chroma, hue, bgLightness) >= 4.5) return l;
  }
  return 0.5;
}
```

---

## 🪞 Glass & Frosted Effects

Estetika glassmorphism menggunakan **opacity + backdrop-blur**:

```css
/* Glass card — frosted glass */
--glass-bg:          oklch(0.15 0.015 286 / 0.60);
--glass-border:      oklch(0.25 0.030 286 / 0.20);
--glass-blur:        16px;
--glass-shadow:      0 8px 32px oklch(0 0 0 / 0.25);

/* Glass strong — modal/dialog */
--glass-strong-bg:    oklch(0.18 0.020 286 / 0.85);
--glass-strong-blur:  24px;

/* Glass subtle — sidebar */
--glass-subtle-bg:    oklch(var(--clr-surface-base) / 0.50);
--glass-subtle-blur:  8px;
```

### Menggabungkan di CSS:

```css
.glass-card {
  background: var(--glass-bg);
  backdrop-filter: blur(var(--glass-blur));
  -webkit-backdrop-filter: blur(var(--glass-blur));
  border: 1px solid var(--glass-border);
  box-shadow: var(--glass-shadow);
}
```

---

## 🌟 Glow & Light Effects

### Glow Tokens

```css
/* Primary glow — untuk elemen interaktif, loading state */
--glow-primary:     0 0 20px oklch(0.55 0.175 255 / 0.3);
--glow-primary-soft: 0 0 12px oklch(0.55 0.175 255 / 0.15);

/* Success glow — untuk badge, notifikasi sukses */
--glow-success:     0 0 16px oklch(0.60 0.130 145 / 0.25);

/* Destructive glow — untuk alert error */
--glow-error:       0 0 16px oklch(0.55 0.165 25 / 0.25);

/* AI glow — untuk analysis badge, pulsing indicator */
--glow-ai:          0 0 20px oklch(0.60 0.110 350 / 0.25);
```

### Pulse Animation dengan Glow

```css
@keyframes glow-pulse {
  0%, 100% {
    box-shadow: var(--glow-primary-soft);
  }
  50% {
    box-shadow: var(--glow-primary);
  }
}

.ai-analysis-badge {
  animation: glow-pulse 2s ease-in-out infinite;
}
```

---

## 🌗 Theme Tokens

### Dark Mode (Default)

```css
[data-theme="dark"] {
  /* Base */
  --clr-base:       var(--clr-surface-base);
  --clr-elevated:   var(--clr-surface-elevated);
  --clr-overlay:    var(--clr-surface-overlay);
  --clr-sunken:     var(--clr-surface-sunken);

  /* Text */
  --clr-text:       var(--clr-text-primary);
  --clr-text-muted: var(--clr-text-secondary);

  /* Brand adjustments for dark */
  --clr-primary:    var(--clr-primary-400); /* Lebih terang di dark */
  --clr-primary-bg: oklch(0.25 0.060 255 / 0.20);
}
```

### Light Mode

```css
[data-theme="light"] {
  --clr-base:       oklch(0.97 0.002 286);
  --clr-elevated:   oklch(1.00 0.000 286);
  --clr-overlay:    oklch(0.95 0.003 286);
  --clr-sunken:     oklch(0.92 0.004 286);

  --clr-text:       oklch(0.11 0.010 286);
  --clr-text-muted: oklch(0.50 0.020 286);

  --clr-primary:    var(--clr-primary-500); /* Standard di light */
  --clr-primary-bg: oklch(0.90 0.060 255 / 0.25);
}
```

---

## 📊 Moderation Severity Colors

Sistem moderasi menggunakan gradasi keparahan dari aman hingga kritis:

```css
--clr-severity-safe:       oklch(0.60 0.130 145);  /* Emerald — aman */
--clr-severity-low:        oklch(0.70 0.120 75);   /* Amber — rendah */
--clr-severity-medium:     oklch(0.65 0.150 50);   /* Orange — sedang */
--clr-severity-high:       oklch(0.60 0.150 30);   /* Red-orange — tinggi */
--clr-severity-critical:   oklch(0.55 0.165 25);   /* Ruby — kritis */
```

### Background Variations (untuk chip/badge)

```css
--clr-severity-safe-bg:       oklch(0.60 0.130 145 / 0.15);
--clr-severity-low-bg:        oklch(0.70 0.120 75 / 0.15);
--clr-severity-medium-bg:     oklch(0.65 0.150 50 / 0.15);
--clr-severity-high-bg:       oklch(0.60 0.150 30 / 0.15);
--clr-severity-critical-bg:   oklch(0.55 0.165 25 / 0.15);
```

---

## 🧪 Color Usage Decision Tree

```
Butuh warna untuk...
│
├── Surface / Background → Gunakan --clr-surface-* (base/elevated/overlay)
│
├── Text                 → Gunakan --clr-text-* (primary/secondary/tertiary)
│
├── Interactive element  → 
│   ├── Button utama     → --clr-primary, --clr-primary-hover
│   ├── Button danger    → --clr-ruby-500
│   ├── Link             → --clr-primary-400 (dark) / --clr-primary-600 (light)
│   └── Input focus      → --clr-primary ring
│
├── Status indicator     →
│   ├── Success          → --clr-emerald-* atau --clr-severity-safe
│   ├── Warning          → --clr-amber-* atau --clr-severity-low
│   ├── Error            → --clr-ruby-* atau --clr-severity-critical
│   └── Info             → --clr-cyan-*
│
├── Data visualization   → Gunakan palette chart (lihat patterns/07)
│
└── Moderation badge     → Gunakan --clr-severity-*
```

---

## ⚠️ Anti-Patterns (Yang Tidak Boleh Dilakukan)

### ❌ Hardcoded HEX/RGB
```css
/* ❌ JANGAN — tidak akan terpengaruh theme switching */
.notification-success {
  background: #d4edda;
  color: #155724;
}

/* ✅ Gunakan token semantic */
.notification-success {
  background: var(--clr-emerald-100);
  color: var(--clr-emerald-800);
}
```

### ❌ Langsung pakai Tailwind utility colors
```tsx
{/* ❌ JANGAN — hardcoded ke skema tertentu */}
<Badge className="bg-emerald-100 text-emerald-700" />

{/* ✅ Gunakan semantic variant */}
<Badge variant="success" />
```

### ❌ Mengabaikan kontras
```css
/* ❌ JANGAN — teks abu-abu di atas abu-abu */
.metadata {
  color: oklch(0.65 0.015 286); /* L=0.65 */
  background: oklch(0.70 0.010 286); /* L=0.70 — rasio ~1.1:1! */
}

/* ✅ Minimum kontras 3:1 untuk secondary text */
.metadata {
  color: oklch(0.50 0.020 286); /* L=0.50 */
  background: var(--clr-surface-base); /* L=0.11 */
  /* Rasio ~6:1 — aman */
}
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [OKLCH Color Picker](https://oklch.com/) | Visualisasi OKLCH color space |
| [WCAG Contrast Checker](https://webaim.org/resources/contrastchecker/) | Verifikasi kontras |
| [Material HCT](https://material.io/blog/science-of-color-design) | Hue-Chroma-Tone system |
| [Tailwind CSS OKLCH](https://tailwindcss.com/docs/colors#using-custom-colors) | Implementasi OKLCH |

---

*"Warna adalah ingatan yang tak pernah pudar — dibiaskan melalui prisma es Amphoreus."* ❄️🩵
