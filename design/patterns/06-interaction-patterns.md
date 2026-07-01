# Interaction Patterns — The Language of Touch

> *"Every interaction is a conversation between the user and the system."*
> — Don Norman

---

## 🎯 Filosofi Interaksi

Interaksi di BETE adalah **dialog** yang:
1. **Predictable** — Pengguna tahu yang akan terjadi
2. **Forgiving** — Kesalahan mudah diperbaiki (undo, confirm)
3. **Feedback-rich** — Setiap aksi mendapat respons visual
4. **Efficient** — Pengguna mahir bisa bergerak cepat (keyboard)

---

## 🔄 Interaction Feedback Matrix

| Elemen | Hover | Click | Focus | Disabled |
|--------|-------|-------|-------|----------|
| Button | scale(1.02) + bg shift | scale(0.97) | ring-2 | opacity-50 |
| Card | translateY(-2px) + shadow | — | ring-2 | opacity-50 |
| Link | underline + opacity 0.8 | color shift | ring-2 | opacity-40 |
| Input | border highlight | — | ring + border color | opacity-50 |
| Toggle | cursor pointer | slide + color | ring-2 | opacity-50 |

### Timing Reference

| Interaksi | Durasi | Easing |
|-----------|--------|--------|
| Hover in | 150ms | ease-out |
| Hover out | 200ms | ease-out |
| Click press | 100ms | ease-out |
| Click release | 150ms | ease-out |
| Focus ring | 200ms | ease-out |
| Tooltip show (after 300ms) | 200ms | ease-out |
| Tooltip hide | 150ms | ease-out |

---

## 🎪 Interaction Pattern Catalog

### Pattern 1: Progressive Disclosure

Informasi kompleks diungkap bertahap:

```tsx
<CollapsibleSection title="Advanced Filters" defaultOpen={false}>
  <FilterGroup label="Severity">
    <Checkbox label="Safe" />
    <Checkbox label="Low" />
    <Checkbox label="High" />
  </FilterGroup>
</CollapsibleSection>
```

**Rules:** Chevron rotate 180° saat open. Jangan nested > 2 level.

### Pattern 2: Optimistic UI

Untuk aksi yang hampir pasti berhasil:

```tsx
async function handleDelete(messageId: string) {
  // 1. Update UI optimistis
  setMessages(prev => prev.filter(m => m.id !== messageId));
  addToast({
    type: 'info', title: 'Message deleted',
    action: { label: 'Undo', onClick: handleUndo }
  });
  try {
    await api.deleteMessage(messageId);
  } catch {
    // Rollback
    setMessages(prev => [...prev, deletedMessage]);
    addToast({ type: 'error', title: 'Failed to delete' });
  }
}
```

### Pattern 3: Infinite Scroll vs Pagination

| Context | Pattern | Rationale |
|---------|---------|-----------|
| Message feed | Infinite scroll | Real-time, chronological |
| User list | Pagination | Bisa dicari, difilter |
| Recordings | Infinite scroll | Timeline-based |
| Analytics | Pagination | Butuh konteks halaman |

### Pattern 4: Keyboard Shortcuts

```tsx
const SHORTCUTS = {
  'ctrl+k': 'Open command palette',
  'ctrl+1': 'Switch to Live tab',
  'ctrl+2': 'Switch to Messages tab',
  'ctrl+3': 'Switch to Settings tab',
  'escape': 'Close modal/panel',
  '?': 'Show keyboard shortcuts',
};
```

---

## 🔔 Notification Priority System

| Priority | Style | Duration | Stack |
|----------|-------|----------|-------|
| info | Blue border | 4s auto | Queue |
| success | Green border | 4s auto | Queue |
| warning | Amber border | Persistent | Stack |
| error | Red border | Persistent | Stack + glow |

---

## 🖱️ Cursor Mapping

```css
.clickable    { cursor: pointer; }
.draggable    { cursor: grab; }
.dragging     { cursor: grabbing; }
.disabled     { cursor: not-allowed; }
.text-select  { cursor: text; }
.launch       { cursor: pointer; }
.copy         { cursor: copy; }
```

---

## ♿ Interaction Accessibility

1. Semua interaktif reachable via Tab
2. Focus order = visual order (DOM order)
3. Hover-only → ada keyboard alternative
4. Touch targets min 44x44px (WCAG 2.5.5)
5. Undo untuk destructive actions

---

## 🔗 Referensi

| Sumber | Konsep |
|--------|--------|
| [Material Interaction](https://m3.material.io/foundations/interaction) | Google patterns |
| [NN Group](https://www.nngroup.com/) | UX research |
| [Inclusive Components](https://inclusive-components.design/) | Accessible patterns |

---

*"Setiap sentuhan adalah dialog — interaksi adalah bahasa yang tak terucapkan."* ❄️🩵
