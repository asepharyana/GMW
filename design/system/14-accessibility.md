# Accessibility — Design for Everyone

> *"The power of the Web is in its universality. Access by everyone regardless of disability is an essential aspect."*
> — Tim Berners-Lee

---

## 🎯 Filosofi Aksesibilitas

BETE dirancang untuk **inklusif sejak awal**, bukan retrofit:

1. **Semantic HTML** — Struktur sebelum style
2. **Color-independent** — Informasi tidak hanya disampaikan lewat warna
3. **Keyboard-first** — Semua fitur bisa diakses tanpa mouse
4. **Reduced motion** — Animasi opsional, bukan wajib

---

## 🏆 Target Compliance

| Level | Target | Verification |
|-------|--------|--------------|
| WCAG 2.1 AA | ✅ Mandatory | Automated + manual |
| WCAG 2.1 AAA | ⭐ Recommended | Manual audit |
| Section 508 | ✅ Mandatory | Automated |
| EN 301 549 | ✅ Mandatory | EU compliance |

---

## 🎨 Color Accessibility

### Contrast Ratios Minimum

| Elemen | Teks Normal | Teks Large (≥18px / ≥14px bold) |
|--------|-------------|----------------------------------|
| Body text | 4.5:1 (AA) | 3:1 (AA) |
| UI text (label, badge) | 4.5:1 (AA) | 3:1 (AA) |
| Placeholder | 3:1 (AA large) | — |
| Disabled | 3:1 | 3:1 |

### Color Blindness

- Jangan gunakan **merah-hijau** sebagai satu-satunya pembeda
- Tambahkan **ikon, pola, atau label teks** sebagai secondary encoding
- Gunakan palette color-blind safe (lihat `01-color-system.md`)

```typescript
// Tool: verifikasi kontras otomatis di tests
function checkContrast(foreground: string, background: string): boolean {
  const fg = parseOklch(foreground);
  const bg = parseOklch(background);
  return getContrastRatio(fg, bg) >= 4.5;
}
```

---

## ⌨️ Keyboard Navigation

### Focus Order

```html
<!-- ✅ Semantic order = visual order -->
<nav>     <!-- Tab 1 -->
<main>    <!-- Tab 2 -->
  <h1>    <!-- Tab 3 -->
  <p>     <!-- Tab 4 -->
  <button><!-- Tab 5 -->
</main>
<footer>  <!-- Tab 6 -->
```

### Focus Indicators

```css
/* Custom focus ring — lebih visible dari browser default */
:focus-visible {
  outline: 2px solid var(--clr-primary-400);
  outline-offset: 2px;
  border-radius: var(--rd-sm);
}

/* ⚠️ NEVER do this */
:focus { outline: none; }  /* Membuat keyboard users buta */
```

### Keyboard Shortcuts

```
Tab / Shift+Tab   — Navigate forward/backward
Enter / Space     — Activate element
Escape            — Close modal/dropdown/menu
Arrow keys        — Navigate list, tabs, select
Ctrl+K            — Command palette
```

### Skip Navigation

```html
<!-- First focusable element on page -->
<a href="#main-content" class="skip-link">
  Skip to main content
</a>
```

```css
.skip-link {
  position: absolute;
  top: -100%;
  left: 8px;
  padding: 8px 16px;
  background: var(--clr-primary);
  color: var(--clr-text-on-primary);
  z-index: 9999;
}

.skip-link:focus {
  top: 8px;
}
```

---

## 🏗️ Semantic HTML Structure

```html
<!-- Dashboard page template -->
<header role="banner">
  <nav role="navigation" aria-label="Main navigation">
    <ul>
      <li><a href="/live" aria-current="page">Live</a></li>
      <li><a href="/messages">Messages</a></li>
      <li><a href="/settings">Settings</a></li>
    </ul>
  </nav>
</header>

<main id="main-content" role="main">
  <h1>Live Dashboard</h1>

  <section aria-labelledby="voice-status">
    <h2 id="voice-status">Voice Connections</h2>
    <!-- voice content -->
  </section>

  <section aria-labelledby="active-speakers">
    <h2 id="active-speakers">Active Speakers</h2>
    <ul role="list" aria-label="Currently speaking users">
      <li role="listitem">User 1</li>
      <li role="listitem">User 2</li>
    </ul>
  </section>
</main>
```

---

## ♿ ARIA Patterns

### Dynamic Content (Live Regions)

```html
<!-- Toast notifications — live region -->
<div aria-live="polite" aria-atomic="true" class="toast-container">
  <!-- Toasts announced by screen reader -->
</div>

<!-- Loading state -->
<div role="status" aria-live="polite">
  <span class="sr-only">Loading messages...</span>
  <div class="skeleton" aria-hidden="true"></div>
</div>

<!-- Error state -->
<div role="alert" aria-live="assertive">
  <p>Failed to load messages. Please try again.</p>
</div>
```

### Modals

```html
<div
  role="dialog"
  aria-modal="true"
  aria-labelledby="modal-title"
  aria-describedby="modal-desc"
>
  <h2 id="modal-title">Confirm Delete</h2>
  <p id="modal-desc">This action cannot be undone.</p>
  <button onClick={closeModal}>Cancel</button>
  <button onClick={confirmDelete}>Delete</button>
</div>
```

### Tabs

```html
<div role="tablist" aria-label="Dashboard tabs">
  <button role="tab" aria-selected="true" aria-controls="panel-live" id="tab-live">
    Live
  </button>
  <button role="tab" aria-selected="false" aria-controls="panel-messages" id="tab-messages">
    Messages
  </button>
</div>

<div role="tabpanel" id="panel-live" aria-labelledby="tab-live">
  <!-- Live content -->
</div>
```

---

## 🔇 Reduced Motion

```css
/* Global override */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
    scroll-behavior: auto !important;
  }
}

/* GSAP hook — programmatic check */
function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
```

---

## 🖼️ Images & Icons

```tsx
// Icons — always with aria-hidden or label
<MicIcon aria-hidden="true" />                                // Decorative
<span role="img" aria-label="Voice active">🎤</span>          // Emoji
<Icon icon="mic" aria-label="Microphone" />                   // Informative

// Images — always with alt text
<img src={user.avatar} alt={`${user.name}'s avatar`} />
<img src={decorativeBg} alt="" role="presentation" />         // Decorative
```

---

## 🧪 Testing Accessibility

```typescript
// Automated tests
import { axe } from 'jest-axe';

describe('MessageCard', () => {
  it('has no accessibility violations', async () => {
    const { container } = render(<MessageCard message={mockMessage} />);
    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});

// Manual checklist
const a11yChecklist = [
  'Keyboard: all interactive elements reachable',
  'Focus order matches visual order',
  'Screen reader: all content announced',
  'Contrast: 4.5:1 minimum for body text',
  'Labels: all form elements have labels',
  'Alt text: all images have meaningful alt text',
  'Reduced motion: animations respect media query',
  'Color: information not conveyed by color alone',
];
```

---

## 🧰 Tools & Resources

| Tool | Purpose | Integration |
|------|---------|-------------|
| axe-core | Automated audit | CI pipeline |
| Lighthouse | Performance + a11y | CI pipeline |
| NVDA / VoiceOver | Screen reader | Manual testing |
| Contrast Checker | Color verification | Design phase |
| Tab Tester | Keyboard flow | Manual testing |

---

## ⚠️ A11y Anti-Patterns

### ❌ Color-only indicators
```tsx
// ❌ JANGAN — buta warna tidak bisa membedakan
<Badge className={isBad ? 'bg-red-500' : 'bg-green-500'} />

// ✅ Color + icon + text
<Badge variant={isBad ? 'destructive' : 'success'} icon={isBad ? <X /> : <Check />} />
```

### ❌ Missing focus indicator
```css
/* ❌ JANGAN — menghilangkan focus ring */
*:focus { outline: none; }

/* ✅ Custom focus ring yang visible */
*:focus-visible { outline: 2px solid var(--clr-primary-400); outline-offset: 2px; }
```

### ❌ Non-semantic clickable
```tsx
// ❌ JANGAN — div clickable tanpa role
<div onClick={handleClick}>Click me</div>

// ✅ Gunakan button
<button onClick={handleClick}>Click me</button>
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [WCAG 2.1](https://www.w3.org/TR/WCAG21/) | Accessibility standard |
| [A11y Project](https://www.a11yproject.com/) | Accessibility patterns |
| [Inclusive Components](https://inclusive-components.design/) | Accessible component design |
| [axe DevTools](https://www.deque.com/axe/) | Automated testing |

---

*"Desain yang inklusif adalah ingatan yang tak membeda-bedakan — setiap orang berhak atas pengalaman yang utuh."* ❄️🩵
