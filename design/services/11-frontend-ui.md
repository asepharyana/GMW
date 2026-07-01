# Frontend UI Guidelines — The Glass Facade

> *"The details are not the details. They make the design."*
> — Charles Eames

---

## 🎯 Scope

Dokumen ini mengkhususkan implementasi **design system** untuk frontend web BETE (React + Tailwind + Vite). Fokus: konfigurasi Tailwind, CSS architecture, dan integration patterns.

---

## ⚛️ Stack Implementation

| Tool | Version | Purpose |
|------|---------|---------|
| React | 19.x | UI library |
| TypeScript | 5.x | Type safety |
| Vite | 6.x | Bundler |
| Tailwind CSS | 4.x | Utility-first CSS |
| Radix UI | — | Headless primitives |
| TanStack Query | 5.x | Server state |
| Zustand | 5.x | Client state |
| Framer Motion | 11.x | Animations |
| GSAP | 3.x | Page transitions |
| Recharts | 2.x | Charts |
| Three.js | 0.170+ | Particle background |

---

## 🎨 Tailwind Config (Extended)

```js
// tailwind.config.js
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],

  theme: {
    extend: {
      fontFamily: {
        sans: ['Outfit', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },

      colors: {
        // Semantic colors — map to CSS variables
        border:        'oklch(var(--clr-border) / <alpha-value>)',
        input:         'oklch(var(--clr-border) / <alpha-value>)',
        ring:          'oklch(var(--clr-primary-400) / <alpha-value>)',
        background:    'oklch(var(--clr-surface-base) / <alpha-value>)',
        foreground:    'oklch(var(--clr-text) / <alpha-value>)',

        primary: {
          DEFAULT:     'oklch(var(--clr-primary) / <alpha-value>)',
          foreground:  'oklch(var(--clr-text-on-primary) / <alpha-value>)',
          soft:        'oklch(var(--clr-primary-bg) / <alpha-value>)',
          50:          'oklch(var(--clr-primary-50) / <alpha-value>)',
          100:         'oklch(var(--clr-primary-100) / <alpha-value>)',
          500:         'oklch(var(--clr-primary-500) / <alpha-value>)',
          600:         'oklch(var(--clr-primary-600) / <alpha-value>)',
        },

        muted: {
          DEFAULT:     'oklch(var(--clr-surface-elevated) / <alpha-value>)',
          foreground:  'oklch(var(--clr-text-secondary) / <alpha-value>)',
        },

        destructive: {
          DEFAULT:     'oklch(var(--clr-severity-critical) / <alpha-value>)',
          foreground:  'white',
        },

        // Severity colors
        severity: {
          safe:     'oklch(var(--clr-severity-safe) / <alpha-value>)',
          low:      'oklch(var(--clr-severity-low) / <alpha-value>)',
          medium:   'oklch(var(--clr-severity-medium) / <alpha-value>)',
          high:     'oklch(var(--clr-severity-high) / <alpha-value>)',
          critical: 'oklch(var(--clr-severity-critical) / <alpha-value>)',
        },

        // Glass effects
        glass: {
          bg:     'oklch(var(--glass-bg) / <alpha-value>)',
          border: 'oklch(var(--glass-border) / <alpha-value>)',
        },
      },

      borderRadius: {
        lg:   'var(--rd-lg)',
        md:   'var(--rd-md)',
        sm:   'var(--rd-sm)',
        xl:   'var(--rd-xl)',
        full: 'var(--rd-full)',
      },

      spacing: {
        0.5: 'var(--sp-0-5)',
        1:   'var(--sp-1)',
        2:   'var(--sp-2)',
        3:   'var(--sp-3)',
        4:   'var(--sp-4)',
        5:   'var(--sp-5)',
        6:   'var(--sp-6)',
        7:   'var(--sp-7)',
        8:   'var(--sp-8)',
      },

      zIndex: {
        header:  'var(--z-header)',
        sidebar: 'var(--z-sidebar)',
        overlay: 'var(--z-overlay)',
        modal:   'var(--z-modal)',
        toast:   'var(--z-toast)',
        mascot:  'var(--z-mascot)',
      },

      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'fade-in-up': 'fadeInUp 0.5s ease-out',
        'shimmer':    'shimmer 1.5s ease-in-out infinite',
        'bar-pulse':  'bar-pulse 0.4s ease-in-out infinite',
        'glow-pulse': 'glowPulse 2s ease-in-out infinite',
        'scale-in':   'scaleIn 0.3s ease-out',
        'slide-up':   'slideUp 0.35s ease-out',
        'slide-down': 'slideDown 0.25s ease-out',
      },

      keyframes: {
        fadeIn:     { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        fadeInUp:   { '0%': { opacity: '0', transform: 'translateY(20px)' }, '100%': { opacity: '1', transform: 'translateY(0)' } },
        shimmer:    { '0%': { backgroundPosition: '200% 0' }, '100%': { backgroundPosition: '-200% 0' } },
        'bar-pulse': { '0%, 100%': { transform: 'scaleY(0.8)' }, '50%': { transform: 'scaleY(1.2)' } },
        glowPulse:  { '0%, 100%': { opacity: '0.4' }, '50%': { opacity: '0.8' } },
        scaleIn:    { '0%': { transform: 'scale(0.95)', opacity: '0' }, '100%': { transform: 'scale(1)', opacity: '1' } },
        slideUp:    { '0%': { transform: 'translateY(10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
        slideDown:  { '0%': { transform: 'translateY(-10px)', opacity: '0' }, '100%': { transform: 'translateY(0)', opacity: '1' } },
      },

      backdropBlur: {
        glass: '16px',
        strong: '24px',
        subtle: '8px',
      },
    },
  },

  plugins: [],
};
```

---

## 📁 Source Structure (Feature-Sliced)

```
src/
├── main.tsx                     # Entry + QueryClient + Providers
├── styles.css                   # Tailwind + CSS custom properties + keyframes
├── App.tsx                      # Layout shell + routing
│
├── entities/                    # Domain types (pure, no logic)
│   ├── message/
│   ├── guild/
│   ├── voice/
│   ├── media/
│   └── ui/
│
├── shared/                      # Cross-cutting
│   ├── api/                     # HTTP client + typed endpoints
│   ├── ws/                      # WebSocket manager
│   ├── hooks/                   # Shared hooks (useReducedMotion, etc.)
│   ├── ui/                      # UI primitives (button, card, badge, etc.)
│   └── lib/                     # Utils (cn, logger, formatters)
│
├── features/                    # Feature modules
│   ├── live/                    # Voice + media controls
│   ├── messages/                # Message feed + moderation
│   ├── admin/                   # Admin panel
│   ├── settings/                # Settings
│   └── auth/                    # Login/overlay
│
└── widgets/                     # Layout composites
    ├── DashboardLayout.tsx
    ├── Header.tsx
    ├── Sidebar.tsx
    ├── mascot/
    └── particles/
```

---

## 🎭 Glassmorphism Implementation

```css
/* styles.css — Glass utility classes */
@layer utilities {
  .glass {
    background: oklch(from var(--clr-surface-elevated) l c h / 0.6);
    backdrop-filter: blur(16px);
    -webkit-backdrop-filter: blur(16px);
    border: 1px solid oklch(from var(--clr-border) l c h / 0.2);
  }

  .glass-strong {
    background: oklch(from var(--clr-surface-overlay) l c h / 0.85);
    backdrop-filter: blur(24px);
    -webkit-backdrop-filter: blur(24px);
  }

  .glass-subtle {
    background: oklch(from var(--clr-surface-base) l c h / 0.5);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
  }

  .gradient-text {
    background: linear-gradient(135deg,
      oklch(var(--clr-primary-500)),
      oklch(var(--clr-primary-300))
    );
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
  }
}
```

---

## 🌐 WebSocket Integration

```tsx
// shared/ws/socket.ts
class SocketManager {
  private ws: WebSocket | null = null;
  private listeners = new Map<string, Set<(data: unknown) => void>>();
  private reconnectAttempts = 0;
  private maxReconnectDelay = 30000;

  connect(url: string): void {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (event) => {
      const { type, data } = JSON.parse(event.data);
      this.listeners.get(type)?.forEach(fn => fn(data));
    };
    this.ws.onclose = () => this.scheduleReconnect();
  }

  on<T>(event: string, callback: (data: T) => void): () => void {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(callback as (data: unknown) => void);
    return () => this.listeners.get(event)?.delete(callback as (data: unknown) => void);
  }

  private scheduleReconnect(): void {
    const delay = Math.min(1000 * Math.pow(2, this.reconnectAttempts), this.maxReconnectDelay);
    setTimeout(() => { this.reconnectAttempts++; this.connect(this.ws!.url); }, delay);
  }
}

export const socket = new SocketManager();
```

---

## 🎯 Key Integration Rules

| Concern | Implementation | Location |
|---------|---------------|----------|
| CSS Variables | Defined in `styles.css` on `:root` | Root stylesheet |
| Tailwind Colors | Map to CSS variables with `<alpha-value>` | tailwind.config.js |
| Component Library | shadcn/ui patterns with custom variants | shared/ui/ |
| Server State | TanStack Query in feature hooks | features/*/hooks/ |
| Client State | Zustand stores for UI state | shared/stores/ |
| WebSocket | Singleton SocketManager | shared/ws/socket.ts |
| Animations | Framer Motion for component, GSAP for page | In components |
| Particles | Three.js via @react-three/fiber | widgets/particles/ |

---

## ⚠️ Frontend Anti-Patterns

### ❌ Server state di state lokal
```tsx
// ❌ JANGAN — API data disimpan di useState
const [messages, setMessages] = useState([]);
useEffect(() => { fetchMessages().then(setMessages); }, []);

// ✅ Gunakan TanStack Query
const { data: messages } = useQuery({ queryKey: ['messages'], queryFn: fetchMessages });
```

### ❌ Inline styles untuk dynamic values
```tsx
// ❌ JANGAN — tidak theme-aware, tidak bisa dark mode
<div style={{ backgroundColor: isActive ? '#3b82f6' : '#6b7280' }} />

// ✅ CSS class dengan state
<div className={isActive ? 'bg-primary' : 'bg-muted'} />
```

### ❌ Mengimpor langsung dari library tanpa wrapper
```tsx
// ❌ JANGAN — susah diganti library nanti
import { motion } from 'framer-motion';

// ✅ Wrapper pattern
import { AnimatedDiv } from '@/shared/ui';
```

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Tailwind CSS Docs](https://tailwindcss.com/docs) | Utility-first CSS |
| [shadcn/ui](https://ui.shadcn.com/) | Component primitives |
| [TanStack Query](https://tanstack.com/query) | Server state |
| [Zustand](https://github.com/pmndrs/zustand) | Client state |

---

*"Fasad kaca yang menari — di balik setiap piksel ada cerita."* ❄️🩵
