# BETE Design System — Master Index

> *"A design system is not a collection of components. It's a collection of decisions."*
> — Menenun takdir visual untuk IMPHNEN, di atas kanvas Amphoreus.

---

## 🌌 Filosofi: The Three Pillars

### 1. **Glass & Light** — Estetika Transparan
Kita membangun bukan dengan tembok beton visual, tapi dengan **lapisan kaca yang meneruskan cahaya**. Setiap komponen adalah panele kaca buram (frosted glass) yang:
- Menampilkan depth melalui **backdrop blur** dan **layering opacity**
- Menggunakan **light sebagai material** — glow, shadow, highlight sebagai indikator state
- Memberi kesan **ruang tiga dimensi** di antarmuka dua dimensi

### 2. **Fluid Motion** — Gerak yang Bermakna
Animasi bukan hiasan — ia adalah **bahasa spasial** yang memberitahu pengguna:
- *"Dari mana elemen ini datang?"* → Transisi masuk
- *"Ke mana ia pergi?"* → Transisi keluar  
- *"Apa yang terjadi?"* → Feedback mikro (hover, klik, state change)
- Semua gerak mengikuti **easing curve** yang konsisten (lihat `core/04-motion-system.md`)

### 3. **Spatial Memory** — Ingatan Visual
Seperti ingatan Amphoreus yang abadi, antarmuka kita harus:
- **Konsisten** — warna, spacing, tipografi yang sama di setiap sudut
- **Prediktif** — pengguna tahu di mana mencari sesuatu
- **Responsif** — beradaptasi tanpa kehilangan identitas

---

## 📂 Struktur Documentasi

```
design/
├── _index.md                    ← Kamu di sini
│
├── core/                        ← Fondasi design token
│   ├── 01-color-system.md       ← Sistem warna (OKLCH + HCT + semantic tokens)
│   ├── 02-typography.md         ← Tipografi (type scale + font system + rhythm)
│   ├── 03-spatial-system.md     ← Grid, spacing, layout tokens
│   ├── 04-motion-system.md      ← Animasi physics & choreography
│   └── 05-component-architecture.md ← Arsitektur komponen
│
├── patterns/                    ← Pola desain reusable
│   ├── 06-interaction-patterns.md    ← Micro-interactions
│   ├── 07-data-visualization.md      ← Charts & metrics
│   ├── 08-moderation-ui.md           ← Moderation UI patterns
│   ├── 09-state-machines.md          ← Loading/empty/error states
│   └── 10-responsive-system.md       ← Breakpoints & layout system
│
├── services/                    ← Per-service design guidelines
│   ├── 11-frontend-ui.md             ← Web frontend (React/Tailwind)
│   ├── 12-backend-api-guidelines.md  ← REST/WS API design
│   └── 13-gateway-event-design.md    ← Discord Gateway event schemas
│
├── system/                      ← Sistem lintas service
│   ├── 14-accessibility.md           ← Aksesibilitas (a11y)
│   ├── 15-theme-architecture.md      ← Theme engine & CSS custom properties
│   └── 16-sound-design.md            ← Audio feedback system
│
└── assets/                      ← Diagram, ilustrasi, referensi visual
    └── (future: SVG assets, figma exports, reference images)
```

---

## 🔗 Dependency Graph (Wajib Dibaca Berurutan)

```
01-color-system ──────────────────────────────────────────┐
     │                                                     │
     ├──→ 02-typography ──────────────────────────────┐   │
     │        │                                        │   │
     │        └──→ 03-spatial-system ──────────────┐   │   │
     │                  │                           │   │   │
     │                  └──→ 04-motion-system ──┐   │   │   │
     │                            │             │   │   │   │
     │                            └──→ 05-component-architecture
     │                                        │
     └────────────────────────────────────────┴──→ 06-interaction-patterns
                                                       │
                                                       ├──→ 07-data-visualization
                                                       ├──→ 08-moderation-ui
                                                       ├──→ 09-state-machines
                                                       └──→ 10-responsive-system
                                                                │
                          ┌─────────────────────────────────────┴──┐
                          ↓                                        ↓
              11-frontend-ui                              12-backend-api-guidelines
                                                                │
                                                         13-gateway-event-design
                                                                │
                          ┌─────────────────────────────────────┘
                          ↓
              14-accessibility ──→ 15-theme-architecture ──→ 16-sound-design
```

**Bacaan yang disarankan:**
1. Mulai dengan `core/01-color-system.md` — karena warna adalah keputusan desain paling fundamental.
2. Lanjut ke `core/02-typography.md` dan `core/03-spatial-system.md` untuk fondasi layout.
3. `core/04-motion-system.md` dan `core/05-component-architecture.md` sebagai jembatan ke pola.
4. Pola-pola di `patterns/` bisa dibaca sesuai kebutuhan fitur.
5. `services/` dan `system/` dibaca terakhir, bergantung pada layer yang sedang dikerjakan.

---

## 📐 Prinsip Desain Utama

| Prinsip | Deskripsi | Contoh Penerapan |
|---------|-----------|------------------|
| **Glassmorphism** | Latar belakang transparan dengan efek blur untuk hierarki visual | Card, Sidebar, Modal |
| **Monochromatic Depth** | Satu rona warna dengan variasi lightness untuk depth | Sistem warna OKLCH |
| **Kinetic Language** | Gerakan sebagai komunikasi spasial | Transisi tab, notifikasi |
| **Gaussian Memory** | Elemen yang "diingat" posisinya antar navigasi | Sidebar state, scroll position |
| **Sound as Feedback** | Audio sebagai layer konfirmasi non-visual | Moderasi alert, koneksi voice |
| **Progressive Disclosure** | Informasi kompleks diungkap bertahap | Detail panel, analytics drill-down |
| **Forgiving Layout** | Layout yang toleran terhadap konten kosong/error | Empty states, error boundaries |

---

## 🚀 Quick Reference: Token Categories

| Kategori | Prefix CSS | Contoh |
|----------|-----------|--------|
| Warna | `--clr-*` | `--clr-primary`, `--clr-surface` |
| Spacing | `--sp-*` | `--sp-xs`, `--sp-md`, `--sp-xl` |
| Typography | `--fs-*`, `--fw-*`, `--lh-*` | `--fs-body`, `--fw-semibold` |
| Radius | `--rd-*` | `--rd-sm`, `--rd-full` |
| Shadow | `--sh-*` | `--sh-card`, `--sh-modal` |
| Z-index | `--z-*` | `--z-header`, `--z-modal` |
| Timing | `--dur-*` | `--dur-fast`, `--dur-slow` |
| Easing | `--ease-*` | `--ease-out`, `--ease-spring` |

---

## 🧭 Status Documentasi

| Dokumen | Status | Prioritas |
|---------|--------|-----------|
| `core/01-color-system.md` | ✅ Selesai | P0 |
| `core/02-typography.md` | ✅ Selesai | P0 |
| `core/03-spatial-system.md` | ✅ Selesai | P0 |
| `core/04-motion-system.md` | ✅ Selesai | P0 |
| `core/05-component-architecture.md` | ✅ Selesai | P0 |
| `patterns/06-interaction-patterns.md` | ✅ Selesai | P0 |
| `patterns/07-data-visualization.md` | ✅ Selesai | P1 |
| `patterns/08-moderation-ui.md` | ✅ Selesai | P1 |
| `patterns/09-state-machines.md` | ✅ Selesai | P0 |
| `patterns/10-responsive-system.md` | ✅ Selesai | P0 |
| `services/11-frontend-ui.md` | ✅ Selesai | P0 |
| `services/12-backend-api-guidelines.md` | ✅ Selesai | P1 |
| `services/13-gateway-event-design.md` | ✅ Selesai | P1 |
| `system/14-accessibility.md` | ✅ Selesai | P0 |
| `system/15-theme-architecture.md` | ✅ Selesai | P1 |
| `system/16-sound-design.md` | ✅ Selesai | P1 |

---

*"Ingatan kita akan tetap abadi, takkan pernah mencair..."* ❄️🩵

© 2026 IMPHNEN — BETE Design System v2.0
