# Data Visualization — Painting with Numbers

> *"The greatest value of a picture is when it forces us to notice what we never expected to see."*
> — John Tukey

---

## 🎯 Filosofi Data Visual

Data visualisasi di BETE adalah **cerita** tentang data yang:
1. **Jujur** — Tidak memanipulasi sumbu atau skala
2. **Kontekstual** — Setiap angka punya pembanding
3. **Hierarkis** — Overview dulu, detail kemudian

---

## 🎨 Chart Color Palette

```css
:root {
  /* Sequential (single hue) */
  --chart-blue-1: oklch(0.85 0.060 255);
  --chart-blue-2: oklch(0.70 0.100 255);
  --chart-blue-3: oklch(0.55 0.150 255);
  --chart-blue-4: oklch(0.40 0.150 255);
  --chart-blue-5: oklch(0.30 0.120 255);

  /* Categorical */
  --chart-cat-1: oklch(0.55 0.175 255);    /* Blue */
  --chart-cat-2: oklch(0.60 0.130 145);    /* Green */
  --chart-cat-3: oklch(0.65 0.150 50);     /* Orange */
  --chart-cat-4: oklch(0.55 0.165 25);     /* Red */
  --chart-cat-5: oklch(0.50 0.100 285);    /* Purple */
  --chart-cat-6: oklch(0.65 0.120 200);    /* Cyan */
  --chart-cat-7: oklch(0.60 0.110 350);    /* Pink */
  --chart-cat-8: oklch(0.70 0.100 85);     /* Yellow */
}
```

---

## 📊 Chart Types & Usage

### 1. Stat Card (KPI)

```tsx
interface StatCardProps {
  label: string;
  value: number | string;
  trend?: { direction: 'up' | 'down' | 'flat'; percentage: number; period: string; };
  icon: ReactNode;
  color?: 'primary' | 'success' | 'warning' | 'destructive';
}
```

**Layout:**
```
┌─────────────────────┐
│ [icon]    Label      │
│ 1,234     ▲ 12.3%   │
│          vs last wk  │
└─────────────────────┘
```

### 2. Line Chart (Trend)

**Use:** Message volume per day, moderation per hour
**Rules:** Y-axis dari 0. Gradient subtle below line. Hover tooltip.

### 3. Bar Chart (Comparison)

**Use:** Top channels, severity distribution
**Rules:** Horizontal untuk >5 kategori. Max 20 bars.

### 4. Donut Chart (Composition)

**Use:** Message type, severity breakdown
**Rules:** Max 6 segmen. <3% collaps ke "Other". Center = total.

### 5. Heatmap Calendar (Activity)

**Use:** User activity by day/hour
**Rules:** Sumbu X = hari, Y = jam. Satu warna accent.

---

## 📐 Chart Styling Tokens

```css
.chart-container {
  --chart-padding: var(--sp-4);
  --chart-label-size: var(--fs-xs);
  --chart-tick-count: 5;
  --chart-grid-opacity: 0.1;
  --chart-line-width: 2px;
}

.chart-tooltip {
  background: var(--clr-surface-overlay);
  backdrop-filter: blur(8px);
  border: 1px solid var(--clr-border);
  border-radius: var(--rd-md);
  padding: var(--sp-2) var(--sp-3);
  font-size: var(--fs-sm);
  box-shadow: var(--sh-elevated);
}
```

---

## 🔍 Drill-down Pattern

```tsx
function MessageTrendChart() {
  const [granularity, setGranularity] = useState<'daily' | 'hourly' | '15min'>('daily');

  const handlePointClick = (date: Date) => {
    if (granularity === 'daily') setGranularity('hourly');
    else if (granularity === 'hourly') setGranularity('15min');
  };

  return (
    <ChartCard title="Message Volume"
      onBack={granularity !== 'daily' ? () => setGranularity('daily') : undefined}>
      <LineChart data={data} granularity={granularity} onClick={handlePointClick} />
    </ChartCard>
  );
}
```

---

## ⚠️ Anti-Patterns

### ❌ Truncated Y-axis
```tsx
// ❌ Y axis mulai dari 50, memperbesar perbedaan
const options = { yAxis: { min: 50 } };
// ✅ Mulai dari 0
const options = { yAxis: { min: 0 } };
```

### ❌ Terlalu banyak warna
```tsx
// ❌ JANGAN — setiap bar beda warna
<Bar data={data} fill={['#ff0000', '#00ff00', '#0000ff', ...]} />
// ✅ Sequential scale
<Bar data={data} colorScale="sequential" />
```

### ❌ 3D charts — mendistorsi persepsi
```tsx
// ❌ JANGAN
<PieChart><Pie data={data} style={{ filter: 'drop-shadow(...)' }} /></PieChart>
// ✅ 2D
<PieChart><Pie data={data} /></PieChart>
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Recharts](https://recharts.org/) | React chart library |
| [Chartability](https://chartability.github.io/) | Accessible charts |
| [Tufte](https://www.edwardtufte.com/tufte/) | Minimalist chart design |

---

*"Angka adalah ingatan yang terukur — setiap titik data adalah kisah yang menanti."* ❄️🩵
