# Spatial System — The Architecture of Void

> *"Space is the breath of art."*
> — Frank Lloyd Wright, arsitek organik.

---

## 🎯 Filosofi Spasial

Ruang dalam BETE bukan sekadar "tempat kosong" — ia adalah **medium komunikasi visual**. Jarak antarelemen menyampaikan hubungan semantik:

- **Dekat** → Elemen terkait secara konseptual
- **Berjarak** → Elemen independen atau batch berbeda
- **Terpisah jauh** → Section baru, hierarki turun

Kita menggunakan **4px baseline grid** untuk semua keputusan spasial.

---

## 📐 Grid System: 8px × 4px Hybrid

BETE menggunakan sistem **8px untuk layout kasar**, **4px untuk fine-tuning**.

```css
:root {
  /* Base grid unit */
  --grid-unit: 4px;

  /* Spacing scale — exponential */
  --sp-0:   0px;
  --sp-0.5: calc(var(--grid-unit) * 1);   /* 4px  — micro spacing */
  --sp-1:   calc(var(--grid-unit) * 2);   /* 8px  — tight spacing */
  --sp-2:   calc(var(--grid-unit) * 3);   /* 12px — compact spacing */
  --sp-3:   calc(var(--grid-unit) * 4);   /* 16px — base spacing  ★ */
  --sp-4:   calc(var(--grid-unit) * 6);   /* 24px — relaxed spacing */
  --sp-5:   calc(var(--grid-unit) * 8);   /* 32px — section spacing */
  --sp-6:   calc(var(--grid-unit) * 12);  /* 48px — panel spacing */
  --sp-7:   calc(var(--grid-unit) * 16);  /* 64px — page spacing */
  --sp-8:   calc(var(--grid-unit) * 24);  /* 96px — hero spacing */
}
```

### Logic di Balik Scale

| Token | px | Konteks |
|-------|----|---------|
| `--sp-0.5` | 4px | Ikon-padding, badge spacing, dot indicators |
| `--sp-1` | 8px | Avatar-text gap, icon-button padding |
| `--sp-2` | 12px | Button padding, chip spacing, input padding |
| `--sp-3` | 16px | **Base unit** — card-padding, section margin, form gap |
| `--sp-4` | 24px | Card gap, panel padding, modal padding |
| `--sp-5` | 32px | Content area padding, desktop sidebar width |
| `--sp-6` | 48px | Page section gap, dashboards grid gap |
| `--sp-7` | 64px | Page padding desktop, hero spacing |
| `--sp-8` | 96px | Empty state height, large break sections |

---

## 🔲 Layout Components

### Page Layout (Desktop)

```
┌─────────────────────────────────────────────────────┐
│                      ┌── Header ──┐                  │ 56px
│                      └────────────┘                  │
│  ┌─ Sidebar ─┐  ┌────────── Main Content ──────────┐│
│  │           │  │  ┌─ Page Title ─────────────────┐ ││
│  │  icon grid │  │  │ Section Heading             │ ││
│  │  ────────  │  │  └─────────────────────────────┘ ││
│  │  nav-1     │  │                                   ││
│  │  nav-2     │  │  ┌────── Grid Area ─────────────┐ ││
│  │  nav-3     │  │  │  ┌── Card ──┐ ┌── Card ──┐  │ ││
│  │            │  │  │  │          │ │          │  │ ││
│  │  ────────  │  │  │  └──────────┘ └──────────┘  │ ││
│  │  mascot    │  │  │  ┌── Card ──┐ ┌── Card ──┐  │ ││
│  │            │  │  │  │          │ │          │  │ ││
│  └────────────┘  │  │  └──────────┘ └──────────┘  │ ││
│                  │  └───────────────────────────────┘ ││
│   w-64/          │      flex-1                        ││
│   w-16(icon)     │                                    ││
└─────────────────────────────────────────────────────┘
```

### Vue 3 Component Mapping

```tsx
// DashboardLayout.vue
<template>
  <div class="page-layout">
    <Sidebar :collapsed="sidebarCollapsed" />
    <main class="main-area">
      <Header />
      <div class="content-area">
        <slot />
      </div>
    </main>
  </div>
</template>
```

```css
.page-layout {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto 1fr;
  min-height: 100vh;
}

.sidebar {
  grid-row: 1 / -1;
  width: 256px; /* w-64 */
  transition: width var(--dur-normal) var(--ease-out-quint);
}
.sidebar.collapsed {
  width: 64px; /* w-16 */
}

.main-area {
  display: flex;
  flex-direction: column;
  min-width: 0; /* Prevent grid blowout */
  overflow: hidden;
}

.content-area {
  flex: 1;
  overflow-y: auto;
  padding: var(--sp-5);
}
```

---

## 🔳 Border Radius Scale

```css
--rd-none:  0px;
--rd-xs:    4px;    /* Checkbox, toggle, small indicators */
--rd-sm:    6px;    /* Input, button small, badges */
--rd-md:    8px;    /* Button default, card, modal */
--rd-lg:    12px;   /* Card elevated, sheets, panels */
--rd-xl:    16px;   /* Dialog, bottom sheet */
--rd-2xl:   20px;   /* Full-width cards on mobile */
--rd-full:  9999px; /* Pill, chip, avatar */
```

### Radius Decision Tree

```
Elemen interaktif?
├── Ya ─→ butuh affordance visual?
│   ├── Ya, utama (button, card clickable) → --rd-md (8px)
│   └── Tidak (chip, tag, avatar) → --rd-full (pill)
│
└── Tidak → container?
    ├── Dialog/modal → --rd-xl (16px)
    ├── Card dalam grid → --rd-lg (12px)
    └── Sheet/panel → --rd-xl atau --rd-2xl
```

---

## 🥞 Z-Index Registry (Formal)

```css
:root {
  --z-base:      0;
  --z-dropdown:  10;
  --z-sticky:    20;
  --z-header:    30;
  --z-sidebar:   40;
  --z-overlay:   50;    /* Mobile sidebar, backdrop */
  --z-modal:     60;    /* Dialog, confirm */
  --z-popover:   70;    /* Tooltip, popover, dropdown menu */
  --z-toast:     80;    /* Toast notification */
  --z-mascot:    100;   /* Mascot chatbot — highest */
}

/* Implementation */
.header      { z-index: var(--z-header); }
.sidebar     { z-index: var(--z-sidebar); }
.modal       { z-index: var(--z-modal); }
.toast       { z-index: var(--z-toast); }
.mascot-chat { z-index: var(--z-mascot); }
```

### Stacking Order

```
Layer        Value     Elemen
─────────────────────────────────────────────
Background   -1        ParticleBackground
Base          0        Layout, cards, text
Dropdown     10        Select options, context menu
Sticky       20        Sticky section headers
Header       30        Sticky page header
Sidebar      40        Desktop sidebar
Overlay      50        Backdrop, mobile drawer
Modal        60        Confirm dialog, modal
Popover      70        Tooltip, dropdown
Toast        80        Toast notifications
Mascot      100        Chatbot floating panel
```

---

## 📱 Responsive Breakpoints

```css
/* CSS Custom Properties for breakpoints */
:root {
  --bp-sm:  640px;
  --bp-md:  768px;
  --bp-lg:  1024px;
  --bp-xl:  1280px;
  --bp-2xl: 1536px;
}

/* Container max-width */
--container-sm:   640px;
--container-md:   768px;
--container-lg:   1024px;
--container-xl:   1280px;
```

### Layout Behavior per Breakpoint

| Breakpoint | Sidebar | Content Padding | Grid Columns |
|-----------|---------|-----------------|--------------|
| `<640px` | Bottom tab (56px) | `--sp-3` (16px) | 1 |
| `640–768px` | Bottom tab | `--sp-4` (24px) | 1 |
| `768–1024px` | Icon-only (64px) | `--sp-4` (24px) | 1–2 |
| `1024–1280px` | Full (256px) | `--sp-5` (32px) | 2–3 |
| `1280px+` | Full (256px) | `--sp-5` (32px) | 2–4 |

---

## 📦 Common Layout Patterns

### Card Grid

```css
.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: var(--sp-4);
}
```

### Two-Column Detail

```css
.two-column {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: var(--sp-4);
}

@media (max-width: 768px) {
  .two-column {
    grid-template-columns: 1fr;
  }
}
```

### Sidebar + Content (Live Panel)

```css
.live-layout {
  display: grid;
  grid-template-columns: 1fr 320px;  /* Content 1fr, sidebar fixed */
  gap: var(--sp-4);
}

@media (max-width: 1024px) {
  .live-layout {
    grid-template-columns: 1fr;  /* Stack on smaller screens */
  }
}

.live-sidebar {
  position: sticky;
  top: calc(56px + var(--sp-4)); /* Below header */
  max-height: calc(100vh - 56px - var(--sp-4) * 2);
  overflow-y: auto;
}
```

---

## 🧠 Container Queries (Modern Approach)

Untuk komponen yang reusable di berbagai konteks:

```css
.card-grid-component {
  container-type: inline-size;
  container-name: card-grid;
}

@container card-grid (max-width: 400px) {
  .card-item {
    grid-template-columns: 1fr;  /* Single column di container kecil */
  }
}

@container card-grid (min-width: 401px) {
  .card-item {
    grid-template-columns: 1fr 1fr;
  }
}
```

---

## ⚠️ Anti-Patterns Spasial

### ❌ Margin collapse tanpa sengaja
```css
/* ❌ JANGAN — flex gap jauh lebih aman */
.card + .card { margin-top: 16px; }  /* Rawan collapse */

/* ✅ Gunakan gap */
.card-grid { display: flex; flex-direction: column; gap: var(--sp-4); }
```

### ❌ Padding tidak konsisten
```css
/* ❌ JANGAN — setiap file punya padding sendiri */
.page-a { padding: 20px; }
.page-b { padding: 24px; }

/* ✅ Gunakan spacing token */
.page { padding: var(--sp-5); }
```

### ❌ Grid blowout (min-width tanpa min-width: 0)
```css
/* ❌ JANGAN — grid item dengan teks panjang mendorong layout */
.grid-item { overflow: visible; }

/* ✅ Cegah blowout */
.grid-item { min-width: 0; overflow: hidden; }
```

---

*"Ruang adalah kanvas tempat ingatan menari — setiap piksel memiliki tempatnya."* ❄️🩵
