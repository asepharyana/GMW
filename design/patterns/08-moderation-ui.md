# Moderation UI Patterns — The Watchful Eye

> *"With great power comes great responsibility."*
> — Adapted for content moderation interfaces.

---

## 🎯 Filosofi UI Moderasi

1. **At-a-glance severity** — Warna & label yang langsung terbaca
2. **Context-rich** — Setiap keputusan disertai konteks
3. **Non-destructive by default** — Flag dulu, action kemudian
4. **Audit trail** — Setiap aksi tercatat

---

## 🏷️ Severity Scale

```css
.severity--safe     { background: oklch(0.60 0.130 145 / 0.15); color: oklch(0.60 0.130 145); }
.severity--low      { background: oklch(0.70 0.120 75 / 0.15);  color: oklch(0.70 0.120 75); }
.severity--medium   { background: oklch(0.65 0.150 50 / 0.15);  color: oklch(0.65 0.150 50); }
.severity--high     { background: oklch(0.60 0.150 30 / 0.15);  color: oklch(0.60 0.150 30); }
.severity--critical { background: oklch(0.55 0.165 25 / 0.15);  color: oklch(0.55 0.165 25); }
```

| Severity | Warna | Ikon | Action |
|----------|-------|------|--------|
| Safe | Emerald | ✅ Shield | None |
| Low | Amber | ⚠️ | Review |
| Medium | Orange | 🔶 | Alert + review |
| High | Red-Orange | 🚫 | Notify + action |
| Critical | Ruby | 🔴 | Immediate |

---

## 📋 Moderation Queue

```tsx
interface ModerationQueueItem {
  id: string;
  message: { preview: string; author: { name: string; }; timestamp: number; channel: string; };
  analysis: { severity: Severity; categories: string[]; confidence: number; summary: string; };
  status: 'pending' | 'reviewed' | 'actioned' | 'dismissed';
}
```

**Layout per item:**
```
┌──────────────────────────────────────────────────────┐
│ 🔴 CRITICAL  │  [User]: "message preview..."          │
│ 🏷️ toxicity,  │  in #general · 2m ago                  │
│    harassment │  [Review] [Dismiss] [Action]           │
└──────────────────────────────────────────────────────┘
```

### Filter Bar
```
Severity: [All] [Safe] [Low] [Medium] [High] [Critical]
Channel:  [#general ▼]
Date:     [Last 24h ▼]
Search:   [.................. 🔍]
```

---

## 🎯 Action Confirmation

| Action | Confirm | Duration | Undo |
|--------|---------|----------|------|
| Dismiss | No | 2s toast | Yes (5s) |
| Warn | No | 3s toast | No |
| Delete | Yes (modal) | 4s toast | No |
| Ban | Yes (modal + reason) | — | Manual |

---

## 📊 Moderation Metrics

| Metric | Format | Frequency |
|--------|--------|-----------|
| Messages analyzed | Number | Real-time |
| Flag rate | % | Hourly |
| Response time | ms avg | Real-time |
| False positive rate | % | Daily |
| Queue depth | Number | Real-time |

---

## ⚠️ Anti-Patterns

### ❌ Ambiguous severity
```tsx
// ❌ Warna tanpa label
<div className="bg-red-200">...</div>
// ✅ Color + icon + text
<SeverityBadge severity="critical" />
```

### ❌ One-click destructive
```tsx
// ❌ Delete tanpa konfirmasi
<Button onClick={handleDelete}>Delete</Button>
// ✅ Confirm dialog
<ConfirmDialog variant="destructive" ... />
```

---

*"Mata waspada adalah penjaga ingatan — setiap flag adalah catatan sejarah."* ❄️🩵
