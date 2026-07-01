# Theme Architecture — The Chameleon Engine

> *"The only constant in design is change — a theme system embraces it."*
> — Unknown

---

## 🎯 Filosofi Theme

Sistem theme BETE dibangun di atas **CSS Custom Properties**:
1. **Separation of value from token** — Nilai warna tidak pernah dirujuk langsung
2. **Single source of truth** — Satu set CSS variables, dua tema (dark/light)
3. **Runtime switching** — Tema bisa diganti tanpa reload
4. **Component-agnostic** — Komponen tidak tahu tema apa yang aktif

---

## 🧬 Theme Architecture

```
CSS Custom Properties (oklch values)
        │
        ▼
┌─────────────────────────────────────┐
│         :root / [data-theme]        │  ← Tema didefinisikan di level root
│  --clr-surface-base: oklch(...)     │
│  --clr-primary: oklch(...)          │
│  --clr-text: oklch(...)             │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│     Tailwind Config Mapping         │  ← Map CSS vars ke Tailwind utilities
│  colors: {                          │
│    background: "oklch(var(--...))"  │
│  }                                  │
└──────────────┬──────────────────────┘
               │
               ▼
┌─────────────────────────────────────┐
│        Component Styles             │  ← Komponen pakai Tailwind/CSS vars
│  <div className="bg-card" />        │
│  .card { background: var(--clr..) } │
└─────────────────────────────────────┘
```

---

## 🌗 Theme Definitions

### Dark Theme (Default)

```css
[data-theme="dark"] {
  /* Surfaces */
  --clr-surface-base:     oklch(0.11 0.010 286);
  --clr-surface-elevated: oklch(0.14 0.015 286);
  --clr-surface-overlay:  oklch(0.17 0.020 286);
  --clr-surface-sunken:   oklch(0.08 0.005 286);
  --clr-border:           oklch(0.22 0.020 286);

  /* Text */
  --clr-text:             oklch(0.95 0.005 286);
  --clr-text-secondary:   oklch(0.70 0.015 286);
  --clr-text-tertiary:    oklch(0.50 0.020 286);
  --clr-text-inverse:     oklch(0.11 0.010 286);

  /* Brand - brighter in dark */
  --clr-primary:          oklch(0.62 0.150 255);
  --clr-primary-bg:       oklch(0.25 0.060 255 / 0.20);
  --clr-primary-400:      oklch(0.62 0.150 255);
  --clr-primary-500:      oklch(0.55 0.175 255);
  --clr-primary-600:      oklch(0.47 0.160 255);

  /* Interactive */
  --clr-interactive-hover:   oklch(0.20 0.025 286);
  --clr-interactive-active:  oklch(0.24 0.030 286);
  --clr-interactive-selected: oklch(0.25 0.060 255 / 0.15);

  /* Shadows */
  --sh-card:    0 2px 8px rgba(0, 0, 0, 0.3);
  --sh-hover:   0 4px 16px rgba(0, 0, 0, 0.4);
  --sh-elevated: 0 8px 32px rgba(0, 0, 0, 0.5);
  --sh-modal:   0 16px 48px rgba(0, 0, 0, 0.6);

  /* Glass */
  --glass-bg:     oklch(0.15 0.015 286 / 0.60);
  --glass-border: oklch(0.25 0.030 286 / 0.20);
}
```

### Light Theme

```css
[data-theme="light"] {
  /* Surfaces */
  --clr-surface-base:     oklch(0.97 0.002 286);
  --clr-surface-elevated: oklch(1.00 0.000 286);
  --clr-surface-overlay:  oklch(0.95 0.003 286);
  --clr-surface-sunken:   oklch(0.92 0.004 286);
  --clr-border:           oklch(0.87 0.005 286);

  /* Text */
  --clr-text:             oklch(0.11 0.010 286);
  --clr-text-secondary:   oklch(0.50 0.020 286);
  --clr-text-tertiary:    oklch(0.70 0.025 286);
  --clr-text-inverse:     oklch(0.97 0.005 286);

  /* Brand - standard in light */
  --clr-primary:          oklch(0.55 0.175 255);
  --clr-primary-bg:       oklch(0.90 0.060 255 / 0.25);
  --clr-primary-400:      oklch(0.55 0.175 255);
  --clr-primary-500:      oklch(0.47 0.160 255);
  --clr-primary-600:      oklch(0.40 0.140 255);

  /* Interactive */
  --clr-interactive-hover:   oklch(0.90 0.005 286);
  --clr-interactive-active:  oklch(0.85 0.008 286);
  --clr-interactive-selected: oklch(0.90 0.060 255 / 0.3);

  /* Shadows — lighter in light theme */
  --sh-card:    0 2px 8px rgba(0, 0, 0, 0.08);
  --sh-hover:   0 4px 16px rgba(0, 0, 0, 0.12);
  --sh-elevated: 0 8px 24px rgba(0, 0, 0, 0.08);
  --sh-modal:   0 16px 48px rgba(0, 0, 0, 0.12);

  /* Glass — lighter opacity */
  --glass-bg:     oklch(0.97 0.002 286 / 0.50);
  --glass-border: oklch(0.87 0.005 286 / 0.30);
}
```

---

## 🔄 Theme Switching

### React Implementation

```tsx
// hooks/useTheme.ts
type Theme = 'light' | 'dark';

function useTheme() {
  const [theme, setTheme] = useState<Theme>(() => {
    // 1. Check localStorage
    const stored = localStorage.getItem('theme');
    if (stored === 'light' || stored === 'dark') return stored;

    // 2. Check system preference
    return window.matchMedia('(prefers-color-scheme: light)').matches
      ? 'light'
      : 'dark';
  });

  useEffect(() => {
    // Apply theme to document
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);

    // Toggle Tailwind dark class
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  const toggle = useCallback(() => {
    setTheme(prev => prev === 'dark' ? 'light' : 'dark');
  }, []);

  return { theme, setTheme, toggle } as const;
}
```

### Scream-Free Architecture

Theme switching **tidak perlu re-render seluruh komponen**. Karena CSS variables diubah di `:root`, browser secara otomatis me-repain semua elemen yang menggunakan var tersebut.

---

## 🎯 Token Mapping Rules

| Design Token | CSS Variable | Tailwind Mapping |
|-------------|-------------|------------------|
| Page background | `--clr-surface-base` | `bg-background` |
| Card surface | `--clr-surface-elevated` | `bg-card` |
| Body text | `--clr-text` | `text-foreground` |
| Secondary text | `--clr-text-secondary` | `text-muted-foreground` |
| Primary button | `--clr-primary` | `bg-primary` |
| Primary text on button | `--clr-text-on-primary` | `text-primary-foreground` |
| Border | `--clr-border` | `border-border` |
| Card shadow | `--sh-card` | `shadow-sm` |

---

## 🎨 System Theme (prefers-color-scheme)

```css
/* Default: dark */
:root { /* dark variables */ }

/* System light */
@media (prefers-color-scheme: light) {
  :root { /* light variables */ }
}

/* Manual override via data-theme */
[data-theme="dark"] { /* dark variables */ }
[data-theme="light"] { /* light variables */ }
```

**Priority:**
1. `data-theme` attribute (manual override) — **highest**
2. `prefers-color-scheme` (system) — **medium**
3. Default (dark) — **fallback**

---

## 📦 Theme-aware Component Pattern

```tsx
// Komponen tidak perlu tahu theme — cukup pakai CSS vars
function ThemeAwareCard() {
  return (
    <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
      {/* Konten — styling otomatis berubah sesuai theme */}
    </div>
  );
}
```

### Dark-mode Specific Adjustments

```css
/* Hanya untuk theme dark */
[data-theme="dark"] .particle-orbs {
  opacity: 0.6;
}

/* Hanya untuk theme light */
[data-theme="light"] .particle-orbs {
  opacity: 0.3;
}
```

---

## ⚠️ Theme Anti-Patterns

### ❌ Color hardcoding
```css
/* ❌ JANGAN — tidak akan berubah saat theme switch */
.card { background: #1e1e2e; }

/* ✅ CSS variable — otomatis mengikuti theme */
.card { background: var(--clr-surface-elevated); }
```

### ❌ Theme-specific logic in components
```tsx
// ❌ JANGAN — komponen tahu soal theme
function Card() {
  const { theme } = useTheme();
  return <div className={theme === 'dark' ? 'bg-gray-800' : 'bg-white'} />;
}

// ✅ Komponen tidak perlu tahu — CSS vars handle semua
function Card() {
  return <div className="bg-card" />;
}
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [CSS Custom Properties](https://developer.mozilla.org/en-US/docs/Web/CSS/Using_CSS_custom_properties) | CSS vars |
| [prefers-color-scheme](https://developer.mozilla.org/en-US/docs/Web/CSS/@media/prefers-color-scheme) | System theme |
| [OKLCH in CSS](https://evilmartians.com/chronicles/oklch-in-css-why-quit-rgb-hsl) | Color space |

---

*"Tema adalah kulit yang berganti — esensi tetap sama, wajah yang baru."* ❄️🩵
