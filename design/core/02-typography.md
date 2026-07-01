# Typography — The Voice of Glass

> *"Typography is the craft of endowing human language with a durable visual form."*
> — Robert Bringhurst, *The Elements of Typographic Style*

---

## 🎯 Filosofi Tipografi

Tipografi BETE dibangun di atas tiga pilar:

1. **Hierarki melalui weight & size** — Bukan sekadar memperbesar heading, tapi memberi bobot makna
2. **Ritme vertikal yang konsisten** — Setiap elemen teks berada dalam grid ritme 4px
3. **Keterbacaan sebagai prioritas utama** — Sebelum estetika, sebelum gaya

---

## 📐 Type Scale: Fluid Modular Scale

Kita menggunakan **modular scale** 1.25 (major third) yang **fluid** — menyesuaikan antara viewport.

```css
/* Font size scale — fluid, minor third (1.125) hingga major third (1.25) */
--fs-xs:    clamp(0.69rem, 0.69rem + 0.01vw, 0.75rem);    /* 11–12px */
--fs-sm:    clamp(0.81rem, 0.81rem + 0.02vw, 0.88rem);    /* 13–14px */
--fs-base:  clamp(0.94rem, 0.94rem + 0.03vw, 1.00rem);    /* 15–16px ★ */
--fs-md:    clamp(1.06rem, 1.06rem + 0.04vw, 1.13rem);    /* 17–18px */
--fs-lg:    clamp(1.19rem, 1.19rem + 0.06vw, 1.25rem);    /* 19–20px */
--fs-xl:    clamp(1.31rem, 1.31rem + 0.08vw, 1.50rem);    /* 21–24px */
--fs-2xl:   clamp(1.50rem, 1.50rem + 0.12vw, 1.88rem);    /* 24–30px */
--fs-3xl:   clamp(1.69rem, 1.69rem + 0.18vw, 2.25rem);    /* 27–36px */
--fs-4xl:   clamp(1.88rem, 1.88rem + 0.26vw, 2.81rem);    /* 30–45px */
--fs-5xl:   clamp(2.25rem, 2.25rem + 0.38vw, 3.50rem);    /* 36–56px */
--fs-6xl:   clamp(2.50rem, 2.50rem + 0.50vw, 4.00rem);    /* 40–64px */
```

> **Mengapa clamp()?** Font size yang terlalu besar di mobile dan terlalu kecil di desktop adalah masalah UX klasik. Dengan `clamp()`, kita dapatkan ukuran yang optimal di setiap viewport tanpa media query.

### Line Height

```css
--lh-tight:   1.15;   /* Heading besar, display text */
--lh-normal:  1.50;   /* Body text, paragraphs */
--lh-relaxed: 1.65;   /* Long-form reading */
--lh-compact: 1.25;   /* UI labels, badges, small text */
```

### Font Weight Tokens

```css
--fw-light:      300;
--fw-regular:    400;
--fw-medium:     500;
--fw-semibold:   600;
--fw-bold:       700;
--fw-extrabold:  800;
```

---

## 🔤 Font Family

### Primary: "Outfit" — Modern Geometric Sans

```css
--ff-sans:    'Outfit', system-ui, -apple-system, sans-serif;
--ff-display: 'Outfit', system-ui, -apple-system, sans-serif;
```

Mengapa **Outfit** menggantikan Poppins?
- **Geometric precision** — Bentuk huruf yang bersih, cocok untuk UI modern
- **Low x-height** — Memberi kesan elegan dan lega
- **Variable font support** — Satu file untuk semua weight, performa lebih baik
- **Open-source** — SIL Open Font License

### Monospace: "JetBrains Mono"

```css
--ff-mono:    'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
```

Untuk: ID, timestamp, kode, data teknis, metrik.

### Loading Strategy

```html
<!-- Variable font — cukup satu file untuk seluruh weight -->
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300..800&family=JetBrains+Mono:wght@400..700&display=swap" rel="stylesheet" />
```

```css
/* Fallback font stack dengan @font-face untuk cache lokal */
@font-face {
  font-family: 'Outfit Fallback';
  src: local('Segoe UI'), local('Roboto'), local('Helvetica Neue');
  size-adjust: 95%; /* Mengurangi layout shift (CLS) */
  ascent-override: 90%;
}
```

---

## 📋 Type Styles — The Complete Catalog

### Display / Hero

```css
.display-1 {
  font-family: var(--ff-display);
  font-size: var(--fs-6xl);
  font-weight: var(--fw-extrabold);
  line-height: var(--lh-tight);
  letter-spacing: -0.03em;
}

.display-2 {
  font-family: var(--ff-display);
  font-size: var(--fs-5xl);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -0.02em;
}
```

### Headings

```css
.h1 {
  font-family: var(--ff-sans);
  font-size: var(--fs-4xl);
  font-weight: var(--fw-bold);
  line-height: var(--lh-tight);
  letter-spacing: -0.02em;
}

.h2 {
  font-family: var(--ff-sans);
  font-size: var(--fs-3xl);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-tight);
  letter-spacing: -0.015em;
}

.h3 {
  font-family: var(--ff-sans);
  font-size: var(--fs-2xl);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-tight);
  letter-spacing: -0.01em;
}

.h4 {
  font-family: var(--ff-sans);
  font-size: var(--fs-xl);
  font-weight: var(--fw-medium);
  line-height: var(--lh-normal);
  letter-spacing: -0.005em;
}
```

### Body

```css
.body-large {
  font-family: var(--ff-sans);
  font-size: var(--fs-md);
  font-weight: var(--fw-regular);
  line-height: var(--lh-relaxed);
}

.body {
  font-family: var(--ff-sans);
  font-size: var(--fs-base);
  font-weight: var(--fw-regular);
  line-height: var(--lh-normal);
}

.body-small {
  font-family: var(--ff-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-regular);
  line-height: var(--lh-normal);
}

.body-compact {
  font-family: var(--ff-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: var(--lh-compact);
}
```

### UI / Label

```css
.label {
  font-family: var(--ff-sans);
  font-size: var(--fs-xs);
  font-weight: var(--fw-semibold);
  line-height: var(--lh-compact);
  letter-spacing: 0.06em;  /* UPPERCASE labels get wider tracking */
  text-transform: uppercase;
}

.caption {
  font-family: var(--ff-sans);
  font-size: var(--fs-xs);
  font-weight: var(--fw-regular);
  line-height: var(--lh-normal);
  color: var(--clr-text-secondary);
}

.mono {
  font-family: var(--ff-mono);
  font-size: var(--fs-sm);
  font-weight: var(--fw-regular);
  line-height: var(--lh-normal);
}

.badge {
  font-family: var(--ff-sans);
  font-size: var(--fs-xs);
  font-weight: var(--fw-medium);
  line-height: 1;
}
```

---

## 📊 Type Table — Mapping ke Penggunaan

| Token | Penggunaan | Contoh |
|-------|-----------|--------|
| `.display-1` | Halaman kosong, 404, hero section | "Nothing to see here" |
| `.display-2` | Empty state utama | "No messages yet" |
| `.h1` | Judul halaman | "Dashboard", "Messages" |
| `.h2` | Judul section panel | "Voice Connections", "Analytics" |
| `.h3` | Judul card | Nama user, channel |
| `.h4` | Sub-section, tab content | "Active Speakers", "Filters" |
| `.body` | Paragraf, konten utama | Pesan teks, deskripsi |
| `.body-small` | Metadata, secondary info | Timestamp, username |
| `.body-compact` | Dense lists | Daftar items compact |
| `.label` | Form label, section header | "CHANNEL", "USERNAME" |
| `.caption` | Hint, footnote, helper | "Click to expand" |
| `.mono` | ID, kode, data teknis | "Channel #12345" |
| `.badge` | Chip, status indicator | "AI Analysis", "Flagged" |

---

## 🎭 Rich Text & Emphatic Styles

```css
/* Links */
a, .link {
  color: var(--clr-primary-400);
  text-decoration: none;
  transition: opacity var(--dur-fast) var(--ease-out);
}
a:hover, .link:hover {
  opacity: 0.8;
  text-decoration: underline;
  text-underline-offset: 2px;
}

/* Code inline */
code, .code-inline {
  font-family: var(--ff-mono);
  font-size: 0.9em;
  padding: 0.125em 0.375em;
  background: var(--clr-surface-sunken);
  border-radius: var(--rd-xs);
}

/* Truncation */
.text-truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* Multi-line truncation */
.text-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.text-clamp-3 {
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
```

---

## 📏 Vertical Rhythm

Menggunakan sistem baseline 4px (bukan 8px default) untuk tipografi:

```css
:root {
  --baseline: 4px;
}

/* Heading margin */
.h1 { margin-bottom: calc(var(--baseline) * 4); }  /* 16px */
.h2 { margin-bottom: calc(var(--baseline) * 3); }  /* 12px */
.h3 { margin-bottom: calc(var(--baseline) * 3); }  /* 12px */
.h4 { margin-bottom: calc(var(--baseline) * 2); }  /* 8px */

/* Paragraph spacing */
p, .body {
  margin-bottom: calc(var(--baseline) * 4);  /* 16px */
}

p + p {
  margin-top: calc(var(--baseline) * 2);  /* 8px — reduced between consecutive paragraphs */
}
```

---

## ⚠️ Anti-Patterns Tipografi

### ❌ Ukuran absolut tanpa fluid
```css
/* ❌ JANGAN — title 32px di mobile terlalu besar */
.page-title { font-size: 32px; }

/* ✅ clamp menyesuaikan viewport */
.page-title { font-size: var(--fs-4xl); }
```

### ❌ Line height terlalu kecil untuk body text
```css
/* ❌ JANGAN — crowded, sulit dibaca */
.body-text { font-size: 16px; line-height: 1.2; }

/* ✅ Line height yang cukup untuk readability */
.body-text { font-size: var(--fs-base); line-height: var(--lh-normal); }
```

### ❌ Terlalu banyak type scale
```css
/* ❌ JANGAN — 29px, 28px, 27px, 26px adalah noise */
.custom-1 { font-size: 29px; }
.custom-2 { font-size: 28px; }

/* ✅ Gunakan scale yang terdefinisi */
.custom { font-size: var(--fs-4xl); }
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Type Scale Calculator](https://typescale.com/) | Modular scale generation |
| [Outfit on Google Fonts](https://fonts.google.com/specimen/Outfit) | Font spesifikasi |
| [Utopia.fyi](https://utopia.fyi/) | Fluid type scale calculator |
| [JetBrains Mono](https://www.jetbrains.com/lp/mono/) | Font monospace |

---

*"Huruf adalah jejak ingatan yang tak kasatmata — ia berbicara tanpa suara."* ❄️🩵
