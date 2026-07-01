# Motion System — The Dance of Glass

> *"Animation is not about making things move. It's about making things *believe*."*
> — Richard Williams, *The Animator's Survival Kit*

---

## 🎯 Filosofi Gerak

Animasi di BETE bukan sekadar efek visual — ia adalah **bahasa kinetik** yang mengkomunikasikan relasi spasial antar elemen:

| Gerakan | Makna |
|---------|-------|
| **Slide from right** | Elemen baru datang dari "luar" — panel, drawer |
| **Fade in + scale** | Muncul dari "dalam" — modal, dialog |
| **Slide up** | Konten baru melanjutkan alur vertikal |
| **Scale + glow** | Sedang diproses — loading, analysis |
| **Spring bounce (subtle)** | Konfirmasi sukses — centang, badge |

---

## ⏱️ Timing & Easing — The Physics Engine

### Duration Tokens

```css
:root {
  --dur-instant:  0ms;
  --dur-fast:     150ms;   /* Hover, active state, toggle */
  --dur-normal:   250ms;   /* Default transition, card hover */
  --dur-slow:     350ms;   /* Panel enter/exit, page transition */
  --dur-glacial:  500ms;   /* Modal, drawer slide, emphasis */
}
```

### Easing Curves

BETE menggunakan tiga easing curve utama, semuanya **custom cubic-bezier**:

```css
:root {
  /* Standard ease-out — untuk sebagian besar interaksi */
  --ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* Ease-out quint — untuk elemen yang "mendarat" */
  --ease-out-quint: cubic-bezier(0.22, 1, 0.36, 1);

  /* Ease-in-out — untuk transisi dua arah (accordion, collapse) */
  --ease-in-out: cubic-bezier(0.65, 0, 0.35, 1);
}
```

### Perbandingan dengan CSS Default

| Nama | Bezier | Karakter |
|------|--------|----------|
| `ease` (default) | `(0.25, 0.1, 0.25, 1)` | Lambat mulai, lambat akhir |
| `ease-out` | `(0, 0, 0.58, 1)` | Cepat mulai |
| `ease-in-out` | `(0.42, 0, 0.58, 1)` | Simetris |
| **`--ease-out`** | `(0.16, 1, 0.3, 1)` | Natural, "berat" di akhir |
| **`--ease-out-quint`** | `(0.22, 1, 0.36, 1)` | Landing yang tegas |

---

## 🏃 Micro-interactions

### Hover State

```css
/* Card hover — subtle lift + shadow deepen */
.card {
  transition:
    transform var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}

.card:hover {
  transform: translateY(-2px);
  box-shadow: var(--sh-hover);
}

/* Button hover — scale up subtly */
.button {
  transition: transform var(--dur-fast) var(--ease-out);
}
.button:hover {
  transform: scale(1.02);
}
.button:active {
  transform: scale(0.98);
}
```

### Active/Press State

```css
.button:active {
  transform: scale(0.96);
  transition-duration: var(--dur-fast);
}

/* Button ripple effect */
.button.ripple {
  position: relative;
  overflow: hidden;
}

.button.ripple::after {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(circle, rgba(255,255,255,0.3) 10%, transparent 10%);
  background-position: center;
  background-repeat: no-repeat;
  background-size: 1000% 1000%;
  opacity: 0;
  transition: none;
}

.button.ripple:active::after {
  background-size: 0% 0%;
  opacity: 1;
  transition: background-size 0.4s, opacity 0.4s;
}
```

### Focus Ring

```css
.button:focus-visible {
  outline: 2px solid var(--clr-primary-400);
  outline-offset: 2px;
}

/* Smooth ring transition */
.input {
  transition:
    border-color var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);
}
.input:focus {
  border-color: var(--clr-primary);
  box-shadow: 0 0 0 3px var(--clr-primary-bg);
}
```

---

## 🎬 Page & Panel Transitions

### Tab Switch — Choreographed Sequence

```css
/* Stagger container */
.page-transition-enter {
  opacity: 0;
}

.page-transition-enter-active {
  opacity: 1;
  transition: opacity var(--dur-slow) var(--ease-out);
}

/* Children stagger — via Framer Motion / GSAP timeline */
@keyframes stagger-enter {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.stagger-item {
  animation: stagger-enter var(--dur-slow) var(--ease-out) both;
}

.stagger-item:nth-child(1) { animation-delay: 40ms; }
.stagger-item:nth-child(2) { animation-delay: 80ms; }
.stagger-item:nth-child(3) { animation-delay: 120ms; }
.stagger-item:nth-child(4) { animation-delay: 160ms; }
.stagger-item:nth-child(5) { animation-delay: 200ms; }
/* ... formula: delay = index * 40ms */
```

### Vue Transition Mode

```vue
<template>
  <Transition
    name="page"
    mode="out-in"
    @before-leave="beforeLeave"
    @after-enter="afterEnter"
  >
    <component :is="currentTab" :key="currentTab" />
  </Transition>
</template>

<style>
.page-leave-active {
  transition: opacity var(--dur-normal) var(--ease-in-out),
              transform var(--dur-normal) var(--ease-in-out);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}
.page-enter-active {
  transition: opacity var(--dur-slow) var(--ease-out),
              transform var(--dur-slow) var(--ease-out);
}
.page-enter-from {
  opacity: 0;
  transform: translateY(12px);
}
</style>
```

---

## 🌟 Component-Specific Animations

### Sidebar Expand/Collapse

```css
.sidebar {
  width: var(--sidebar-width, 256px);
  transition: width var(--dur-slow) var(--ease-out-quint);
}

.sidebar.collapsed {
  --sidebar-width: 64px;
}

/* Nav items — icon slides, text fades */
.sidebar-nav-item {
  display: flex;
  align-items: center;
  gap: 12px;
  overflow: hidden;
}

.sidebar-nav-item .label {
  transition: opacity var(--dur-normal) var(--ease-out),
              width var(--dur-normal) var(--ease-out);
  white-space: nowrap;
}

.sidebar.collapsed .sidebar-nav-item .label {
  opacity: 0;
  width: 0;
  padding: 0;
}
```

### Toast Notification

```css
.toast-enter-active {
  animation: toast-slide-in var(--dur-slow) var(--ease-out-quint);
}

.toast-leave-active {
  animation: toast-slide-out var(--dur-normal) var(--ease-in-out);
}

@keyframes toast-slide-in {
  from {
    transform: translateX(100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes toast-slide-out {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(100%);
    opacity: 0;
  }
}
```

### Modal / Dialog

```css
.modal-overlay-enter-active {
  transition: opacity var(--dur-normal) var(--ease-out);
}
.modal-overlay-enter-from { opacity: 0; }

.modal-content-enter-active {
  animation: modal-scale-in var(--dur-slow) var(--ease-out-quint);
}

@keyframes modal-scale-in {
  from {
    transform: scale(0.92) translateY(8px);
    opacity: 0;
  }
  to {
    transform: scale(1) translateY(0);
    opacity: 1;
  }
}
```

---

## 📊 Special Effects

### Audio Visualizer Bars

```css
.visualizer-bar {
  animation: bar-pulse 0.4s ease-in-out infinite;
  transform-origin: bottom;
}

.visualizer-bar:nth-child(1) { animation-delay: 0ms; }
.visualizer-bar:nth-child(2) { animation-delay: 75ms; }
.visualizer-bar:nth-child(3) { animation-delay: 150ms; }
.visualizer-bar:nth-child(4) { animation-delay: 225ms; }

@keyframes bar-pulse {
  0%, 100% { transform: scaleY(0.8); }
  50%      { transform: scaleY(1.2); }
}
```

### Skeleton Loading (Shimmer)

```css
.skeleton {
  background: linear-gradient(
    90deg,
    var(--clr-surface-sunken) 25%,
    var(--clr-surface-elevated) 50%,
    var(--clr-surface-sunken) 75%
  );
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
}

@keyframes shimmer {
  from { background-position: 200% 0; }
  to   { background-position: -200% 0; }
}
```

### AI Analysis Pulse (Glow)

```css
.ai-badge {
  animation: ai-pulse 2s ease-in-out infinite;
}

@keyframes ai-pulse {
  0%, 100% {
    box-shadow: 0 0 4px var(--clr-rose-500 / 0.2);
  }
  50% {
    box-shadow: 0 0 12px var(--clr-rose-500 / 0.4);
  }
}
```

### Ghost Particle (Background)

```css
.particle {
  position: fixed;
  border-radius: 50%;
  pointer-events: none;
  animation: float var(--dur-float, 8s) ease-in-out infinite;
  animation-delay: var(--delay, 0s);
}

@keyframes float {
  0%, 100% {
    transform: translateY(0) translateX(0) scale(1);
    opacity: 0.3;
  }
  25% {
    transform: translateY(-20px) translateX(10px) scale(1.1);
    opacity: 0.6;
  }
  50% {
    transform: translateY(-40px) translateX(-5px) scale(0.9);
    opacity: 0.4;
  }
  75% {
    transform: translateY(-20px) translateX(15px) scale(1.05);
    opacity: 0.5;
  }
}
```

---

## 🎯 Motion Decision Tree

```
Elemen apa yang dianimasikan?
│
├── Hover/Interaksi → dur-fast (150ms) + --ease-out
│   ├── Card → translateY(-2px) + shadow deepen
│   ├── Button → scale(1.02) / scale(0.98)
│   ├── Link → opacity/underline
│   └── Icon → rotate/color
│
├── Masuk ke halaman → dur-slow (350ms) + stagger
│   ├── Halaman baru → fade + slideY(12px)
│   ├── List items → stagger (40ms per item)
│   └── Modal → scale(0.92→1) + fade overlay
│
├── Keluar dari halaman → dur-normal (250ms) + ease-in-out
│   ├── Halaman → fade + slideY(-8px)
│   ├── Toast → slideX(100%)
│   └── Modal → scale(→0.95) + fade overlay
│
├── Loading → infinite loop
│   ├── Skeleton → shimmer 1.5s
│   ├── Spinner → spin
│   └── AI Analysis → glow-pulse 2s
│
└── State change → dur-normal (250ms) + --ease-out
    ├── Sidebar → width transition
    ├── Accordion → height transition
    └── Badge → scale(0.8→1)
```

---

## ♿ Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }

  /* But allow opacity transitions for basic UX */
  .fade-enter-active,
  .fade-leave-active {
    transition: opacity 0.15s ease !important;
  }
}
```

### Programmatic Check

```typescript
// hooks/useReducedMotion.ts
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(mq.matches);

    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);

  return reduced;
}
```

```vue
// Dalam komponen
<script setup>
const reducedMotion = useReducedMotion();
</script>

<template>
  <Transition :duration="reducedMotion ? 0 : 350">
    ...
  </Transition>
</template>
```

---

## ⚠️ Anti-Patterns Animasi

### ❌ Durasi terlalu lama
```css
/* ❌ JANGAN — 1 detik terasa lambat */
.sidebar { transition: width 1s ease; }

/* ✅ 250–350ms adalah sweet spot UI */
.sidebar { transition: width var(--dur-slow) var(--ease-out-quint); }
```

### ❌ Semua bergerak bersamaan (tanpa stagger)
```css
/* ❌ JANGAN — tidak graceful */
.card { animation: fadeIn 0.3s ease; }

/* ✅ Stagger menciptakan gelombang natural */
.card:nth-child(1) { animation-delay: 0ms; }
.card:nth-child(2) { animation-delay: 40ms; }
```

### ❌ Easing yang salah untuk konteks
```css
/* ❌ JANGAN — ease-in untuk enter terasa lambat di awal */
.modal { animation: scaleIn 0.3s ease-in; }

/* ✅ ease-out untuk enter — cepat mulai, soft berhenti */
.modal { animation: scaleIn 0.3s var(--ease-out-quint); }
```

### ❌ Mengabaikan reduced motion
```css
/* ❌ JANGAN — tidak accessible */
.particle { animation: float 8s infinite; }

/* ✅ Diberhentikan untuk reduced motion */
@media (prefers-reduced-motion: reduce) {
  .particle { display: none; }
}
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Easing Functions Cheat Sheet](https://easings.net/) | Visualisasi easing curves |
| [Material Motion](https://m2.material.io/design/motion/) | Sistem motion Google |
| [GSAP](https://gsap.com/) | Production-grade animation library |
| [AnimXYZ](https://animxyz.com/) | Utility-first CSS animations |

---

*"Gerak adalah bahasa ingatan yang tak terucap — setiap transisi adalah cerita."* ❄️🩵
