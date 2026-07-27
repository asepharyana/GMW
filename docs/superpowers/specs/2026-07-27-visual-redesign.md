# Visual Redesign: Discord Automod Dashboard

## Design Direction

**Vibe:** "Monitoring hub" — deep, technical, trustworthy. Think security operations center meets modern dev tool.

## Palette

**Dark (primary):**
| Token | Value | Role |
|-------|-------|------|
| `--bg` | `oklch(0.09 0.015 245)` | Deeper navy canvas |
| `--card` | `oklch(0.13 0.02 245)` | Surface with subtle separation |
| `--primary` | `oklch(0.62 0.17 215)` | Teal-cyan accent (shift from sky blue) |
| `--accent` | `oklch(0.7 0.18 260)` | Electric blue-purple for secondary highlights |
| `--warn` | `oklch(0.7 0.17 75)` | Amber-gold for warnings (distinct from red) |
| `--border` | `oklch(1 0 0 / 0.06)` | Softer borders |

## Typography
- Geist Sans (body) + Geist Mono (code/data) — already loaded
- H1: `text-lg font-semibold tracking-tight`
- Card titles: `text-sm font-semibold tracking-tight`
- Labels/captions: `text-xs text-muted-foreground tracking-wide uppercase`

## Layout Changes

1. **Background**: Subtle dot-grid pattern (`radial-gradient(circle, oklch(1 0 0 / 0.03) 1px, transparent 1px)`) — monitoring station feel
2. **Sidebar**: Slightly wider (w-64), active item gets a glow bar + subtle teal tint background, connection dot with breathing animation
3. **Cards**: Hover state adds a thin teal border-top glow, softer shadow
4. **Stat cards**: Gradient background per stat type (like live-stats had), with icon in colored bubble
5. **Severity indicators**: Colored dot + label instead of just colored border
6. **Mobile nav**: Tighter spacing, active indicator as dot above icon
7. **Header**: Clean, thin bottom border glow, page title larger

## Signature Element
- **Grid background** + **teal glow** on active/interactive elements
- **Gradient accent bar** on sidebar active item (wider, glowing)
