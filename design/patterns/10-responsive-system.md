# Responsive System — Shapeshifting Glass

> *"Content is like water — it should flow into whatever container it's poured into."*
> — Ethan Marcotte

---

## 🎯 Filosofi Responsif

BETE menggunakan pendekatan **mobile-first** dengan tiga prinsip:

1. **Content parity** — Konten yang sama di semua ukuran, layout yang berbeda
2. **Touch-optimized** — Target 44×44px minimum di mobile
3. **Progressive enhancement** — Desktop mendapat fitur tambahan (hover, sidebar, multi-column)

---

## 📐 Breakpoint System

```css
:root {
  --bp-sm:  640px;  /* Mobile landscape */
  --bp-md:  768px;  /* Tablet portrait */
  --bp-lg:  1024px; /* Tablet landscape / small desktop */
  --bp-xl:  1280px; /* Desktop */
  --bp-2xl: 1536px; /* Wide desktop */
}
```

### Layout Behavior Matrix

| Viewport | Sidebar | Header | Content Grid | Font Size |
|----------|---------|--------|-------------|-----------|
| < 640px | Bottom tab (56px) | Compact | 1 col | sm |
| 640-768 | Bottom tab | Compact | 1-2 col | sm |
| 768-1024 | Icon 64px | Standard | 2 col | base |
| 1024-1280 | Full 256px | Standard | 2-3 col | base |
| > 1280px | Full 256px | Full | 3-4 col | base+ |

---

## 📱 Mobile Adaptations

### Navigation
- **< 768px:** Bottom tab bar menggantikan sidebar
- **Tab icons:** Home, Live, Messages, Settings (maks 5 tabs)
- **Tab bar height:** 56px (dengan safe area padding untuk notched phones)

### Content
- **Cards:** Full-width (margin 16px), stacked vertical
- **Tables:** Horizontal scroll atau card view alternatif
- **Charts:** Simplified (less data points, larger labels)
- **Modals:** Full-screen drawer dari bawah (bottom sheet)

### Touch Targets
```css
/* Minimum 44×44px untuk semua interactive elements */
.button, .nav-item, .tab-item {
  min-height: 44px;
  min-width: 44px;
}

/* Forms on mobile */
.input, .select {
  height: 48px;  /* Larger tap target */
  font-size: 16px;  /* Prevent iOS zoom on focus */
}
```

---

## 💻 Desktop Adaptations

### Navigation
- **≥ 1024px:** Full sidebar (256px) dengan label teks
- **Sidebar states:** Collapsed (icon-only, 64px) ↔ Expanded (256px)
- **Keyboard shortcuts:** Didokumentasikan di help panel

### Content
- **Multi-column grids:** 2-4 columns depending on container width
- **Sticky elements:** Sidebar, header, filter bars
- **Hover previews:** Tooltips, popovers untuk informasi tambahan
- **Drag & drop:** Dukungan untuk reorder, upload area

---

## 🧩 Responsive Component Patterns

### Pattern 1: Responsive Card Grid

```css
.card-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: var(--sp-3);
}

@media (min-width: 640px) {
  .card-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (min-width: 1024px) {
  .card-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1280px) {
  .card-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}
```

### Pattern 2: Responsive Sidebar + Content

```tsx
function DashboardLayout() {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const isMobile = useMediaQuery('(max-width: 767px)');

  return (
    <div className="page-layout">
      {/* Mobile: slide-in drawer */}
      {isMobile && (
        <MobileTabBar activeTab={activeTab} onTabChange={setActiveTab} />
      )}

      {/* Desktop: persistent sidebar */}
      {!isMobile && (
        <Sidebar collapsed={sidebarCollapsed} onToggle={() => setSidebarCollapsed(!sidebarCollapsed)} />
      )}

      <main className="main-area">
        <Header onMenuClick={() => setMobileMenuOpen(true)} />
        <div className="content-area">
          {children}
        </div>
      </main>
    </div>
  );
}
```

### Pattern 3: Responsive Typography (Fluid)

```css
/* Fluid type scale — sudah didefinisikan di core/02-typography.md */
--fs-body: clamp(0.94rem, 0.94rem + 0.03vw, 1.00rem);
--fs-h2:   clamp(1.50rem, 1.50rem + 0.12vw, 1.88rem);
```

### Pattern 4: Container Queries (for reusable components)

```css
.card-grid-component {
  container-type: inline-size;
  container-name: card-list;
}

@container card-list (max-width: 400px) {
  .card-item { grid-template-columns: 1fr; }
}

@container card-list (min-width: 401px) {
  .card-item { grid-template-columns: 1fr 1fr; }
}
```

---

## 🎯 Responsive Decision Tree

```
Layout component →
├── Apakah ini navigasi?
│   ├── Mobile → Bottom tab bar (56px)
│   ├── Tablet → Icon sidebar (64px) + hamburger
│   └── Desktop → Full sidebar (256px)
│
├── Apakah ini konten list/grid?
│   ├── 1 item → Single column
│   ├── 2-4 items → 2 col (tablet), 3-4 col (desktop)
│   └── > 4 items → auto-fill grid with minmax
│
├── Apakah ini modal/dialog?
│   ├── Mobile → Bottom sheet (full width, 80% height)
│   └── Desktop → Centered modal (max-w-lg)
│
└── Apakah ini form?
    ├── Mobile → Stacked, full-width, larger inputs
    └── Desktop → Multi-column, side labels
```

---

## 📏 Responsive Spacing Scale

```css
.content-padding {
  padding: var(--sp-3);      /* Mobile: 16px */
}

@media (min-width: 768px) {
  .content-padding { padding: var(--sp-4); }  /* Tablet: 24px */
}

@media (min-width: 1024px) {
  .content-padding { padding: var(--sp-5); }  /* Desktop: 32px */
}
```

---

## 🧪 Testing Responsive Design

```typescript
// Test utility untuk responsive behavior
const VIEWPORTS = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1280, height: 800 },
  wide: { width: 1920, height: 1080 },
};

describe('DashboardLayout', () => {
  it('shows MobileTabBar on mobile', () => {
    cy.viewport(VIEWPORTS.mobile);
    cy.get('[data-testid="mobile-tab-bar"]').should('be.visible');
    cy.get('[data-testid="sidebar"]').should('not.be.visible');
  });

  it('shows sidebar on desktop', () => {
    cy.viewport(VIEWPORTS.desktop);
    cy.get('[data-testid="sidebar"]').should('be.visible');
    cy.get('[data-testid="mobile-tab-bar"]').should('not.be.visible');
  });
});
```

---

## ⚠️ Anti-Patterns Responsive

### ❌ Hanya media query untuk satu breakpoint
```css
/* ❌ JANGAN — hanya mobile dan desktop */
.panel { padding: 16px; }
@media (min-width: 1024px) { .panel { padding: 32px; } }

/* ✅ Gunakan fluid atau multiple breakpoints */
.panel { padding: clamp(16px, 3vw, 32px); }
```

### ❌ Hidden content on mobile
```tsx
// ❌ JANGAN — "out of sight, out of mind" tapi konten hilang
{isMobile ? null : <ExpensiveChart />}

// ✅ Simplified version untuk mobile
<Chart variant={isMobile ? 'compact' : 'full'} />
```

### ❌ Fixed width containers
```css
/* ❌ JANGAN — overflow on smaller screens */
.container { width: 1200px; }

/* ✅ Gunakan max-width + padding */
.container { max-width: 1200px; margin: 0 auto; padding: 0 var(--sp-4); }
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Every Layout](https://every-layout.dev/) | Reusable layout patterns |
| [Container Queries](https://developer.mozilla.org/en-US/docs/Web/CSS/CSS_container_queries) | CSS container queries |
| [Utopia.fyi](https://utopia.fyi/) | Fluid type & space calculator |

---

*"Layout adalah air yang mengalir — ia mengambil bentuk wadahnya tanpa kehilangan esensi."* ❄️🩵
