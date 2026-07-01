# Component Architecture — The Glass Library

> *"Design is not just what it looks like and feels like. Design is how it works."*
> — Steve Jobs

---

## 🎯 Filosofi Komponen

Setiap komponen di BETE adalah **self-contained glass panel** yang:
1. **Satu tanggung jawab** — Satu komponen, satu fungsi
2. **State-driven** — Visual merepresentasikan state, bukan sebaliknya
3. **Composable** — Bisa digabung seperti LEGO
4. **Theme-aware** — Menggunakan CSS variables, bukan hardcoded values
5. **Accessible** — Keyboard, screen reader, reduced motion

---

## 📐 Component Taxonomy

```
┌─────────────────────────────────────────────────────────────┐
│                      COMPONENT MAP                          │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌─── ATOMS ──────────────────────────────────────────┐    │
│  │  Button  │  Badge   │  Input   │  Label  │  Icon    │    │
│  │  Avatar  │  Skeleton│  Spinner │  Divider│  Tooltip │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  ┌─── MOLECULES ───────────────────────────────────────┐    │
│  │  Card            │  Tabs        │  Select            │    │
│  │  Toast           │  Modal       │  Dropdown          │    │
│  │  Pagination      │  Breadcrumb  │  SearchBar         │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  ┌─── ORGANISMS ───────────────────────────────────────┐    │
│  │  MessageCard    │  VoiceCard    │  AnalyticsChart   │    │
│  │  ActiveSpeaker  │  NowPlaying   │  ImageGrid        │    │
│  │  MascotChatbot  │  AudioViz     │  StatsCard        │    │
│  └─────────────────────────────────────────────────────┘    │
│                          ↓                                   │
│  ┌─── TEMPLATES ───────────────────────────────────────┐    │
│  │  Sidebar    │  Header     │  DashboardLayout        │    │
│  │  AuthForm   │  LivePanel  │  MessagesPanel          │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 🧱 Atomic Components (Atoms)

### Button

```tsx
interface ButtonProps {
  variant: 'primary' | 'secondary' | 'destructive' | 'outline' | 'ghost';
  size: 'sm' | 'default' | 'lg' | 'icon';
  loading?: boolean;
  disabled?: boolean;
  icon?: ReactNode;
  children?: ReactNode;
}
```

```css
.button {
  --btn-bg: var(--clr-primary);
  --btn-color: var(--clr-text-on-primary);
  --btn-border: transparent;
  --btn-hover-bg: var(--clr-primary-600);
  --btn-active-transform: scale(0.97);

  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--sp-1);
  border-radius: var(--rd-md);
  font-family: var(--ff-sans);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: var(--lh-compact);
  white-space: nowrap;
  cursor: pointer;

  background: var(--btn-bg);
  color: var(--btn-color);
  border: 1px solid var(--btn-border);

  transition:
    transform var(--dur-fast) var(--ease-out),
    background var(--dur-fast) var(--ease-out),
    box-shadow var(--dur-fast) var(--ease-out);

  padding: var(--sp-1) var(--sp-3);
  height: 40px;
}
.button--sm { height: 32px; padding: var(--sp-0-5) var(--sp-2); }
.button--lg { height: 48px; padding: var(--sp-2) var(--sp-4); }
.button--icon { height: 40px; width: 40px; padding: 0; }
.button--secondary { --btn-bg: var(--clr-interactive-hover); --btn-color: var(--clr-text); }
.button--destructive { --btn-bg: var(--clr-ruby-500); --btn-color: white; }
.button--outline { --btn-bg: transparent; --btn-color: var(--clr-text); --btn-border: var(--clr-border); }
.button--ghost { --btn-bg: transparent; --btn-color: var(--clr-text); }

.button:hover { background: var(--btn-hover-bg); }
.button:active { transform: var(--btn-active-transform); }
.button:disabled { opacity: 0.5; cursor: not-allowed; pointer-events: none; }
.button:focus-visible { outline: 2px solid var(--clr-primary); outline-offset: 2px; }
```

### Badge

```tsx
interface BadgeProps {
  variant: 'default' | 'secondary' | 'success' | 'warning' | 'destructive' | 'outline' | 'severity';
  severity?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
  size?: 'sm' | 'default';
  dot?: boolean;
  children: ReactNode;
}
```

---

## ⛓️ Molecular Components (Molecules)

### Card

```tsx
interface CardProps {
  variant?: 'default' | 'elevated' | 'glass' | 'interactive';
  padding?: 'sm' | 'default' | 'lg' | 'none';
  hover?: boolean;
  as?: 'div' | 'button' | 'a';
  onClick?: () => void;
  children: ReactNode;
}

// Sub-components
Card.Header  — flex-col gap-1.5
Card.Title   — h3, font-semibold
Card.Description — p, text-sm, text-muted
Card.Content — main area with padding
Card.Footer  — flex items-center
```

### Modal / Dialog

```tsx
interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  size?: 'sm' | 'default' | 'lg' | 'full';
  closeOnOverlay?: boolean;
  children: ReactNode;
}
```

### Toast

```tsx
interface Toast {
  id: string;
  type: 'info' | 'success' | 'error' | 'warning';
  title: string;
  description?: string;
  duration?: number;  // Auto-dismiss ms, 0 = persistent
  action?: { label: string; onClick: () => void; };
}

function useToast(): {
  toast: (t: Omit<Toast, 'id'>) => string;
  dismiss: (id: string) => void;
  toasts: Toast[];
}
```

---

## 🧬 Organism Components

### MessageCard

```tsx
interface MessageCardProps {
  message: {
    id: string;
    content: string;
    author: { id: string; name: string; avatar: string; };
    timestamp: number;
    channel?: { id: string; name: string; };
    attachments?: Attachment[];
    aiAnalysis?: {
      status: 'pending' | 'analyzing' | 'complete' | 'error';
      severity?: 'safe' | 'low' | 'medium' | 'high' | 'critical';
      categories?: string[];
      summary?: string;
    };
    isEdited?: boolean;
    isDeleted?: boolean;
  };
  onReanalyze?: (messageId: string) => Promise<void>;
}
```

### AudioVisualizer — Canvas-based

```tsx
interface AudioVisualizerProps {
  frequencies: Uint8Array;
  barCount?: number;        // Default 48
  gradient?: [string, string];
  height?: number;          // Default 32
  mirrored?: boolean;
}
```

---

## 🎯 State Management per Komponen

Setiap komponen mengelola state visual:

```tsx
// 1. Normal
<div className="card">...</div>

// 2. Hover
<div className="card card--interactive">...</div>

// 3. Active/Focus
<div className="card card--interactive" aria-pressed="true">...</div>

// 4. Disabled
<div className="card opacity-50 pointer-events-none">...</div>

// ± Loading (data-dependent)
<div className="card"><Skeleton className="h-4 w-3/4" /></div>

// ± Error (data-dependent)
<div className="card border-destructive">
  <p className="text-destructive">Failed to load</p>
</div>

// ± Empty (data-dependent)
<div className="card">
  <EmptyState icon={MessageSquare} message="No messages" />
</div>
```

---

## ⚠️ Component Anti-Patterns

### ❌ Prop Drilling Berlebihan
```tsx
// ❌ JANGAN — props turun 4 level
<Dashboard user={user} messages={messages} settings={settings} />

// ✅ Gunakan context atau komposisi
<Dashboard>
  <MessageFeed>
    <MessageCard />
  </MessageFeed>
</Dashboard>
```

### ❌ Komponen terlalu besar
```tsx
// ❌ JANGAN — 400+ baris
function LivePanel() { /* 400 lines */ }

// ✅ Bagi ke sub-komponen
function LivePanel() {
  return (
    <div>
      <VoiceControls />
      <ActiveSpeakers />
      <NowPlaying />
      <RecordingsList />
    </div>
  );
}
```

### ❌ Conditional terlalu kompleks
```tsx
// ❌ JANGAN — ternary bersarang
return isError ? <Error /> : isLoading ? <Loading /> : isEmpty ? <Empty /> : <Content />;

// ✅ State machine pattern
const state = getComponentState({ isLoading, isError, isEmpty, data });
return <ComponentStateMachine state={state} />;
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Atomic Design (Brad Frost)](https://atomicdesign.bradfrost.com/) | Atom-molecule-organism |
| [Radix UI](https://www.radix-ui.com/) | Headless UI primitives |
| [shadcn/ui](https://ui.shadcn.com/) | Component pattern reference |

---

*"Komponen adalah kristal ingatan — setiap bagian kecil menyatu membentuk keindahan yang utuh."* ❄️🩵
