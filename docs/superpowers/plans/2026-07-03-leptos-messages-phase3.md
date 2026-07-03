# Phase 3: Messages Feature — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the complete Messages panel — message list with infinite scroll, user-grouped cards, Discord emoji rendering, AI status filtering, full-text search, image grid, reanalyze actions, and WS-driven real-time updates.

**Architecture:** Leptos signals + Resources for state and data fetching. `web-sys` `IntersectionObserver` for infinite scroll sentinel. `ws::context::WsContext` drives real-time message_created/updated/deleted/analyzed events. Components follow the existing `ui/*` + `layout/*` patterns. CSS classes defined in Phase 2's `app.css`.

**Tech Stack:** Leptos 0.7 CSR, `gloo-net` fetch, `web-sys` (IntersectionObserver, console), `serde`/`serde_json`, `lucide-leptos` icons, plain CSS.

## Global Constraints

- Branch: `leptos-rewrite` at `/mnt/code/bete/.worktrees/leptos-rewrite/`
- Use `use leptos::prelude::*;` (NOT `use leptos::*;`)
- Combine duplicate `class=` attributes into single `format!()` strings
- `#[serde(rename_all = "camelCase")]` on structs where backend sends camelCase
- All timestamps are `i64` (millis since epoch), not strings
- Rust types must match the JSON wire format from backend exactly

---

## File Structure

```
services/frontend-leptos/frontend/src/
├── features/
│   ├── mod.rs                          # mod messages;
│   └── messages/
│       ├── mod.rs                      # MessagesPanel component
│       ├── components/
│       │   ├── mod.rs                  # mod message_feed message_card image_grid;
│       │   ├── message_feed.rs         # Infinite scroll, user grouping
│       │   ├── message_card.rs         # User-grouped message card
│       │   └── image_grid.rs           # Masonry-like image grid
│       └── hooks/
│           ├── mod.rs                  # mod use_messages;
│           └── use_messages.rs         # Data fetching, pagination, reanalyze
```

**Files to modify:**
- `services/frontend-leptos/frontend/src/lib.rs` — add `pub mod features;`
- `services/frontend-leptos/frontend/src/app.rs` — wire `MessagesPanel` as default tab content
- `services/frontend-leptos/frontend/src/app.css` — add message-specific CSS classes

**Files to create (8 new):**
- `services/frontend-leptos/frontend/src/features/mod.rs`
- `services/frontend-leptos/frontend/src/features/messages/mod.rs`
- `services/frontend-leptos/frontend/src/features/messages/components/mod.rs`
- `services/frontend-leptos/frontend/src/features/messages/components/message_feed.rs`
- `services/frontend-leptos/frontend/src/features/messages/components/message_card.rs`
- `services/frontend-leptos/frontend/src/features/messages/components/image_grid.rs`
- `services/frontend-leptos/frontend/src/features/messages/hooks/mod.rs`
- `services/frontend-leptos/frontend/src/features/messages/hooks/use_messages.rs`

---

### Task 1: Module skeleton + use_messages hook

**Files:**
- Create: `services/frontend-leptos/frontend/src/features/mod.rs`
- Create: `services/frontend-leptos/frontend/src/features/messages/mod.rs`
- Create: `services/frontend-leptos/frontend/src/features/messages/components/mod.rs`
- Create: `services/frontend-leptos/frontend/src/features/messages/hooks/mod.rs`
- Create: `services/frontend-leptos/frontend/src/features/messages/hooks/use_messages.rs`
- Modify: `services/frontend-leptos/frontend/src/lib.rs` — add `pub mod features;`
- Modify: `services/frontend-leptos/frontend/src/features/messages/mod.rs` — add placeholder `MessagesPanel` component

**Interfaces:**
- Consumes: `shared_types::message::{MessageRecord, PageResult}` from shared-types crate, `api::messages::{get_messages, search_messages, reanalyze_message, reanalyze_batch}` from API client
- Produces: `MessagesState` struct returned by `use_messages()` that later tasks wire into `MessagesPanel`

**Step 1: Create module files**

`services/frontend-leptos/frontend/src/features/mod.rs`:
```rust
pub mod messages;
```

`services/frontend-leptos/frontend/src/features/messages/hooks/mod.rs`:
```rust
pub mod use_messages;
```

`services/frontend-leptos/frontend/src/features/messages/components/mod.rs`:
```rust
pub mod message_feed;
pub mod message_card;
pub mod image_grid;
```

`services/frontend-leptos/frontend/src/features/messages/mod.rs` (placeholder for now):
```rust
use leptos::prelude::*;

pub mod components;
pub mod hooks;

#[component]
pub fn MessagesPanel() -> impl IntoView {
    view! {
        <div>"Messages Panel (loading...)"</div>
    }
}
```

**Step 2: Create use_messages hook**

`services/frontend-leptos/frontend/src/features/messages/hooks/use_messages.rs`:

This hook ports the React `useMessages` logic. It manages:
- `messages: RwSignal<Vec<MessageRecord>>` — the message list, sorted by created_at desc
- `loading: Signal<bool>` — loading state
- `loading_more: RwSignal<bool>` — infinite scroll loading
- `cursor: RwSignal<Option<String>>` — pagination cursor
- `has_more: Signal<bool>` — derived from cursor
- `error: RwSignal<Option<String>>` — last error message
- `current_guild: RwSignal<Option<String>>` — current guild ID
- `fetch_messages(guild_id)` — initial fetch (replaces messages)
- `load_more()` — append next page
- `reanalyze(id)` — optimistic status flip + API call + revert on failure
- `reanalyze_all_errors()` — batch reanalyze error messages

The `mergeMessages` function ported from React:
```rust
pub fn merge_messages(current: &[MessageRecord], incoming: &[MessageRecord]) -> Vec<MessageRecord> {
    let mut by_id: std::collections::HashMap<&str, &MessageRecord> = current.iter().map(|m| (m.id.as_str(), m)).collect();
    for msg in incoming {
        by_id.insert(msg.id.as_str(), msg);
    }
    let mut merged: Vec<MessageRecord> = by_id.into_values().cloned().collect();
    merged.sort_by(|a, b| b.created_at.cmp(&a.created_at).then_with(|| b.id.cmp(&a.id)));
    merged
}
```

**Step 3: Verify compilation**

Run: `cargo check --manifest-path services/frontend-leptos/Cargo.toml` from worktree root.

**Step 4: Commit**

```bash
git add services/frontend-leptos/frontend/src/features/ services/frontend-leptos/frontend/src/lib.rs
git commit -m "feat(leptos): messages module skeleton + use_messages hook"
```

---

### Task 2: MessageFeed + message grouping

**Files:**
- Create: `services/frontend-leptos/frontend/src/features/messages/components/message_feed.rs`
- Modify: `services/frontend-leptos/frontend/src/features/messages/components/mod.rs` — already done in Task 1

**Interfaces:**
- Consumes: `MessageRecord` from shared-types, `message_card::MessageCard` and `message_card::MessageCardSkeleton` from next task
- Produces: `MessageFeed` component with props: `messages: Vec<MessageRecord>`, `on_reanalyze: Callback<String>`, `empty_text: String`, `has_more: bool`, `loading_more: bool`, `on_load_more: Callback<()>`, `loading: bool`

**Key logic (ported from React `MessageFeed`):**

Group messages by same user within 5-minute window:
```rust
const GROUP_WINDOW_MS: i64 = 5 * 60 * 1000;

fn group_messages(messages: &[MessageRecord]) -> Vec<Vec<MessageRecord>> {
    let mut groups: Vec<Vec<MessageRecord>> = Vec::new();
    for msg in messages {
        if let Some(last_group) = groups.last_mut() {
            let same_user = last_group.first().map(|m| m.user_id == msg.user_id).unwrap_or(false);
            let same_window = last_group.last().map(|m| (m.created_at - msg.created_at).abs() < GROUP_WINDOW_MS).unwrap_or(false);
            if same_user && same_window {
                last_group.push(msg.clone());
                continue;
            }
        }
        groups.push(vec![msg.clone()]);
    }
    groups
}
```

**Infinite scroll sentinel (IntersectionObserver):**

In Leptos, use `web_sys::IntersectionObserver` via `create_effect` + `on_cleanup`. Create a sentinel `<div>` at the bottom of the list. When it intersects, call `on_load_more`.

```rust
let sentinel_ref = create_node_ref::<html::Div>();

create_effect(move |_| {
    let Some(node) = sentinel_ref.get() else { return };
    let callback = Closure::<dyn Fn(Vec<js_sys::Object>)>::new(move |entries: Vec<js_sys::Object>| {
        // entries.is_intersecting → call on_load_more
    });
    let observer = IntersectionObserver::new(callback.as_ref().unchecked_ref()).unwrap();
    observer.observe(&node);
    // cleanup: observer.disconnect() on on_cleanup
});
```

**Step 1: Create message_feed.rs** with grouping + sentinel + skeleton

**Step 2: Verify compilation**

**Step 3: Commit**
```bash
git commit -m "feat(leptos): MessageFeed with user grouping and infinite scroll"
```

---

### Task 3: MessageCard — message rendering

**Files:**
- Create: `services/frontend-leptos/frontend/src/features/messages/components/message_card.rs`

**Interfaces:**
- Consumes: `MessageRecord`, `api::messages::get_message_detail` (for replied-to messages), `ui::status_badge::StatusBadge`
- Produces: `MessageCard` component (props: `messages: Vec<MessageRecord>`, `on_reanalyze: Callback<String>`), `MessageCardSkeleton` component

**Key logic (ported from React `MessageCard.tsx`, 561 lines):**

1. **Header:** Avatar (img from `avatar_url`), username, channel/thread info, time ago
2. **Content:** Render message with custom Discord emoji substitution (`<a:name:id>` → CDN `<img>`)
3. **Edit/delete indicators:** Pencil icon if `edited_at` present, Trash2 icon if `deleted_at` present
4. **Attachments:** Images, videos, other files with download links
5. **Sticker:** Display sticker image if metadata contains stickers
6. **Embeds:** Show title + thumbnail from metadata embeds
7. **Reply context:** If `metadata.channel.thread_id` present, fetch the parent message
8. **AI analysis box:** StatusBadge, severity badge, confidence bar, categories, recommended action, error message, reanalyze button

**Discord custom emoji regex:**
```rust
use regex::Regex;

fn render_content(content: &str) -> Vec<HtmlElement> {
    // <a:name:id> → animated GIF
    // <:name:id> → static PNG
    // URL: https://cdn.discordapp.com/emojis/{id}.{ext}?size=128
}
```

Note: `regex` crate needs to be added to `Cargo.toml` as a dependency.

**Step 1: Add `regex = "1"` to frontend Cargo.toml**

**Step 2: Create message_card.rs** with all sub-sections

**Step 3: Verify compilation**

**Step 4: Commit**
```bash
git commit -m "feat(leptos): MessageCard with Discord emoji, attachments, AI analysis display"
```

---

### Task 4: ImageGrid

**Files:**
- Create: `services/frontend-leptos/frontend/src/features/messages/components/image_grid.rs`

**Interfaces:**
- Consumes: `MessageRecord` (extracts image URLs from attachments, stickers, embeds)
- Produces: `ImageGrid` component (props: `messages: Vec<MessageRecord>`)

**Key logic (ported from React `ImageGrid.tsx`, 132 lines):**

Extract images from message metadata:
```rust
fn extract_images(messages: &[MessageRecord]) -> Vec<String> {
    let mut urls = Vec::new();
    for msg in messages {
        if let Some(meta) = &msg.metadata {
            // attachments with image MIME
            if let Some(atts) = &meta.attachments {
                for att in atts {
                    if let Some(ct) = &att.content_type {
                        if ct.starts_with("image/") || ct.starts_with("video/") {
                            urls.push(att.url.clone());
                        }
                    }
                }
            }
            // sticker images
            if let Some(stickers) = &meta.stickers {
                for s in stickers {
                    if let Some(url) = &s.url {
                        urls.push(url.clone());
                    }
                }
            }
            // embed thumbnails/images
            if let Some(embeds) = &meta.embeds {
                for e in embeds {
                    if let Some(img) = &e.image { urls.push(img.url.clone()); }
                    if let Some(thumb) = &e.thumbnail { urls.push(thumb.url.clone()); }
                }
            }
        }
    }
    urls.sort();
    urls.dedup();
    urls
}
```

Render as CSS grid of `<img>` elements with click-to-fullsize.

**Step 1: Create image_grid.rs**

**Step 2: Verify compilation**

**Step 3: Commit**
```bash
git commit -m "feat(leptos): ImageGrid component for message media"
```

---

### Task 5: MessagesPanel — full composition

**Files:**
- Modify: `services/frontend-leptos/frontend/src/features/messages/mod.rs` — replace placeholder with full panel
- Modify: `services/frontend-leptos/frontend/src/app.rs` — wire `MessagesPanel` as default tab content
- Modify: `services/frontend-leptos/frontend/src/app.css` — add message-specific CSS classes

**Interfaces:**
- Consumes: `use_messages::use_messages`, `MessageFeed`, `ImageGrid`, `ui::tabs::*`, `ui::badge::Badge`, `ui::input::Input`, `ui::button::Button`, `ui::card::*`, `app::UiContext`, `app::AuthContext`, `ws::context::WsContext`

**Key logic (ported from React `MessagesPanel.tsx`, 316 lines):**

1. **State:** `ai_filter`, `search_query`, `search_results`, `show_search`, `view_tab` ("all" | "images"), `retrying_all`, `retried_count`
2. **Search:** Debounced search via `api::messages::search_messages`
3. **Stats badges:** total, clean, flagged, error, pending, deleted, edited
4. **AI filter chips:** all, analyzed, clean, flagged, error, pending
5. **View tabs:** All (MessageFeed) | Images (ImageGrid)
6. **WS integration:** `message_created` → prepend, `message_updated` → merge, `message_deleted` → remove, `message_analyzed` → update fields
7. **Reanalyze:** Individual + batch error reanalyze

**CSS classes to add in `app.css`:**
```css
.filter-chip { /* pill-shaped filter button */ }
.filter-chip.active { /* active state */ }
.message-stats { /* flex row of stat badges */ }
.search-bar { /* search input with icon */ }
.messages-panel { /* main container */ }
```

**Step 1: Create message-specific CSS**

**Step 2: Replace MessagesPanel with full implementation**

**Step 3: Wire into app.rs as default tab**

**Step 4: Add WS event handlers for real-time message updates**

**Step 5: Verify build**
```bash
cd services/frontend-leptos/frontend && /home/asephs/.cargo/bin/trunk build --release
```

**Step 6: Commit**
```bash
git commit -m "feat(leptos): MessagesPanel with search, filters, real-time WS updates"
```

---

## Task Dependency Graph

```
Task 1 (skeleton + hook)
  ├→ Task 2 (MessageFeed)
  │    └→ Task 3 (MessageCard) ──┐
  └→ Task 4 (ImageGrid) ─────────┤
                                  └→ Task 5 (MessagesPanel composition)
```

- Tasks 2 and 4 can be dispatched **in parallel** (independent components)
- Task 3 depends on Task 2 (MessageFeed imports MessageCard)
- Task 5 depends on all of Tasks 2, 3, 4

---

## CSS Classes Needed (append to `app.css`)

```css
/* ── Messages Panel ──────────────────────────────────── */
.messages-panel {
  display: flex;
  flex-direction: column;
  gap: var(--space-6);
}

.message-stats {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}

.filter-chip {
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 500;
  border: 1px solid var(--surface-border);
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
  transition: all var(--transition-fast);
}
.filter-chip:hover {
  color: var(--text-primary);
  background: var(--surface-overlay);
}
.filter-chip.active {
  background: var(--color-primary);
  color: white;
  border-color: var(--color-primary);
}

.search-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
}
.search-row .input {
  flex: 1;
  min-width: 200px;
}

/* ── Message Card ────────────────────────────────────── */
.message-card {
  background: var(--surface-base);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.message-card-header {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--surface-border);
}
.message-card-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  object-fit: cover;
}
.message-card-username {
  font-weight: 600;
  font-size: 0.9375rem;
}
.message-card-meta {
  font-size: 0.75rem;
  color: var(--text-tertiary);
}
.message-card-body {
  padding: var(--space-4) var(--space-6);
}
.message-row {
  padding: var(--space-2) 0;
  border-bottom: 1px solid var(--surface-border);
}
.message-row:last-child {
  border-bottom: none;
}
.message-timestamp {
  font-size: 0.6875rem;
  color: var(--text-tertiary);
  min-width: 48px;
}
.message-content {
  font-size: 0.875rem;
  line-height: 1.5;
  word-break: break-word;
}
.message-content .custom-emoji {
  display: inline-block;
  height: 22px;
  width: 22px;
  vertical-align: middle;
  object-fit: contain;
}

/* ── AI Analysis Box ─────────────────────────────────── */
.ai-analysis-box {
  margin-top: var(--space-2);
  padding: var(--space-3);
  background: var(--surface-overlay);
  border-radius: var(--radius-md);
  border: 1px solid var(--surface-border);
}
.ai-analysis-label {
  font-size: 0.75rem;
  color: var(--text-tertiary);
  margin-bottom: var(--space-1);
}
.ai-analysis-text {
  font-size: 0.8125rem;
  line-height: 1.4;
}
.ai-confidence-bar {
  height: 4px;
  background: var(--surface-border);
  border-radius: 2px;
  margin-top: var(--space-2);
  overflow: hidden;
}
.ai-confidence-fill {
  height: 100%;
  border-radius: 2px;
  background: var(--color-primary);
  transition: width var(--transition-normal);
}

/* ── Image Grid ──────────────────────────────────────── */
.image-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--space-2);
}
.image-grid-item {
  aspect-ratio: 1;
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
  transition: opacity var(--transition-fast);
}
.image-grid-item:hover {
  opacity: 0.85;
}
.image-grid-item img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
```

---

## Key Reference Files

- React MessagesPanel: `services/frontend/src/features/messages/index.tsx` (316 lines)
- React useMessages: `services/frontend/src/features/messages/hooks/useMessages.ts` (162 lines)
- React MessageFeed: `services/frontend/src/features/messages/components/MessageFeed.tsx` (120 lines)
- React MessageCard: `services/frontend/src/features/messages/components/MessageCard.tsx` (561 lines)
- React ImageGrid: `services/frontend/src/features/messages/components/ImageGrid.tsx` (132 lines)
- Leptos shared-types: `services/frontend-leptos/shared-types/src/message.rs`
- Leptos API client: `services/frontend-leptos/frontend/src/api/messages.rs`
- Leptos WS context: `services/frontend-leptos/frontend/src/ws/context.rs`
- Leptos app shell: `services/frontend-leptos/frontend/src/app.rs`
