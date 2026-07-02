# Leptos Frontend Rewrite — Phase 1 & 2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scaffold the Leptos CSR WASM project, port all shared types, build the CSS design system, app shell, auth, WebSocket infrastructure, API client, and all shared UI primitives.

**Architecture:** Workspace with two crates (`shared-types` for Rust types, `frontend` for Leptos app). TypeScript types ported 1:1 to Rust structs with serde. WebSocket singleton with per-event channels. Leptos signals for reactive state.

**Tech Stack:** Leptos 0.7 CSR, plain CSS, `lucide-leptos`, `gloo-net`, `web-sys`, `trunk` builder.

## Global Constraints

- Leptos 0.7 CSR mode only (no SSR)
- Plain CSS only — no Tailwind, no CSS framework
- All icons from `lucide-leptos` crate
- All browser APIs through `web-sys` crate
- Rust types match TypeScript types exactly (same field names, same optional/nullable patterns)
- All API endpoints and WebSocket protocol unchanged from current React app
- Build verification: `cargo check` for types, `trunk build` for WASM output

---

## File Structure

```
services/frontend-leptos/
├── Cargo.toml
├── rust-toolchain.toml
├── .env
├── shared-types/
│   ├── Cargo.toml
│   └── src/
│       ├── lib.rs
│       ├── message.rs
│       ├── guild.rs
│       ├── voice.rs
│       ├── media.rs
│       ├── dashboard.rs
│       ├── recording.rs
│       └── ui_state.rs
└── frontend/
    ├── Cargo.toml
    ├── Trunk.toml
    ├── index.html
    └── src/
        ├── main.rs
        ├── lib.rs
        ├── app.rs
        ├── app.css
        ├── auth.rs
        ├── ws/
        │   ├── mod.rs
        │   ├── socket.rs
        │   └── context.rs
        ├── api/
        │   ├── mod.rs
        │   ├── client.rs
        │   ├── auth.rs
        │   ├── messages.rs
        │   ├── voice.rs
        │   ├── dashboard.rs
        │   └── recordings.rs
        ├── ui/
        │   ├── mod.rs
        │   ├── button.rs
        │   ├── badge.rs
        │   ├── card.rs
        │   ├── input.rs
        │   ├── select.rs
        │   ├── tabs.rs
        │   ├── scroll_area.rs
        │   ├── toast.rs
        │   ├── skeleton.rs
        │   ├── status_badge.rs
        │   ├── empty_state.rs
        │   └── modal.rs
        ├── layout/
        │   ├── mod.rs
        │   ├── dashboard_layout.rs
        │   ├── header.rs
        │   ├── sidebar.rs
        │   ├── tab_strip.rs
        │   └── mobile_tab_bar.rs
        └── features/
            ├── mod.rs
            └── (Phases 3-6)
```

---

## Phase 1 — Foundation

### Task 1: Workspace scaffold + shared-types crate

**Files:**
- Create: `services/frontend-leptos/Cargo.toml`
- Create: `services/frontend-leptos/rust-toolchain.toml`
- Create: `services/frontend-leptos/.env`
- Create: `services/frontend-leptos/shared-types/Cargo.toml`
- Create: `services/frontend-leptos/shared-types/src/lib.rs`
- Create: `services/frontend-leptos/shared-types/src/message.rs`
- Create: `services/frontend-leptos/shared-types/src/guild.rs`
- Create: `services/frontend-leptos/shared-types/src/voice.rs`
- Create: `services/frontend-leptos/shared-types/src/media.rs`
- Create: `services/frontend-leptos/shared-types/src/dashboard.rs`
- Create: `services/frontend-leptos/shared-types/src/recording.rs`
- Create: `services/frontend-leptos/shared-types/src/ui_state.rs`

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `shared_types::*` — all Rust structs with serde Serialize/Deserialize

- [ ] **Step 1: Create workspace Cargo.toml**

```toml
# services/frontend-leptos/Cargo.toml
[workspace]
resolver = "2"
members = ["shared-types", "frontend"]
```

- [ ] **Step 2: Create rust-toolchain.toml**

```toml
# services/frontend-leptos/rust-toolchain.toml
[toolchain]
channel = "nightly-2026-06-01"
components = ["rust-src", "rustc-dev"]
targets = ["wasm32-unknown-unknown"]
```

- [ ] **Step 3: Create .env template**

```
# services/frontend-leptos/.env
# API/WS endpoints — set these before building
VITE_BE_API_URL=http://localhost:3001
VITE_BE_WS_URL=ws://localhost:3001/ws
```

- [ ] **Step 4: Create shared-types Cargo.toml**

```toml
# services/frontend-leptos/shared-types/Cargo.toml
[package]
name = "shared-types"
version = "0.1.0"
edition = "2021"

[dependencies]
serde = { version = "1", features = ["derive"] }
```

- [ ] **Step 5: Create shared-types/src/lib.rs**

```rust
// services/frontend-leptos/shared-types/src/lib.rs
pub mod message;
pub mod guild;
pub mod voice;
pub mod media;
pub mod dashboard;
pub mod recording;
pub mod ui_state;
```

- [ ] **Step 6: Create shared-types/src/message.rs**

Port of `@bete/shared` MessageRecord + related types and `services/frontend/src/entities/message/types.ts`.

```rust
use serde::{Deserialize, Serialize};

// ── AI Status ─────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiStatus {
    Pending,
    Processing,
    Clean,
    Warn,
    Flagged,
    Error,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiSeverity {
    None,
    Low,
    Medium,
    High,
    Critical,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum AiRecommendedAction {
    None,
    Monitor,
    Warn,
    Review,
    Delete,
    Escalate,
}

// ── Message Metadata ──────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct MessageMetadata {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stickers: Option<Vec<StickerInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<Vec<AttachmentRef>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub embeds: Option<Vec<EmbedInfo>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel: Option<ChannelRef>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StickerInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentRef {
    pub name: String,
    pub url: String,
    #[serde(rename = "contentType")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content_type: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedInfo {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub image: Option<EmbedMedia>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail: Option<EmbedMedia>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EmbedMedia {
    pub url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub width: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub height: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChannelRef {
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_name: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_name: Option<String>,
}

// ── Message Record ────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MessageRecord {
    pub id: String,
    pub guild_id: String,
    pub channel_id: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thread_id: Option<String>,
    pub user_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_content: Option<String>,
    #[serde(rename = "type")]
    pub msg_type: String, // "text" | "edited" | "deleted"
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub edited_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_status: Option<AiStatus>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_severity: Option<AiSeverity>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_confidence: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_moderation_flags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_moderation_score: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_analysis: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_categories: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_recommended_action: Option<AiRecommendedAction>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ai_analyzed_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub metadata: Option<MessageMetadata>,
}

// ── Pagination ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageResult<T> {
    pub data: Vec<T>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
}

// ── Attachment ────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AttachmentRecord {
    pub id: String,
    pub message_id: String,
    pub guild_id: String,
    pub channel_id: String,
    pub filename: String,
    pub size: u64,
    #[serde(rename = "type")]
    pub mime_type: String,
    pub discord_url: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_url: Option<String>,
    pub upload_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_error: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_at: Option<String>,
}
```

- [ ] **Step 7: Create shared-types/src/guild.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Guild {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: String,
    #[serde(rename = "type")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub channel_type: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub parent_id: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GuildVoiceEntry {
    pub guild_id: String,
    pub channel_id: String,
    pub channel_name: String,
    pub connected_at: String,
}

// ── Config ────────────────────────────────────────────────
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub monitor_guild_id: Option<String>,
}
```

- [ ] **Step 8: Create shared-types/src/voice.rs**

```rust
use serde::{Deserialize, Serialize};
use crate::guild::GuildVoiceEntry;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceStatus {
    pub connected: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_guild_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_channel_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_channel_name: Option<String>,
    pub connections: Vec<GuildVoiceEntry>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ActiveSpeaker {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub user_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar: Option<String>,
    pub speaking: bool,
}
```

- [ ] **Step 9: Create shared-types/src/media.rs**

```rust
use serde::{Deserialize, Serialize};

pub type MediaMode = String; // "music" | "screen"

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaItem {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub source: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<MediaMode>,
    #[serde(rename = "durationMs")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<u64>,
    #[serde(rename = "thumbnailUrl")]
    #[serde(skip_serializing_if = "Option::is_none")]
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MediaState {
    pub playing: bool,
    #[serde(rename = "musicVolume")]
    pub music_volume: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current: Option<MediaItem>,
    pub queue: Vec<MediaItem>,
}
```

- [ ] **Step 10: Create shared-types/src/dashboard.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardStats {
    pub total_messages: u64,
    pub total_users: u64,
    pub total_flagged: u64,
    pub total_clean: u64,
    pub total_warned: u64,
    pub total_error: u64,
    pub total_voice_recordings: u64,
    pub total_profiles: u64,
    pub today_messages: u64,
    pub today_flagged: u64,
    pub active_users_24h: u64,
    pub top_channels: Vec<TopChannel>,
    pub moderation_overview: ModerationOverview,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TopChannel {
    pub channel_id: String,
    pub channel_name: String,
    pub message_count: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ModerationOverview {
    pub pending: u64,
    pub processing: u64,
    pub error: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardUser {
    pub user_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub profile_summary: Option<String>,
    pub total_messages: u64,
    pub flagged_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub trust_score: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardUserDetail {
    #[serde(flatten)]
    pub user: DashboardUser,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_analyzed_at: Option<String>,
    pub clean_message_streak: u64,
    pub total_infractions: u64,
    pub clean_count: u64,
    pub recent_messages: Vec<super::message::MessageRecord>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardChannel {
    pub channel_id: String,
    pub channel_name: String,
    pub guild_id: String,
    pub total_messages: u64,
    pub flagged_count: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_message_at: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub culture_summary: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub last_analyzed_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DashboardChannelDetail {
    #[serde(flatten)]
    pub channel: DashboardChannel,
    pub clean_count: u64,
    pub recent_messages: Vec<super::message::MessageRecord>,
}
```

- [ ] **Step 11: Create shared-types/src/recording.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceRecording {
    pub id: String,
    pub user_id: String,
    pub username: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avatar_url: Option<String>,
    pub guild_id: String,
    pub channel_id: String,
    pub channel_name: String,
    pub filename: String,
    pub size_bytes: u64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub download_url: Option<String>,
    pub upload_status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upload_error: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub transcription: Option<String>,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub uploaded_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VoiceRecordingListResponse {
    pub items: Vec<VoiceRecording>,
    #[serde(rename = "nextCursor")]
    pub next_cursor: Option<String>,
    pub has_more: bool,
}
```

- [ ] **Step 12: Create shared-types/src/ui_state.rs**

```rust
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum Tab {
    Messages,
    Live,
    Dashboard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UiState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_guild: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_voice_guild: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_voice_channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_guild: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub selected_text_channel: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_tab: Option<Tab>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_listening: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_streaming: Option<bool>,
}
```

- [ ] **Step 13: Verify shared-types compiles**

Run: `cd services/frontend-leptos && cargo check -p shared-types`
Expected: `Checking shared-types v0.1.0` — no errors

- [ ] **Step 14: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): scaffold workspace + shared-types port"
```

---

### Task 2: Frontend crate scaffold + empty Leptos app

**Files:**
- Create: `services/frontend-leptos/frontend/Cargo.toml`
- Create: `services/frontend-leptos/frontend/Trunk.toml`
- Create: `services/frontend-leptos/frontend/index.html`
- Create: `services/frontend-leptos/frontend/src/main.rs`
- Create: `services/frontend-leptos/frontend/src/lib.rs`
- Create: `services/frontend-leptos/frontend/src/app.rs`

**Interfaces:**
- Consumes: `shared-types` crate
- Produces: A working `trunk serve` that shows an HTML page with "Hello from Leptos" text

- [ ] **Step 1: Create frontend Cargo.toml**

```toml
# services/frontend-leptos/frontend/Cargo.toml
[package]
name = "frontend"
version = "0.1.0"
edition = "2021"

[lib]
crate-type = ["cdylib", "rlib"]

[dependencies]
leptos = { version = "0.7", features = ["csr"] }
leptos-use = "0.14"
lucide-leptos = "0.5"
shared-types = { path = "../shared-types" }
wasm-bindgen = "0.2"
js-sys = "0.3"
web-sys = { version = "0.3", features = [
    "WebSocket",
    "MessageEvent",
    "CloseEvent",
    "CanvasRenderingContext2d",
    "AudioContext",
    "AudioBuffer",
    "AudioBufferSourceNode",
    "Window",
    "Document",
    "Element",
    "HtmlElement",
    "KeyboardEvent",
    "Storage",
    "IntersectionObserver",
    "ResizeObserver",
    "Url",
    "Headers",
    "Request",
    "RequestInit",
    "Response",
    "HtmlInputElement",
    "HtmlAudioElement",
    "HtmlCanvasElement",
    "MediaDevices",
    "MediaStream",
    "Navigator",
    "DataView",
    "ArrayBuffer",
    "console",
] }
gloo-net = "0.6"
serde = { version = "1", features = ["derive"] }
serde-wasm-bindgen = "0.6"
wasm-logger = "0.2"
console_error_panic_hook = "0.1"
```

- [ ] **Step 2: Create Trunk.toml**

```toml
# services/frontend-leptos/frontend/Trunk.toml
[build]
target = "index.html"
dist = "dist"

[serve]
port = 8080
open = false
```

- [ ] **Step 3: Create index.html (entry point)**

```html
<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta name="theme-color" content="#23a1eb" />
  <title>IMPHNEN -- Discord Moderation</title>
  <link data-trunk rel="rust" data-bin="frontend" />
  <link data-trunk rel="copy-dir" href="public/" />
  <!-- Poppins font -->
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
  <!-- Preload WASM (Trunk inlines this, but just in case) -->
  <link rel="preload" href="/frontend.wasm" as="fetch" crossorigin="anonymous" />
</head>
<body>
  <!-- Leptos CSR mounts to document.body by default -->
</body>
</html>
```

- [ ] **Step 4: Create main.rs (CSR entry point)**

```rust
// services/frontend-leptos/frontend/src/main.rs
use frontend::app::App;

fn main() {
    _ = console_error_panic_hook::set_once();
    wasm_logger::init(wasm_logger::Config::default());
    leptos::mount_to_body(App);
}
```

- [ ] **Step 5: Create lib.rs (module declarations)**

```rust
// services/frontend-leptos/frontend/src/lib.rs
pub mod app;
```

- [ ] **Step 6: Create app.rs (empty app placeholder)**

```rust
// services/frontend-leptos/frontend/src/app.rs
use leptos::*;

#[component]
pub fn App() -> impl IntoView {
    view! {
        <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: 'Poppins', sans-serif; font-size: 1.5rem; background: #0f172a; color: #e2e8f0;">
            "Hello from Leptos"
        </div>
    }
}
```

- [ ] **Step 7: Install trunk if needed**

Run: `which trunk || cargo install trunk`
Note: May need to install wasm32 target: `rustup target add wasm32-unknown-unknown`

- [ ] **Step 8: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compilation succeeds with no errors

Run: `trunk build --release` (takes a while first time)
Expected: Produces `dist/` folder with `frontend.wasm` and `index.html`

- [ ] **Step 9: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): frontend scaffold with empty app"
```

---

## Phase 2 — Skeleton

### Task 3: CSS Design System

**Files:**
- Create: `services/frontend-leptos/frontend/src/app.css` (~700 lines)

**Interfaces:**
- Consumes: nothing (standalone CSS file)
- Produces: Complete CSS design system with custom properties, component classes, animations, dark theme

- [ ] **Step 1: Define CSS custom properties (`:root` + `[data-theme="dark"]`)**

```css
/* services/frontend-leptos/frontend/src/app.css */

/* ── Design Tokens ────────────────────────────────────── */
:root {
  /* Brand colors */
  --color-primary: #23a1eb;
  --color-primary-hover: #1d8fd1;
  --color-secondary: #1877f2;
  --color-tertiary: #5865f2;

  /* Surface colors (light) */
  --surface-base: #ffffff;
  --surface-raised: #f8fafc;
  --surface-overlay: #f1f5f9;
  --surface-border: #e2e8f0;
  --surface-hover: #f1f5f9;

  /* Text colors (light) */
  --text-primary: #0f172a;
  --text-secondary: #475569;
  --text-tertiary: #94a3b8;
  --text-inverse: #ffffff;

  /* Semantic colors */
  --color-success: #22c55e;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;

  /* AI semantic colors */
  --color-ai-flagged: #ef4444;
  --color-ai-clean: #22c55e;
  --color-ai-warn: #f59e0b;
  --color-ai-pending: #94a3b8;
  --color-ai-processing: #3b82f6;
  --color-ai-error: #dc2626;
  --color-ai-deleted: #6b7280;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.1);

  /* Glows */
  --glow-primary: 0 0 20px rgba(35, 161, 235, 0.3);
  --glow-error: 0 0 20px rgba(239, 68, 68, 0.3);

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-full: 9999px;

  /* Spacing */
  --space-1: 0.25rem;
  --space-2: 0.5rem;
  --space-3: 0.75rem;
  --space-4: 1rem;
  --space-5: 1.25rem;
  --space-6: 1.5rem;
  --space-8: 2rem;
  --space-10: 2.5rem;
  --space-12: 3rem;

  /* Sidebar */
  --sidebar-width: 256px;
  --sidebar-collapsed-width: 64px;

  /* Header */
  --header-height: 56px;

  /* Transitions */
  --transition-fast: 150ms ease;
  --transition-normal: 250ms ease;
  --transition-slow: 400ms ease;

  /* Z-index layers */
  --z-sidebar: 30;
  --z-header: 20;
  --z-overlay: 40;
  --z-modal: 50;
  --z-toast: 60;
}

[data-theme="dark"] {
  --surface-base: #0f172a;
  --surface-raised: #1e293b;
  --surface-overlay: #334155;
  --surface-border: #334155;
  --surface-hover: #1e293b;

  --text-primary: #f1f5f9;
  --text-secondary: #94a3b8;
  --text-tertiary: #64748b;
  --text-inverse: #0f172a;

  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.3);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.4);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.4);
  --shadow-xl: 0 20px 25px -5px rgb(0 0 0 / 0.4);

  --glow-primary: 0 0 20px rgba(35, 161, 235, 0.15);
  --glow-error: 0 0 20px rgba(239, 68, 68, 0.15);
}
```

- [ ] **Step 2: Add base/reset styles and typography**

```css
/* ── Base ─────────────────────────────────────────────── */
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html {
  font-size: 16px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

body {
  font-family: 'Poppins', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--surface-base);
  color: var(--text-primary);
  line-height: 1.5;
  min-height: 100vh;
  overflow-x: hidden;
}

a {
  color: var(--color-primary);
  text-decoration: none;
}
a:hover {
  text-decoration: underline;
}

img {
  max-width: 100%;
  height: auto;
}

/* ── Scrollbar ────────────────────────────────────────── */
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: var(--color-primary);
  border-radius: var(--radius-full);
}
```

- [ ] **Step 3: Add layout utility classes**

```css
/* ── Layout Utilities ─────────────────────────────────── */
.flex { display: flex; }
.flex-col { flex-direction: column; }
.flex-wrap { flex-wrap: wrap; }
.items-center { align-items: center; }
.items-start { align-items: flex-start; }
.items-end { align-items: flex-end; }
.justify-center { justify-content: center; }
.justify-between { justify-content: space-between; }
.justify-end { justify-content: flex-end; }
.gap-1 { gap: var(--space-1); }
.gap-2 { gap: var(--space-2); }
.gap-3 { gap: var(--space-3); }
.gap-4 { gap: var(--space-4); }
.gap-6 { gap: var(--space-6); }
.gap-8 { gap: var(--space-8); }

.grid { display: grid; }
.grid-cols-2 { grid-template-columns: repeat(2, 1fr); }
.grid-cols-3 { grid-template-columns: repeat(3, 1fr); }

.w-full { width: 100%; }
.h-full { height: 100%; }

.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.text-center { text-align: center; }
.text-sm { font-size: 0.875rem; }
.text-xs { font-size: 0.75rem; }
.text-lg { font-size: 1.125rem; }
.text-xl { font-size: 1.25rem; }
.text-2xl { font-size: 1.5rem; }
.text-3xl { font-size: 1.875rem; }

.font-medium { font-weight: 500; }
.font-semibold { font-weight: 600; }
.font-bold { font-weight: 700; }

.text-secondary { color: var(--text-secondary); }
.text-tertiary { color: var(--text-tertiary); }
.text-primary-color { color: var(--color-primary); }
.text-error { color: var(--color-error); }
.text-success { color: var(--color-success); }
.text-warning { color: var(--color-warning); }

.ml-auto { margin-left: auto; }
.mr-2 { margin-right: var(--space-2); }
.mb-2 { margin-bottom: var(--space-2); }
.mb-4 { margin-bottom: var(--space-4); }
.mb-6 { margin-bottom: var(--space-6); }
.mt-2 { margin-top: var(--space-2); }
.mt-4 { margin-top: var(--space-4); }

.p-2 { padding: var(--space-2); }
.p-3 { padding: var(--space-3); }
.p-4 { padding: var(--space-4); }
.p-6 { padding: var(--space-6); }
.px-3 { padding-left: var(--space-3); padding-right: var(--space-3); }
.px-4 { padding-left: var(--space-4); padding-right: var(--space-4); }
.py-2 { padding-top: var(--space-2); padding-bottom: var(--space-2); }

.relative { position: relative; }
.absolute { position: absolute; }
.fixed { position: fixed; }
.overflow-auto { overflow: auto; }
.overflow-hidden { overflow: hidden; }
.overflow-y-auto { overflow-y: auto; }

.hidden { display: none; }
.invisible { visibility: hidden; }
.cursor-pointer { cursor: pointer; }
.select-none { user-select: none; }
```

- [ ] **Step 4: Add all component classes**

```css
/* ── Button ───────────────────────────────────────────── */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-2);
  padding: 0.5rem 1rem;
  border: 1px solid transparent;
  border-radius: var(--radius-md);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.25rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  white-space: nowrap;
  user-select: none;
}
.btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.btn-primary {
  background: var(--color-primary);
  color: white;
}
.btn-primary:hover:not(:disabled) {
  background: var(--color-primary-hover);
}
.btn-secondary {
  background: var(--surface-raised);
  color: var(--text-primary);
  border-color: var(--surface-border);
}
.btn-secondary:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--color-primary);
}
.btn-tertiary {
  background: transparent;
  color: var(--text-primary);
}
.btn-tertiary:hover:not(:disabled) {
  background: var(--surface-hover);
}
.btn-destructive {
  background: var(--color-error);
  color: white;
}
.btn-destructive:hover:not(:disabled) {
  background: #dc2626;
}
.btn-outline {
  background: transparent;
  border-color: var(--surface-border);
  color: var(--text-primary);
}
.btn-outline:hover:not(:disabled) {
  background: var(--surface-hover);
  border-color: var(--color-primary);
}
.btn-ghost {
  background: transparent;
  color: var(--text-secondary);
  border: none;
}
.btn-ghost:hover:not(:disabled) {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  padding: 0;
  text-decoration: none;
}
.btn-link:hover:not(:disabled) {
  text-decoration: underline;
}
.btn-sm { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
.btn-lg { padding: 0.75rem 1.5rem; font-size: 1rem; }
.btn-icon { padding: 0.5rem; }
.btn-icon-sm { padding: 0.25rem; }

/* ── Badge ────────────────────────────────────────────── */
.badge {
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.625rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 500;
  line-height: 1.25rem;
  background: var(--surface-raised);
  color: var(--text-secondary);
  border: 1px solid var(--surface-border);
}
.badge-primary { background: color-mix(in srgb, var(--color-primary) 15%, transparent); color: var(--color-primary); border-color: transparent; }
.badge-success { background: color-mix(in srgb, var(--color-success) 15%, transparent); color: var(--color-success); border-color: transparent; }
.badge-warning { background: color-mix(in srgb, var(--color-warning) 15%, transparent); color: var(--color-warning); border-color: transparent; }
.badge-destructive { background: color-mix(in srgb, var(--color-error) 15%, transparent); color: var(--color-error); border-color: transparent; }
.badge-outline { background: transparent; border-color: var(--surface-border); }
.badge-info { background: color-mix(in srgb, var(--color-info) 15%, transparent); color: var(--color-info); border-color: transparent; }

/* ── Card ─────────────────────────────────────────────── */
.card {
  background: var(--surface-base);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}
.card-elevated {
  box-shadow: var(--shadow-md);
}
.card-bordered {
  border-width: 1px;
}
.card-header {
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--surface-border);
}
.card-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-primary);
}
.card-description {
  font-size: 0.875rem;
  color: var(--text-secondary);
  margin-top: var(--space-1);
}
.card-content {
  padding: var(--space-6);
}
.card-footer {
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--surface-border);
}

/* ── Input ────────────────────────────────────────────── */
.input {
  display: block;
  width: 100%;
  padding: 0.5rem 0.75rem;
  background: var(--surface-raised);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  transition: all var(--transition-fast);
  outline: none;
}
.input::placeholder {
  color: var(--text-tertiary);
}
.input:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(35, 161, 235, 0.15);
}
.input-soft {
  background: var(--surface-overlay);
  border-color: transparent;
}
.input-soft:focus {
  background: var(--surface-base);
  border-color: var(--color-primary);
}
.input[aria-invalid="true"],
.input-error {
  border-color: var(--color-error);
  box-shadow: 0 0 0 3px rgba(239, 68, 68, 0.15);
}

.select {
  display: block;
  width: 100%;
  padding: 0.5rem 2rem 0.5rem 0.75rem;
  background: var(--surface-raised);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  line-height: 1.25rem;
  cursor: pointer;
  transition: all var(--transition-fast);
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.5rem center;
}
.select:focus {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(35, 161, 235, 0.15);
}

/* ── Skeleton ─────────────────────────────────────────── */
.skeleton {
  background: linear-gradient(90deg, var(--surface-overlay) 25%, var(--surface-hover) 50%, var(--surface-overlay) 75%);
  background-size: 200% 100%;
  animation: shimmer 1.5s ease-in-out infinite;
  border-radius: var(--radius-md);
}
.skeleton-circular {
  border-radius: 50%;
}
.skeleton-rectangular {
  border-radius: 0;
}
@keyframes shimmer {
  0% { background-position: 200% 0; }
  100% { background-position: -200% 0; }
}

/* ── Tabs ─────────────────────────────────────────────── */
.tabs { display: flex; flex-direction: column; }
.tab-list {
  display: flex;
  border-bottom: 1px solid var(--surface-border);
  gap: 0;
}
.tab-trigger {
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-secondary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 500;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.tab-trigger:hover {
  color: var(--text-primary);
}
.tab-trigger[aria-selected="true"] {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}
.tab-content {
  padding-top: var(--space-4);
}

/* ── ScrollArea ───────────────────────────────────────── */
.scroll-area {
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: var(--color-primary) transparent;
}

/* ── Status Badge ─────────────────────────────────────── */
.status-badge {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1);
  padding: 0.125rem 0.5rem;
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 500;
}
.status-badge::before {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.status-badge-flagged {
  background: color-mix(in srgb, var(--color-ai-flagged) 15%, transparent);
  color: var(--color-ai-flagged);
}
.status-badge-flagged::before { background: var(--color-ai-flagged); }
.status-badge-clean {
  background: color-mix(in srgb, var(--color-ai-clean) 15%, transparent);
  color: var(--color-ai-clean);
}
.status-badge-clean::before { background: var(--color-ai-clean); }
.status-badge-warn {
  background: color-mix(in srgb, var(--color-ai-warn) 15%, transparent);
  color: var(--color-ai-warn);
}
.status-badge-warn::before { background: var(--color-ai-warn); }
.status-badge-pending {
  background: color-mix(in srgb, var(--color-ai-pending) 15%, transparent);
  color: var(--color-ai-pending);
}
.status-badge-pending::before { background: var(--color-ai-pending); }
.status-badge-processing {
  background: color-mix(in srgb, var(--color-ai-processing) 15%, transparent);
  color: var(--color-ai-processing);
}
.status-badge-processing::before {
  background: var(--color-ai-processing);
  animation: pulse-dot 1.5s ease-in-out infinite;
}
.status-badge-error {
  background: color-mix(in srgb, var(--color-ai-error) 15%, transparent);
  color: var(--color-ai-error);
}
.status-badge-error::before { background: var(--color-ai-error); }
.status-badge-deleted {
  background: color-mix(in srgb, var(--color-ai-deleted) 15%, transparent);
  color: var(--color-ai-deleted);
}
.status-badge-deleted::before { background: var(--color-ai-deleted); }
.status-badge-none {
  background: var(--surface-raised);
  color: var(--text-tertiary);
}
.status-badge-none::before { background: var(--text-tertiary); }

@keyframes pulse-dot {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.3; }
}

/* ── Toast ────────────────────────────────────────────── */
.toast-container {
  position: fixed;
  top: var(--space-4);
  right: var(--space-4);
  z-index: var(--z-toast);
  display: flex;
  flex-direction: column;
  gap: var(--space-2);
  pointer-events: none;
}
.toast {
  display: flex;
  align-items: center;
  gap: var(--space-3);
  padding: 0.75rem 1rem;
  background: var(--surface-base);
  border: 1px solid var(--surface-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  min-width: 300px;
  max-width: 420px;
  pointer-events: auto;
  animation: slide-in-right var(--transition-normal) ease-out;
}
.toast-success { border-left: 3px solid var(--color-success); }
.toast-error { border-left: 3px solid var(--color-error); }
.toast-warning { border-left: 3px solid var(--color-warning); }
.toast-info { border-left: 3px solid var(--color-info); }
.toast-close {
  margin-left: auto;
  background: none;
  border: none;
  color: var(--text-tertiary);
  cursor: pointer;
  padding: 0.25rem;
}

/* ── Modal ────────────────────────────────────────────── */
.modal-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: var(--z-modal);
  animation: fade-in var(--transition-fast) ease-out;
}
.modal-content {
  background: var(--surface-base);
  border-radius: var(--radius-xl);
  box-shadow: var(--shadow-xl);
  max-width: 90vw;
  max-height: 85vh;
  overflow: auto;
  animation: scale-in var(--transition-normal) ease-out;
}
.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--space-4) var(--space-6);
  border-bottom: 1px solid var(--surface-border);
}
.modal-body {
  padding: var(--space-6);
}
.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: var(--space-2);
  padding: var(--space-4) var(--space-6);
  border-top: 1px solid var(--surface-border);
}

/* ── Empty State ──────────────────────────────────────── */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-12);
  text-align: center;
  color: var(--text-tertiary);
}
.empty-state-icon {
  font-size: 2.5rem;
  margin-bottom: var(--space-4);
  opacity: 0.5;
}
.empty-state-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: var(--space-2);
}
.empty-state-description {
  font-size: 0.875rem;
  max-width: 300px;
}
```

- [ ] **Step 5: Add animation keyframes**

```css
/* ── Animations ───────────────────────────────────────── */
@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes fade-in-up {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes scale-in {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes slide-in-right {
  from { opacity: 0; transform: translateX(100%); }
  to { opacity: 1; transform: translateX(0); }
}
@keyframes bar-pulse {
  0%, 100% { transform: scaleY(1); }
  50% { transform: scaleY(0.6); }
}
@keyframes glow-pulse {
  0%, 100% { box-shadow: var(--glow-primary); }
  50% { box-shadow: 0 0 30px rgba(35, 161, 235, 0.5); }
}
@keyframes notification-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
@keyframes mascot-wiggle {
  0%, 100% { transform: rotate(0deg); }
  25% { transform: rotate(-5deg); }
  75% { transform: rotate(5deg); }
}

.animate-fade-in { animation: fade-in var(--transition-normal) ease-out; }
.animate-fade-in-up { animation: fade-in-up var(--transition-normal) ease-out; }
.animate-scale-in { animation: scale-in var(--transition-normal) ease-out; }
.animate-slide-in-right { animation: slide-in-right var(--transition-normal) ease-out; }

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* ── Grid Pattern Background ──────────────────────────── */
.grid-pattern {
  background-image:
    linear-gradient(var(--surface-border) 1px, transparent 1px),
    linear-gradient(90deg, var(--surface-border) 1px, transparent 1px);
  background-size: 40px 40px;
}

/* ── Particle Background ──────────────────────────────── */
.particle-bg {
  position: fixed;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  z-index: 0;
}
.particle-orb {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.15;
}
.particle-orb:nth-child(1) {
  width: 500px;
  height: 500px;
  top: -100px;
  right: -100px;
  background: var(--color-primary);
}
.particle-orb:nth-child(2) {
  width: 400px;
  height: 400px;
  bottom: -100px;
  left: -100px;
  background: var(--color-tertiary);
}
.particle-orb:nth-child(3) {
  width: 300px;
  height: 300px;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  background: var(--color-secondary);
}
@media (max-width: 768px) {
  .particle-bg { display: none; }
}

/* ── Responsive ───────────────────────────────────────── */
@media (max-width: 768px) {
  .grid-cols-2 { grid-template-columns: 1fr; }
  .grid-cols-3 { grid-template-columns: 1fr; }
  .hide-mobile { display: none !important; }
}
@media (min-width: 769px) {
  .hide-desktop { display: none !important; }
}
```

- [ ] **Step 6: Update app.rs to import CSS**

Add `#[component]` import and CSS import in `app.rs`:
```rust
use leptos::*;

#[component]
pub fn App() -> impl IntoView {
    view! {
        <div class="app">
            <link rel="stylesheet" href="/app.css" />
            <div style="display: flex; align-items: center; justify-content: center; height: 100vh; font-family: 'Poppins', sans-serif; font-size: 1.5rem; background: #0f172a; color: #e2e8f0;">
                "Hello from Leptos"
            </div>
        </div>
    }
}
```

Note: Leptos CSR builds the CSS file alongside the WASM. Trunk copies the CSS into `dist/` via `<link data-trunk>` — but since we reference it from the same directory, `<link rel="stylesheet" href="/app.css">` works when served by Trunk's built-in dev server. For production, update the path to use Trunk's `data-trunk` pipeline.

- [ ] **Step 7: Verify build with CSS**

Run: `cd services/frontend-leptos/frontend && cargo check && trunk build --release`
Expected: Build succeeds, `dist/app.css` exists, page shows styled text

- [ ] **Step 8: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): CSS design system with component classes and animations"
```

---

### Task 4: App shell + auth gate + tab routing

**Files:**
- Create: `services/frontend-leptos/frontend/src/auth.rs`
- Modify: `services/frontend-leptos/frontend/src/app.rs` (full app shell)
- Modify: `services/frontend-leptos/frontend/src/lib.rs` (add module declarations)

**Interfaces:**
- Consumes: `shared_types::ui_state::Tab`
- Produces: `App` component with auth gate, tab-based routing, and context providers

- [ ] **Step 1: Create auth.rs**

```rust
// services/frontend-leptos/frontend/src/auth.rs
use leptos::*;

#[component]
pub fn AuthOverlay(
    /// Called when password is submitted — parent handles the actual API call
    on_submit: leptos::html::InputEvent,
) -> impl IntoView {
    let (password, set_password) = create_signal(String::new());
    let (error, set_error) = create_signal(Option::<String>::None);
    let (loading, set_loading) = create_signal(false);

    let handle_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        if password.get().is_empty() {
            set_error.set(Some("Password diperlukan".to_string()));
            return;
        }
        // TODO: actual login call (wired in Task 7)
        set_loading.set(true);
    };

    view! {
        <div class="modal-overlay">
            <div class="modal-content" style="width: 380px;">
                <div class="modal-body" style="text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                    </div>
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">"Akses Dashboard"</h2>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
                        "Masukkan password admin untuk melanjutkan"
                    </p>
                    <form on:submit=handle_submit style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <input
                            type="password"
                            class="input"
                            placeholder="Password"
                            prop:value=password
                            on:input=move |ev| set_password.set(event_target_value(&ev))
                        />
                        {move || error.get().map(|e| view! { <p style="color: var(--color-error); font-size: 0.75rem;">{e}</p> })}
                        <button
                            type="submit"
                            class="btn btn-primary w-full btn-lg"
                            disabled=move || loading.get()
                        >
                            {move || if loading.get() { "Memproses..." } else { "Masuk" }}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    }
}
```

- [ ] **Step 2: Rewrite app.rs with full shell**

```rust
// services/frontend-leptos/frontend/src/app.rs
use leptos::*;
use shared_types::ui_state::Tab;
use crate::auth::AuthOverlay;

// ── Contexts ────────────────────────────────────────────

#[derive(Clone)]
pub struct AuthContext {
    pub authenticated: RwSignal<bool>,
    pub password: RwSignal<String>,
}

#[derive(Clone)]
pub struct UiContext {
    pub active_tab: RwSignal<Tab>,
    pub selected_guild: RwSignal<Option<String>>,
}

// ── App ─────────────────────────────────────────────────

#[component]
pub fn App() -> impl IntoView {
    // Initialize contexts
    let auth = AuthContext {
        authenticated: create_rw_signal(false),
        password: create_rw_signal(String::new()),
    };
    let ui = UiContext {
        active_tab: create_rw_signal(Tab::Messages),
        selected_guild: create_rw_signal(None),
    };

    provide_context(auth.clone());
    provide_context(ui.clone());

    // Auth check: redirect "live" tab to "messages" if not authenticated
    create_effect(move |_| {
        if !auth.authenticated.get() && ui.active_tab.get() == Tab::Live {
            ui.active_tab.set(Tab::Messages);
        }
    });

    view! {
        <div data-theme="light">
            // Auth overlay
            {move || (!auth.authenticated.get()).then(|| {
                view! { <AuthOverlay /> }
            })}

            // Main content (minimal for now — filled in later tasks)
            <div style="display: flex; flex-direction: column; height: 100vh;">
                <header style="height: var(--header-height); border-bottom: 1px solid var(--surface-border); display: flex; align-items: center; padding: 0 1rem;">
                    <span style="font-weight: 700; color: var(--color-primary);">"IMPHNEN"</span>
                    <span style="margin-left: 0.5rem; color: var(--text-secondary); font-size: 0.875rem;">"Discord Moderation"</span>
                </header>

                <main style="flex: 1; display: flex;">
                    // Sidebar placeholder
                    <nav style="width: var(--sidebar-width); border-right: 1px solid var(--surface-border); padding: 1rem;">
                        <div class="flex flex-col gap-2">
                            <TabButton tab=Tab::Messages ui=ui.clone() label="Pesan & Moderasi" />
                            <TabButton tab=Tab::Live ui=ui.clone() label="Voice & Media" />
                            <TabButton tab=Tab::Dashboard ui=ui.clone() label="Dashboard Guild" />
                        </div>
                    </nav>

                    // Content area
                    <div style="flex: 1; overflow: auto; padding: 1.5rem;">
                        {move || match ui.active_tab.get() {
                            Tab::Messages => view! { <div>"Messages Panel"</div> }.into_view(),
                            Tab::Live => view! { <div>"Live Panel"</div> }.into_view(),
                            Tab::Dashboard => view! { <div>"Dashboard Panel"</div> }.into_view(),
                        }}
                    </div>
                </main>
            </div>
        </div>
    }
}

// ── Tab Button Helper ───────────────────────────────────

#[component]
fn TabButton(
    tab: Tab,
    ui: UiContext,
    label: &'static str,
) -> impl IntoView {
    let is_active = move || ui.active_tab.get() == tab;
    let handle_click = move |_| ui.active_tab.set(tab);

    view! {
        <button
            class:btn=true
            class:btn-ghost=true
            class:btn-active=is_active
            on:click=handle_click
            style:background=move || if is_active() { "var(--surface-overlay)" } else { "" }
            style:color=move || if is_active() { "var(--color-primary)" } else { "" }
            style:width="100%"
            style:justify-content="flex-start"
        >
            {label}
        </button>
    }
}
```

- [ ] **Step 3: Update lib.rs**

```rust
// services/frontend-leptos/frontend/src/lib.rs
pub mod app;
pub mod auth;
```

- [ ] **Step 4: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 5: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): app shell with auth gate and tab routing"
```

---

### Task 5: WebSocket infrastructure

**Files:**
- Create: `services/frontend-leptos/frontend/src/ws/mod.rs`
- Create: `services/frontend-leptos/frontend/src/ws/socket.rs`
- Create: `services/frontend-leptos/frontend/src/ws/context.rs`

**Interfaces:**
- Produces: `WsHandle` struct with `status: ReadSignal<WsStatus>`, `send_text(text: &str)`, `send_binary(data: &[u8])`, and per-event channels for all WS event types
- Consumes: `ws_url: &str` from env configuration

- [ ] **Step 1: Create ws/mod.rs**

```rust
// services/frontend-leptos/frontend/src/ws/mod.rs
pub mod socket;
pub mod context;
```

- [ ] **Step 2: Create ws/socket.rs**

```rust
// services/frontend-leptos/frontend/src/ws/socket.rs
use leptos::*;
use wasm_bindgen::prelude::*;
use wasm_bindgen::JsCast;
use web_sys::{WebSocket, MessageEvent, CloseEvent, ErrorEvent};

#[derive(Debug, Clone, PartialEq)]
pub enum WsStatus {
    Disconnected,
    Connecting,
    Connected,
    Error(String),
}

#[derive(Debug, Clone)]
pub enum WsEvent {
    Text(String),
    Binary(Vec<u8>),
}

pub struct WsHandle {
    pub status: ReadSignal<WsStatus>,
    set_status: WriteSignal<WsStatus>,
    ws: std::cell::RefCell<Option<WebSocket>>,
    on_event: std::cell::RefCell<Option<Box<dyn Fn(WsEvent)>>>,
    url: String,
    reconnect_attempt: std::cell::Cell<u32>,
}

impl WsHandle {
    pub fn new(url: &str) -> Self {
        let (status, set_status) = create_signal(WsStatus::Disconnected);
        Self {
            status,
            set_status,
            ws: std::cell::RefCell::new(None),
            on_event: std::cell::RefCell::new(None),
            url: url.to_string(),
            reconnect_attempt: std::cell::Cell::new(0),
        }
    }

    pub fn on_event<F>(&self, callback: F)
    where
        F: Fn(WsEvent) + 'static,
    {
        *self.on_event.borrow_mut() = Some(Box::new(callback));
    }

    pub fn connect(&self) {
        if self.status.get() == WsStatus::Connected || self.status.get() == WsStatus::Connecting {
            return;
        }
        self.set_status.set(WsStatus::Connecting);

        let url = self.url.clone();
        let status_clone = self.set_status.clone();
        let event_clone: std::cell::RefCell<Option<Box<dyn Fn(WsEvent)>>> = self.on_event.clone();
        let ws_holder = &self.ws as *const std::cell::RefCell<Option<WebSocket>>;
        let reconnect_attempt = &self.reconnect_attempt as *const std::cell::Cell<u32>;

        // Clone again for closures
        let status2 = status_clone.clone();
        let status3 = status_clone.clone();
        let event2 = event_clone.clone();

        match WebSocket::new(&url) {
            Ok(ws) => {
                // Store reference
                unsafe { (*ws_holder).borrow_mut() = Some(ws.clone()) };

                // onopen
                let onopen_cb = Closure::<dyn Fn(web_sys::ProgressEvent)>::new(move |_| {
                    status_clone.set(WsStatus::Connected);
                    unsafe { (*reconnect_attempt).set(0) };
                });
                ws.set_onopen(Some(onopen_cb.as_ref().unchecked_ref()));
                onopen_cb.forget();

                // onclose
                let onclose_cb = Closure::<dyn Fn(CloseEvent)>::new(move |_| {
                    status2.set(WsStatus::Disconnected);
                    unsafe { (*ws_holder).borrow_mut() = None };
                });
                ws.set_onclose(Some(onclose_cb.as_ref().unchecked_ref()));
                onclose_cb.forget();

                // onerror
                let onerror_cb = Closure::<dyn Fn(ErrorEvent)>::new(move |e| {
                    let msg = e
                        .as_ref()
                        .unchecked_ref::<web_sys::HtmlElement>()
                        .inner_text();
                    status3.set(WsStatus::Error(msg));
                });
                ws.set_onerror(Some(onerror_cb.as_ref().unchecked_ref()));
                onerror_cb.forget();

                // onmessage
                let onmsg_cb = Closure::<dyn Fn(MessageEvent)>::new(move |e| {
                    if let Some(cb) = &*event_clone.borrow() {
                        if let Some(text) = e.data().as_string() {
                            cb(WsEvent::Text(text));
                        } else if let Some(abuf) = e.data().dyn_ref::<js_sys::ArrayBuffer>() {
                            let len = abuf.byte_length() as usize;
                            let u8view = js_sys::Uint8Array::new(abuf);
                            let mut bytes = vec![0u8; len];
                            u8view.copy_to(&mut bytes);
                            cb(WsEvent::Binary(bytes));
                        } else {
                            // Try Blob
                            let blob = e.data().dyn_ref::<web_sys::Blob>();
                            if blob.is_some() {
                                // Blob handling would need async FileReader — skip for now
                            }
                        }
                    }
                });
                ws.set_onmessage(Some(onmsg_cb.as_ref().unchecked_ref()));
                onmsg_cb.forget();
            }
            Err(e) => {
                status_clone.set(WsStatus::Error(
                    js_sys::Error::from(e).to_string().as_string().unwrap_or_default(),
                ));
            }
        }
    }

    pub fn disconnect(&self) {
        if let Some(ws) = self.ws.borrow_mut().take() {
            ws.close().ok();
        }
        self.set_status.set(WsStatus::Disconnected);
    }

    pub fn send_text(&self, text: &str) -> Result<(), JsValue> {
        if let Some(ws) = self.ws.borrow().as_ref() {
            ws.send_with_str(text)
        } else {
            Err(JsValue::from_str("WebSocket not connected"))
        }
    }

    pub fn send_binary(&self, data: &[u8]) -> Result<(), JsValue> {
        if let Some(ws) = self.ws.borrow().as_ref() {
            let array = js_sys::Uint8Array::from(data);
            let buffer = array.buffer();
            ws.send_with_array_buffer(&buffer)
        } else {
            Err(JsValue::from_str("WebSocket not connected"))
        }
    }
}
```

- [ ] **Step 3: Create ws/context.rs**

```rust
// services/frontend-leptos/frontend/src/ws/context.rs
use leptos::*;
use crate::ws::socket::{WsHandle, WsStatus, WsEvent};
use shared_types::message::MessageRecord;
use shared_types::voice::ActiveSpeaker;
use shared_types::media::MediaState;
use shared_types::recording::VoiceRecording;

#[derive(Clone)]
pub struct WsContext {
    pub handle: std::rc::Rc<WsHandle>,
    pub status: ReadSignal<WsStatus>,
    // Per-event callbacks (set externally by feature components)
    pub on_message_created: std::cell::RefCell<Option<Box<dyn Fn(MessageRecord)>>>,
    pub on_message_updated: std::cell::RefCell<Option<Box<dyn Fn(MessageRecord)>>>,
    pub on_message_deleted: std::cell::RefCell<Option<Box<dyn Fn(String)>>>,
    pub on_message_analyzed: std::cell::RefCell<Option<Box<dyn Fn(MessageRecord)>>>,
    pub on_voice_active_user: std::cell::RefCell<Option<Box<dyn Fn(ActiveSpeaker)>>>,
    pub on_voice_recording_uploaded: std::cell::RefCell<Option<Box<dyn Fn(VoiceRecording)>>>,
    pub on_media_state: std::cell::RefCell<Option<Box<dyn Fn(MediaState)>>>,
    pub on_binary: std::cell::RefCell<Option<Box<dyn Fn(Vec<u8>)>>>,
}

impl WsContext {
    pub fn new(url: &str) -> Self {
        let ws_handle = std::rc::Rc::new(WsHandle::new(url));
        let status = ws_handle.status;

        let ctx = Self {
            status,
            handle: ws_handle,
            on_message_created: std::cell::RefCell::new(None),
            on_message_updated: std::cell::RefCell::new(None),
            on_message_deleted: std::cell::RefCell::new(None),
            on_message_analyzed: std::cell::RefCell::new(None),
            on_voice_active_user: std::cell::RefCell::new(None),
            on_voice_recording_uploaded: std::cell::RefCell::new(None),
            on_media_state: std::cell::RefCell::new(None),
            on_binary: std::cell::RefCell::new(None),
        };

        // Wire up the main event dispatcher
        let ctx_clone = ctx.clone();
        ctx.handle.on_event(move |event| {
            ctx_clone.dispatch_event(event);
        });

        ctx
    }

    fn dispatch_event(&self, event: WsEvent) {
        match event {
            WsEvent::Text(text) => {
                // Parse JSON envelope: { type: string, data?: any }
                if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&text) {
                    let event_type = parsed["type"].as_str().unwrap_or("").to_string();
                    let data = parsed.get("data");

                    match event_type.as_str() {
                        "message_created" => {
                            if let Some(d) = data.and_then(|v| serde_json::from_value::<MessageRecord>(v.clone()).ok()) {
                                if let Some(cb) = self.on_message_created.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "message_updated" => {
                            if let Some(d) = data.and_then(|v| serde_json::from_value::<MessageRecord>(v.clone()).ok()) {
                                if let Some(cb) = self.on_message_updated.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "message_deleted" => {
                            if let Some(d) = data.and_then(|v| v.as_str().map(String::from)) {
                                if let Some(cb) = self.on_message_deleted.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "message_analyzed" => {
                            if let Some(d) = data.and_then(|v| serde_json::from_value::<MessageRecord>(v.clone()).ok()) {
                                if let Some(cb) = self.on_message_analyzed.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "voice_active_user" => {
                            if let Some(d) = data.and_then(|v| serde_json::from_value::<ActiveSpeaker>(v.clone()).ok()) {
                                if let Some(cb) = self.on_voice_active_user.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "voice_recording_uploaded" => {
                            if let Some(d) = data.and_then(|v| serde_json::from_value::<VoiceRecording>(v.clone()).ok()) {
                                if let Some(cb) = self.on_voice_recording_uploaded.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        "media_state" => {
                            if let Some(d) = data.and_then(|v| serde_json::from_value::<MediaState>(v.clone()).ok()) {
                                if let Some(cb) = self.on_media_state.borrow().as_ref() {
                                    cb(d);
                                }
                            }
                        }
                        _ => {
                            // Unknown event type — log and ignore
                            web_sys::console::log_1(&format!("[WS] unhandled event: {}", event_type).into());
                        }
                    }
                }
            }
            WsEvent::Binary(data) => {
                if let Some(cb) = self.on_binary.borrow().as_ref() {
                    cb(data);
                }
            }
        }
    }

    pub fn connect(&self) {
        self.handle.connect();
    }

    pub fn disconnect(&self) {
        self.handle.disconnect();
    }

    pub fn send_text(&self, text: &str) {
        let _ = self.handle.send_text(text);
    }

    pub fn send_binary(&self, data: &[u8]) {
        let _ = self.handle.send_binary(data);
    }
}
```

- [ ] **Step 4: Update lib.rs**

```rust
pub mod app;
pub mod auth;
pub mod ws;
```

- [ ] **Step 5: Update app.rs to provide WsContext**

Add to `app.rs`:

```rust
use crate::ws::context::WsContext;

// Inside App component, after UiContext:
const WS_URL: &str = "ws://localhost:3001/ws"; // TODO: make configurable at build time
let ws = WsContext::new(WS_URL);
provide_context(ws.clone());

// Connect WS on mount
let ws_connect = ws.clone();
create_effect(move |_| {
    ws_connect.connect();
});
```

- [ ] **Step 6: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 7: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): WebSocket singleton with event dispatch"
```

---

### Task 6: API client

**Files:**
- Create: `services/frontend-leptos/frontend/src/api/mod.rs`
- Create: `services/frontend-leptos/frontend/src/api/client.rs`
- Create: `services/frontend-leptos/frontend/src/api/auth.rs`
- Create: `services/frontend-leptos/frontend/src/api/messages.rs`
- Create: `services/frontend-leptos/frontend/src/api/voice.rs`
- Create: `services/frontend-leptos/frontend/src/api/dashboard.rs`
- Create: `services/frontend-leptos/frontend/src/api/recordings.rs`
- Modify: `services/frontend-leptos/frontend/src/lib.rs`

**Interfaces:**
- Produces: `ApiClient` with typed methods for all 20+ API endpoints
- Produces: `ApiError` type for error handling

- [ ] **Step 1: Create api/mod.rs**

```rust
// services/frontend-leptos/frontend/src/api/mod.rs
pub mod client;
pub mod auth;
pub mod messages;
pub mod voice;
pub mod dashboard;
pub mod recordings;
```

- [ ] **Step 2: Create api/client.rs**

```rust
// services/frontend-leptos/frontend/src/api/client.rs
use serde::de::DeserializeOwned;
use wasm_bindgen::prelude::*;
use web_sys::{Request, RequestInit, RequestMode, Headers, Response};
use wasm_bindgen_futures::JsFuture;

#[derive(Debug)]
pub struct ApiError {
    pub message: String,
    pub status_code: u16,
}

impl std::fmt::Display for ApiError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "API error {}: {}", self.status_code, self.message)
    }
}

impl std::error::Error for ApiError {}

fn get_base_url() -> String {
    // Try to read from a JS global set by index.html, or fall back to localhost
    let default = "http://localhost:3001";
    js_sys::global()
        .unchecked_ref::<web_sys::Window>()
        .location()
        .hostname()
        .ok()
        .map(|_| format!("http://localhost:3001"))
        .unwrap_or_else(|| default.to_string())
}

fn get_auth_header() -> Option<String> {
    // Read password from sessionStorage
    let storage = web_sys::window()?.local_storage().ok()??;
    storage.get_item("admin-password").ok()?
}

pub async fn request<T: DeserializeOwned>(
    method: &str,
    path: &str,
    body: Option<&str>,
) -> Result<T, ApiError> {
    let url = format!("{}{}", get_base_url(), path);

    let mut headers = Headers::new().map_err(|_| ApiError {
        message: "Failed to create headers".to_string(),
        status_code: 0,
    })?;

    if let Some(password) = get_auth_header() {
        headers.set("X-Admin-Password", &password).ok();
    }

    let mut opts = RequestInit::new();
    opts.set_method(method);
    opts.set_headers(&headers);
    opts.set_mode(RequestMode::Cors);

    if let Some(json_body) = body {
        headers.set("Content-Type", "application/json").ok();
        opts.set_body(&JsValue::from_str(json_body));
    }

    let request = Request::new_with_str_and_init(&url, &opts).map_err(|e| ApiError {
        message: format!("Failed to create request: {:?}", e),
        status_code: 0,
    })?;

    let window = web_sys::window().ok_or(ApiError {
        message: "No window".to_string(),
        status_code: 0,
    })?;

    let resp_value = JsFuture::from(window.fetch_with_request(&request))
        .await
        .map_err(|e| ApiError {
            message: format!("Fetch failed: {:?}", e),
            status_code: 0,
        })?;

    let response: Response = resp_value.dyn_into().map_err(|_| ApiError {
        message: "Invalid response".to_string(),
        status_code: 0,
    })?;

    let status = response.status();
    if status >= 400 {
        let text = JsFuture::from(
            response.text().map_err(|_| ApiError {
                message: "Failed to read error body".to_string(),
                status_code: status,
            })?
        )
        .await
        .ok()
        .and_then(|v| v.as_string())
        .unwrap_or_default();

        return Err(ApiError {
            message: text,
            status_code: status,
        });
    }

    let text = JsFuture::from(
        response.text().map_err(|_| ApiError {
            message: "Failed to read response body".to_string(),
            status_code: status,
        })?
    )
    .await
    .map_err(|_| ApiError {
        message: "Failed to await response".to_string(),
        status_code: status,
    })?
    .as_string()
    .ok_or(ApiError {
        message: "Response is not text".to_string(),
        status_code: status,
    })?;

    serde_json::from_str(&text).map_err(|e| ApiError {
        message: format!("JSON parse error: {} — body: {}", e, &text[..text.len().min(200)]),
        status_code: status,
    })
}

pub async fn request_no_body(method: &str, path: &str) -> Result<(), ApiError> {
    request::<serde_json::Value>(method, path, None).await?;
    Ok(())
}
```

- [ ] **Step 3: Create api/auth.rs**

```rust
// services/frontend-leptos/frontend/src/api/auth.rs
use crate::api::client::{request, ApiError};
use serde::{Deserialize, Serialize};

#[derive(Serialize)]
struct LoginPayload {
    password: String,
}

#[derive(Deserialize)]
struct LoginResponse {
    ok: bool,
}

pub async fn login(password: &str) -> Result<bool, ApiError> {
    let payload = LoginPayload {
        password: password.to_string(),
    };
    let body = serde_json::to_string(&payload).unwrap();
    let resp: LoginResponse = request("POST", "/api/auth/login", Some(&body)).await?;
    Ok(resp.ok)
}
```

- [ ] **Step 4: Create api/messages.rs**

```rust
// services/frontend-leptos/frontend/src/api/messages.rs
use crate::api::client::{request, ApiError};
use shared_types::message::{MessageRecord, PageResult};

/// GET /api/messages?guildId=&limit=&channelId=&cursor=
pub async fn get_messages(
    guild_id: &str,
    limit: Option<u32>,
    channel_id: Option<&str>,
    cursor: Option<&str>,
) -> Result<PageResult<MessageRecord>, ApiError> {
    let mut path = format!("/api/messages?guildId={}", guild_id);
    if let Some(l) = limit { path.push_str(&format!("&limit={}", l)); }
    if let Some(c) = channel_id { path.push_str(&format!("&channelId={}", c)); }
    if let Some(c) = cursor { path.push_str(&format!("&cursor={}", c)); }
    request("GET", &path, None).await
}

/// GET /api/review?params
pub async fn get_review_messages(
    guild_id: &str,
    limit: Option<u32>,
    channel_id: Option<&str>,
) -> Result<PageResult<MessageRecord>, ApiError> {
    let mut path = format!("/api/review?guildId={}", guild_id);
    if let Some(l) = limit { path.push_str(&format!("&limit={}", l)); }
    if let Some(c) = channel_id { path.push_str(&format!("&channelId={}", c)); }
    request("GET", &path, None).await
}

/// GET /api/messages/detail/{id}
pub async fn get_message_detail(id: &str) -> Result<Option<MessageRecord>, ApiError> {
    request("GET", &format!("/api/messages/detail/{}", id), None).await
}

/// POST /api/messages/{id}/reanalyze
pub async fn reanalyze_message(id: &str) -> Result<(), ApiError> {
    let _: serde_json::Value = request("POST", &format!("/api/messages/{}/reanalyze", id), Some("{}")).await?;
    Ok(())
}

/// POST /api/messages/reanalyze-batch
pub async fn reanalyze_batch() -> Result<u64, ApiError> {
    #[derive(serde::Deserialize)]
    struct BatchResp { ok: bool, count: u64 }
    let resp: BatchResp = request("POST", "/api/messages/reanalyze-batch", Some("{}")).await?;
    Ok(resp.count)
}

/// GET /api/analysis/search?q=&limit=
pub async fn search_messages(query: &str, limit: Option<u32>) -> Result<Vec<MessageRecord>, ApiError> {
    #[derive(serde::Deserialize)]
    struct SearchResult { results: Vec<MessageRecord> }
    let mut path = format!("/api/analysis/search?q={}", query);
    if let Some(l) = limit { path.push_str(&format!("&limit={}", l)); }
    let resp: SearchResult = request("GET", &path, None).await?;
    Ok(resp.results)
}
```

- [ ] **Step 5: Create api/voice.rs**

```rust
// services/frontend-leptos/frontend/src/api/voice.rs
use crate::api::client::{request, request_no_body, ApiError};
use shared_types::voice::VoiceStatus;
use shared_types::media::MediaState;
use shared_types::guild::{Guild, Channel};
use serde::Serialize;

/// GET /api/guilds
pub async fn get_guilds() -> Result<Vec<Guild>, ApiError> {
    request("GET", "/api/guilds", None).await
}

/// GET /api/guilds/{guildId}/voice-channels
pub async fn get_voice_channels(guild_id: &str) -> Result<Vec<Channel>, ApiError> {
    request("GET", &format!("/api/guilds/{}/voice-channels", guild_id), None).await
}

/// GET /api/guilds/{guildId}/channels
pub async fn get_text_channels(guild_id: &str) -> Result<Vec<Channel>, ApiError> {
    request("GET", &format!("/api/guilds/{}/channels", guild_id), None).await
}

/// GET /api/voice/status
pub async fn get_voice_status() -> Result<VoiceStatus, ApiError> {
    request("GET", "/api/voice/status", None).await
}

/// POST /api/voice/connect { guildId, channelId }
#[derive(Serialize)]
struct ConnectPayload {
    guild_id: String,
    channel_id: String,
}
pub async fn connect_voice(guild_id: &str, channel_id: &str) -> Result<VoiceStatus, ApiError> {
    let body = serde_json::to_string(&ConnectPayload {
        guild_id: guild_id.to_string(),
        channel_id: channel_id.to_string(),
    }).unwrap();
    request("POST", "/api/voice/connect", Some(&body)).await
}

/// POST /api/voice/disconnect
pub async fn disconnect_voice() -> Result<VoiceStatus, ApiError> {
    request("POST", "/api/voice/disconnect", Some("{}")).await
}

/// GET /api/media/status
pub async fn get_media_status() -> Result<MediaState, ApiError> {
    request("GET", "/api/media/status", None).await
}

/// POST /api/media/queue { source, mode }
#[derive(Serialize)]
struct MediaQueuePayload {
    source: String,
    mode: String,
}
pub async fn media_queue(source: &str, mode: &str) -> Result<MediaState, ApiError> {
    let body = serde_json::to_string(&MediaQueuePayload {
        source: source.to_string(),
        mode: mode.to_string(),
    }).unwrap();
    request("POST", "/api/media/queue", Some(&body)).await
}

/// POST /api/media/skip
pub async fn media_skip() -> Result<MediaState, ApiError> {
    request("POST", "/api/media/skip", Some("{}")).await
}

/// POST /api/media/stop
pub async fn media_stop() -> Result<MediaState, ApiError> {
    request("POST", "/api/media/stop", Some("{}")).await
}

/// POST /api/media/volume { volume }
#[derive(Serialize)]
struct VolumePayload { volume: f64 }
pub async fn media_volume(volume: f64) -> Result<MediaState, ApiError> {
    let body = serde_json::to_string(&VolumePayload { volume }).unwrap();
    request("POST", "/api/media/volume", Some(&body)).await
}
```

- [ ] **Step 6: Create api/dashboard.rs**

```rust
// services/frontend-leptos/frontend/src/api/dashboard.rs
use crate::api::client::{request, ApiError};
use shared_types::dashboard::*;

/// GET /api/dashboard/stats
pub async fn get_dashboard_stats() -> Result<DashboardStats, ApiError> {
    request("GET", "/api/dashboard/stats", None).await
}

/// GET /api/dashboard/users?limit=&cursor=&search=
pub async fn get_dashboard_users(
    limit: Option<u32>,
    cursor: Option<&str>,
    search: Option<&str>,
) -> Result<PaginatedUsers, ApiError> {
    let mut path = "/api/dashboard/users".to_string();
    let mut params = vec![];
    if let Some(l) = limit { params.push(format!("limit={}", l)); }
    if let Some(c) = cursor { params.push(format!("cursor={}", c)); }
    if let Some(s) = search { params.push(format!("search={}", s)); }
    if !params.is_empty() { path.push_str(&format!("?{}", params.join("&"))); }
    request("GET", &path, None).await
}

#[derive(serde::Deserialize)]
pub struct PaginatedUsers {
    pub data: Vec<DashboardUser>,
    pub next_cursor: Option<String>,
}

/// GET /api/dashboard/users/{userId}
pub async fn get_dashboard_user_detail(user_id: &str) -> Result<DashboardUserDetail, ApiError> {
    request("GET", &format!("/api/dashboard/users/{}", user_id), None).await
}

/// GET /api/dashboard/channels?limit=&cursor=&search=&guild_id=
pub async fn get_dashboard_channels(
    limit: Option<u32>,
    cursor: Option<&str>,
    search: Option<&str>,
    guild_id: Option<&str>,
) -> Result<PaginatedChannels, ApiError> {
    let mut path = "/api/dashboard/channels".to_string();
    let mut params = vec![];
    if let Some(l) = limit { params.push(format!("limit={}", l)); }
    if let Some(c) = cursor { params.push(format!("cursor={}", c)); }
    if let Some(s) = search { params.push(format!("search={}", s)); }
    if let Some(g) = guild_id { params.push(format!("guild_id={}", g)); }
    if !params.is_empty() { path.push_str(&format!("?{}", params.join("&"))); }
    request("GET", &path, None).await
}

#[derive(serde::Deserialize)]
pub struct PaginatedChannels {
    pub data: Vec<DashboardChannel>,
    pub next_cursor: Option<String>,
}

/// GET /api/dashboard/channels/{channelId}
pub async fn get_dashboard_channel_detail(channel_id: &str) -> Result<DashboardChannelDetail, ApiError> {
    request("GET", &format!("/api/dashboard/channels/{}", channel_id), None).await
}
```

- [ ] **Step 7: Create api/recordings.rs**

```rust
// services/frontend-leptos/frontend/src/api/recordings.rs
use crate::api::client::{request, request_no_body, ApiError};
use shared_types::recording::VoiceRecordingListResponse;

/// GET /api/recordings?limit=&cursor=
pub async fn get_recordings(
    limit: Option<u32>,
    cursor: Option<&str>,
) -> Result<VoiceRecordingListResponse, ApiError> {
    let mut path = "/api/recordings".to_string();
    let mut params = vec![];
    if let Some(l) = limit { params.push(format!("limit={}", l)); }
    if let Some(c) = cursor { params.push(format!("cursor={}", c)); }
    if !params.is_empty() { path.push_str(&format!("?{}", params.join("&"))); }
    request("GET", &path, None).await
}

/// DELETE /api/recordings/{id}
pub async fn delete_recording(id: &str) -> Result<(), ApiError> {
    request_no_body("DELETE", &format!("/api/recordings/{}", id)).await
}
```

- [ ] **Step 8: Update lib.rs**

```rust
pub mod app;
pub mod auth;
pub mod ws;
pub mod api;
```

- [ ] **Step 9: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 10: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): API client with all endpoint functions"
```

---

### Task 7: UI Primitives — Button, Badge, Card

**Files:**
- Create: `services/frontend-leptos/frontend/src/ui/mod.rs`
- Create: `services/frontend-leptos/frontend/src/ui/button.rs`
- Create: `services/frontend-leptos/frontend/src/ui/badge.rs`
- Create: `services/frontend-leptos/frontend/src/ui/card.rs`

- [ ] **Step 1: Create ui/mod.rs**

```rust
// services/frontend-leptos/frontend/src/ui/mod.rs
pub mod button;
pub mod badge;
pub mod card;
pub mod input;
pub mod select;
pub mod tabs;
pub mod scroll_area;
pub mod toast;
pub mod skeleton;
pub mod status_badge;
pub mod empty_state;
pub mod modal;
```

- [ ] **Step 2: Create ui/button.rs**

```rust
// services/frontend-leptos/frontend/src/ui/button.rs
use leptos::*;

#[derive(Clone)]
pub enum ButtonVariant {
    Primary,
    Secondary,
    Tertiary,
    Destructive,
    Outline,
    Ghost,
    Link,
}

#[derive(Clone)]
pub enum ButtonSize {
    Default,
    Sm,
    Lg,
    Icon,
    IconSm,
}

#[component]
pub fn Button(
    #[prop(optional)] variant: ButtonVariant,
    #[prop(optional)] size: ButtonSize,
    #[prop(optional)] disabled: bool,
    #[prop(optional)] class: &'static str,
    #[prop(optional)] on_click: Option<Box<dyn Fn(leptos::ev::MouseEvent)>>,
    children: Children,
) -> impl IntoView {
    let variant_class = match variant {
        ButtonVariant::Primary => "btn-primary",
        ButtonVariant::Secondary => "btn-secondary",
        ButtonVariant::Tertiary => "btn-tertiary",
        ButtonVariant::Destructive => "btn-destructive",
        ButtonVariant::Outline => "btn-outline",
        ButtonVariant::Ghost => "btn-ghost",
        ButtonVariant::Link => "btn-link",
    };
    let size_class = match size {
        ButtonSize::Default => "",
        ButtonSize::Sm => "btn-sm",
        ButtonSize::Lg => "btn-lg",
        ButtonSize::Icon => "btn-icon",
        ButtonSize::IconSm => "btn-icon-sm",
    };

    view! {
        <button
            class:btn=true
            class=variant_class
            class=size_class
            class=class
            disabled=disabled
            on:click=move |ev| { if let Some(ref cb) = on_click { cb(ev); } }
        >
            {children()}
        </button>
    }
}
```

- [ ] **Step 3: Create ui/badge.rs**

```rust
// services/frontend-leptos/frontend/src/ui/badge.rs
use leptos::*;

#[derive(Clone)]
pub enum BadgeVariant {
    Default,
    Primary,
    Success,
    Warning,
    Destructive,
    Outline,
    Info,
}

#[component]
pub fn Badge(
    #[prop(optional)] variant: BadgeVariant,
    children: Children,
) -> impl IntoView {
    let variant_class = match variant {
        BadgeVariant::Default => "",
        BadgeVariant::Primary => "badge-primary",
        BadgeVariant::Success => "badge-success",
        BadgeVariant::Warning => "badge-warning",
        BadgeVariant::Destructive => "badge-destructive",
        BadgeVariant::Outline => "badge-outline",
        BadgeVariant::Info => "badge-info",
    };
    view! {
        <span class="badge" class=variant_class>
            {children()}
        </span>
    }
}
```

- [ ] **Step 4: Create ui/card.rs**

```rust
// services/frontend-leptos/frontend/src/ui/card.rs
use leptos::*;

#[component]
pub fn Card(
    #[prop(optional)] elevated: bool,
    #[prop(optional)] bordered: bool,
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div
            class="card"
            class:card-elevated=elevated
            class:card-bordered=bordered
            class=class
        >
            {children()}
        </div>
    }
}

#[component]
pub fn CardHeader(children: Children) -> impl IntoView {
    view! { <div class="card-header">{children()}</div> }
}

#[component]
pub fn CardTitle(children: Children) -> impl IntoView {
    view! { <h3 class="card-title">{children()}</h3> }
}

#[component]
pub fn CardDescription(children: Children) -> impl IntoView {
    view! { <p class="card-description">{children()}</p> }
}

#[component]
pub fn CardContent(children: Children) -> impl IntoView {
    view! { <div class="card-content">{children()}</div> }
}

#[component]
pub fn CardFooter(children: Children) -> impl IntoView {
    view! { <div class="card-footer">{children()}</div> }
}
```

- [ ] **Step 5: Update lib.rs**

```rust
pub mod ui;
```

- [ ] **Step 6: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 7: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): UI primitives — Button, Badge, Card"
```

---

### Task 8: UI Primitives — Input, Select, Tabs, ScrollArea, Toast

**Files:**
- Create: `services/frontend-leptos/frontend/src/ui/input.rs`
- Create: `services/frontend-leptos/frontend/src/ui/select.rs`
- Create: `services/frontend-leptos/frontend/src/ui/tabs.rs`
- Create: `services/frontend-leptos/frontend/src/ui/scroll_area.rs`
- Create: `services/frontend-leptos/frontend/src/ui/toast.rs`

- [ ] **Step 1: Create ui/input.rs**

```rust
// services/frontend-leptos/frontend/src/ui/input.rs
use leptos::*;

#[component]
pub fn Input(
    #[prop(optional)] input_type: &'static str,
    #[prop(optional)] placeholder: &'static str,
    #[prop(optional)] value: RwSignal<String>,
    #[prop(optional)] soft: bool,
    #[prop(optional)] error: bool,
    #[prop(optional)] class: &'static str,
    #[prop(optional)] on_input: Option<Box<dyn Fn(String)>>,
) -> impl IntoView {
    view! {
        <input
            type=input_type
            class="input"
            class:input-soft=soft
            class:input-error=error
            class=class
            placeholder=placeholder
            prop:value=move || value.get()
            on:input=move |ev| {
                let val = event_target_value(&ev);
                value.set(val.clone());
                if let Some(ref cb) = on_input { cb(val); }
            }
        />
    }
}

#[component]
pub fn TextArea(
    #[prop(optional)] placeholder: &'static str,
    #[prop(optional)] value: RwSignal<String>,
    #[prop(optional)] rows: u32,
    #[prop(optional)] class: &'static str,
) -> impl IntoView {
    view! {
        <textarea
            class="input"
            class=class
            placeholder=placeholder
            prop:value=move || value.get()
            on:input=move |ev| value.set(event_target_value(&ev))
            rows=rows
        ></textarea>
    }
}
```

- [ ] **Step 2: Create ui/select.rs**

```rust
// services/frontend-leptos/frontend/src/ui/select.rs
use leptos::*;

/// Simple select — values and labels are the same
/// For options with different value/label, use `SelectOptions`
#[component]
pub fn Select(
    #[prop(optional)] value: RwSignal<String>,
    options: Vec<(&'static str, &'static str)>, // (value, label)
    #[prop(optional)] placeholder: &'static str,
    #[prop(optional)] class: &'static str,
    #[prop(optional)] on_change: Option<Box<dyn Fn(String)>>,
) -> impl IntoView {
    view! {
        <select
            class="select"
            class=class
            prop:value=move || value.get()
            on:change=move |ev| {
                let val = event_target_value(&ev);
                value.set(val.clone());
                if let Some(ref cb) = on_change { cb(val); }
            }
        >
            <option value="" disabled=placeholder.len() > 0>{placeholder}</option>
            {options.into_iter().map(|(val, label)| view! {
                <option value=val selected=move || value.get() == val>{label}</option>
            }).collect::<Vec<_>>()}
        </select>
    }
}
```

- [ ] **Step 3: Create ui/tabs.rs**

```rust
// services/frontend-leptos/frontend/src/ui/tabs.rs
use leptos::*;

#[component]
pub fn Tabs(
    active: RwSignal<String>,
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div class="tabs" class=class>
            {children()}
        </div>
    }
}

#[component]
pub fn TabList(
    #[prop(optional)] class: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div class="tab-list" class=class role="tablist">
            {children()}
        </div>
    }
}

#[component]
pub fn TabTrigger(
    value: String,
    active: RwSignal<String>,
    children: Children,
) -> impl IntoView {
    let is_selected = move || active.get() == value;
    view! {
        <button
            class="tab-trigger"
            class:active=is_selected
            role="tab"
            aria-selected=move || if is_selected() { "true" } else { "false" }
            on:click=move |_| active.set(value.clone())
        >
            {children()}
        </button>
    }
}

#[component]
pub fn TabContent(
    value: String,
    active: RwSignal<String>,
    children: Children,
) -> impl IntoView {
    let is_selected = move || active.get() == value;
    view! {
        <div
            class="tab-content"
            role="tabpanel"
            style:display=move || if is_selected() { "block" } else { "none" }
        >
            {children()}
        </div>
    }
}
```

- [ ] **Step 4: Create ui/scroll_area.rs**

```rust
// services/frontend-leptos/frontend/src/ui/scroll_area.rs
use leptos::*;

#[component]
pub fn ScrollArea(
    #[prop(optional)] class: &'static str,
    #[prop(optional)] style: &'static str,
    children: Children,
) -> impl IntoView {
    view! {
        <div class="scroll-area" class=class style=style>
            {children()}
        </div>
    }
}
```

- [ ] **Step 5: Create ui/toast.rs**

```rust
// services/frontend-leptos/frontend/src/ui/toast.rs
use leptos::*;
use std::rc::Rc;
use std::cell::RefCell;

#[derive(Clone)]
pub enum ToastType {
    Info,
    Success,
    Error,
    Warning,
}

#[derive(Clone)]
pub struct ToastMessage {
    pub id: u64,
    pub message: String,
    pub toast_type: ToastType,
}

#[derive(Clone)]
pub struct ToastContext {
    pub toasts: RwSignal<Vec<ToastMessage>>,
    next_id: Rc<RefCell<u64>>,
}

impl ToastContext {
    pub fn new() -> Self {
        Self {
            toasts: create_rw_signal(vec![]),
            next_id: Rc::new(RefCell::new(0)),
        }
    }

    pub fn show(&self, message: &str, toast_type: ToastType) {
        let id = {
            let mut n = self.next_id.borrow_mut();
            *n += 1;
            *n
        };
        let msg = ToastMessage {
            id,
            message: message.to_string(),
            toast_type,
        };
        self.toasts.update(|t| t.push(msg));

        // Auto-dismiss after 4 seconds
        let toasts = self.toasts;
        leptos::set_timeout(
            move || {
                toasts.update(|t| t.retain(|m| m.id != id));
            },
            std::time::Duration::from_secs(4),
        );
    }
}

#[component]
pub fn ToastProvider(children: Children) -> impl IntoView {
    let ctx = ToastContext::new();
    provide_context(ctx.clone());

    view! {
        {children()}
        <div class="toast-container">
            {move || ctx.toasts.get().into_iter().map(|msg| {
                let type_class = match msg.toast_type {
                    ToastType::Info => "toast-info",
                    ToastType::Success => "toast-success",
                    ToastType::Error => "toast-error",
                    ToastType::Warning => "toast-warning",
                };
                let toasts = ctx.toasts;
                view! {
                    <div class="toast" class=type_class>
                        <span>{msg.message}</span>
                        <button class="toast-close" on:click=move |_| {
                            toasts.update(|t| t.retain(|m| m.id != msg.id));
                        }>"×"</button>
                    </div>
                }
            }).collect::<Vec<_>>()}
        </div>
    }
}
```

- [ ] **Step 6: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 7: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): UI primitives — Input, Select, Tabs, ScrollArea, Toast"
```

---

### Task 9: UI Primitives — Skeleton, StatusBadge, EmptyState, Modal

**Files:**
- Create: `services/frontend-leptos/frontend/src/ui/skeleton.rs`
- Create: `services/frontend-leptos/frontend/src/ui/status_badge.rs`
- Create: `services/frontend-leptos/frontend/src/ui/empty_state.rs`
- Create: `services/frontend-leptos/frontend/src/ui/modal.rs`

- [ ] **Step 1: Create ui/skeleton.rs**

```rust
// services/frontend-leptos/frontend/src/ui/skeleton.rs
use leptos::*;

#[derive(Clone)]
pub enum SkeletonShape {
    Rounded,
    Circular,
    Rectangular,
}

#[component]
pub fn Skeleton(
    #[prop(optional)] width: &'static str,
    #[prop(optional)] height: &'static str,
    #[prop(optional)] shape: SkeletonShape,
) -> impl IntoView {
    let shape_class = match shape {
        SkeletonShape::Rounded => "",
        SkeletonShape::Circular => "skeleton-circular",
        SkeletonShape::Rectangular => "skeleton-rectangular",
    };
    view! {
        <div
            class="skeleton"
            class=shape_class
            style=format!("width: {}; height: {};", width, height)
        ></div>
    }
}
```

- [ ] **Step 2: Create ui/status_badge.rs**

```rust
// services/frontend-leptos/frontend/src/ui/status_badge.rs
use leptos::*;
use shared_types::message::AiStatus;

#[component]
pub fn StatusBadge(status: AiStatus) -> impl IntoView {
    let (class, label) = match status {
        AiStatus::Flagged => ("status-badge-flagged", "Flagged"),
        AiStatus::Clean => ("status-badge-clean", "Clean"),
        AiStatus::Warn => ("status-badge-warn", "Warned"),
        AiStatus::Pending => ("status-badge-pending", "Pending"),
        AiStatus::Processing => ("status-badge-processing", "Processing"),
        AiStatus::Error => ("status-badge-error", "Error"),
    };
    view! {
        <span class="status-badge" class=class>
            {label}
        </span>
    }
}
```

- [ ] **Step 3: Create ui/empty_state.rs**

```rust
// services/frontend-leptos/frontend/src/ui/empty_state.rs
use leptos::*;

#[component]
pub fn EmptyState(
    #[prop(optional)] icon: Option<leptos::HtmlElement<html::Div>>,
    title: &'static str,
    #[prop(optional)] description: Option<&'static str>,
    #[prop(optional)] children: Option<Children>,
) -> impl IntoView {
    view! {
        <div class="empty-state">
            {icon.map(|i| view! { <div class="empty-state-icon">{i}</div> })}
            <div class="empty-state-title">{title}</div>
            {description.map(|d| view! { <p class="empty-state-description">{d}</p> })}
            {children.map(|c| c())}
        </div>
    }
}
```

- [ ] **Step 4: Create ui/modal.rs**

```rust
// services/frontend-leptos/frontend/src/ui/modal.rs
use leptos::*;

#[component]
pub fn Modal(
    is_open: RwSignal<bool>,
    #[prop(optional)] title: Option<&'static str>,
    #[prop(optional)] on_close: Option<Box<dyn Fn()>>,
    children: Children,
) -> impl IntoView {
    let handle_close = move |_| {
        is_open.set(false);
        if let Some(ref cb) = on_close { cb(); }
    };

    view! {
        {move || is_open.get().then(|| view! {
            <div class="modal-overlay" on:click=handle_close>
                <div class="modal-content" on:click=|ev| ev.stop_propagation()>
                    {title.map(|t| view! {
                        <div class="modal-header">
                            <h3>{t}</h3>
                            <button class="btn btn-ghost btn-icon-sm" on:click=handle_close>"×"</button>
                        </div>
                    })}
                    <div class="modal-body">
                        {children()}
                    </div>
                </div>
            </div>
        })}
    }
}
```

- [ ] **Step 5: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 6: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): UI primitives — Skeleton, StatusBadge, EmptyState, Modal"
```

---

### Task 10: Layout components

**Files:**
- Create: `services/frontend-leptos/frontend/src/layout/mod.rs`
- Create: `services/frontend-leptos/frontend/src/layout/dashboard_layout.rs`
- Create: `services/frontend-leptos/frontend/src/layout/header.rs`
- Create: `services/frontend-leptos/frontend/src/layout/sidebar.rs`
- Create: `services/frontend-leptos/frontend/src/layout/tab_strip.rs`
- Create: `services/frontend-leptos/frontend/src/layout/mobile_tab_bar.rs`
- Modify: `services/frontend-leptos/frontend/src/app.rs` (integrate layout components)

- [ ] **Step 1: Create layout/mod.rs**

```rust
// services/frontend-leptos/frontend/src/layout/mod.rs
pub mod dashboard_layout;
pub mod header;
pub mod sidebar;
pub mod tab_strip;
pub mod mobile_tab_bar;
```

- [ ] **Step 2: Create layout/header.rs**

```rust
// services/frontend-leptos/frontend/src/layout/header.rs
use leptos::*;
use crate::ws::context::WsContext;
use crate::ws::socket::WsStatus;

#[component]
pub fn Header() -> impl IntoView {
    let ws = use_context::<WsContext>().expect("WsContext not provided");
    let ws_status = ws.status;

    // WS indicator text + color
    let (indicator_text, indicator_color) = move || match ws_status.get() {
        WsStatus::Connected => ("Online", "var(--color-success)"),
        WsStatus::Connecting => ("Menghubungkan...", "var(--color-warning)"),
        WsStatus::Disconnected => ("Offline", "var(--text-tertiary)"),
        WsStatus::Error(_) => ("Error", "var(--color-error)"),
    };

    view! {
        <header style="
            height: var(--header-height);
            border-bottom: 1px solid var(--surface-border);
            display: flex;
            align-items: center;
            padding: 0 1.5rem;
            background: var(--surface-base);
            position: sticky;
            top: 0;
            z-index: var(--z-header);
        ">
            <div class="flex items-center gap-2">
                <span style="font-weight: 700; font-size: 1.125rem; color: var(--color-primary);">
                    "IMPHNEN"
                </span>
                <span style="color: var(--text-secondary); font-size: 0.75rem; padding: 0.125rem 0.375rem; background: var(--surface-overlay); border-radius: var(--radius-sm);">
                    "Guild Watcher"
                </span>
            </div>

            <div class="flex items-center gap-4 ml-auto">
                // WS connection indicator
                <div class="flex items-center gap-1" style="font-size: 0.75rem; color: var(--text-secondary);">
                    <span style="
                        width: 8px; height: 8px; border-radius: 50%;
                        background: {move || indicator_color().0};
                    "></span>
                    <span>{move || indicator_text().0}</span>
                </div>
            </div>
        </header>
    }
}
```

Note: The `move || ...` closure syntax for style values uses `.0` because Leptos passes signals through a `Memo` wrapper. In Leptos 0.7, `move || indicator_text()` returns a `(&str, &str)` tuple when called from inside a `view!`. Update to proper Leptos 0.7 syntax:

```rust
let indicator_text_memo = create_memo(move |_| match ws_status.get() {
    WsStatus::Connected => "Online",
    WsStatus::Connecting => "Menghubungkan...",
    WsStatus::Disconnected => "Offline",
    WsStatus::Error(_) => "Error",
});
let indicator_color_memo = create_memo(move |_| match ws_status.get() {
    WsStatus::Connected => "var(--color-success)",
    WsStatus::Connecting => "var(--color-warning)",
    WsStatus::Disconnected => "var(--text-tertiary)",
    WsStatus::Error(_) => "var(--color-error)",
});
```

Use these memos in the view.

- [ ] **Step 3: Create layout/sidebar.rs**

```rust
// services/frontend-leptos/frontend/src/layout/sidebar.rs
use leptos::*;
use shared_types::ui_state::Tab;
use crate::app::UiContext;

#[component]
pub fn Sidebar() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");
    let (collapsed, _set_collapsed) = create_signal(false);

    view! {
        <nav style:width=move || if collapsed.get() { "var(--sidebar-collapsed-width)" } else { "var(--sidebar-width)" }
            style="
                border-right: 1px solid var(--surface-border);
                display: flex;
                flex-direction: column;
                padding: 1rem 0.5rem;
                transition: width var(--transition-normal);
                overflow: hidden;
                flex-shrink: 0;
            "
        >
            <NavItem
                icon="message-square"
                label="Pesan & Moderasi"
                tab=Tab::Messages
                ui=ui.clone()
            />
            <NavItem
                icon="radio"
                label="Voice & Media"
                tab=Tab::Live
                ui=ui.clone()
            />
            <NavItem
                icon="shield"
                label="Dashboard Guild"
                tab=Tab::Dashboard
                ui=ui.clone()
            />
        </nav>
    }
}

#[component]
fn NavItem(
    icon: &'static str,
    label: &'static str,
    tab: Tab,
    ui: UiContext,
) -> impl IntoView {
    let is_active = move || ui.active_tab.get() == tab;
    let handle_click = move |_| ui.active_tab.set(tab);

    view! {
        <button
            class="btn btn-ghost"
            style="
                justify-content: flex-start; width: 100%;
                margin-bottom: 0.25rem;
            "
            style:background=move || if is_active() { "var(--surface-overlay)" } else { "" }
            style:color=move || if is_active() { "var(--color-primary)" } else { "" }
            on:click=handle_click
        >
            {label}
        </button>
    }
}
```

- [ ] **Step 4: Create layout/tab_strip.rs**

```rust
// services/frontend-leptos/frontend/src/layout/tab_strip.rs
use leptos::*;
use shared_types::ui_state::Tab;
use crate::app::UiContext;

#[component]
pub fn TabStrip() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");

    view! {
        <div style="
            display: flex;
            border-bottom: 1px solid var(--surface-border);
            padding: 0 1rem;
            background: var(--surface-base);
        ">
            <TabItem label="Pesan & Moderasi" tab=Tab::Messages ui=ui.clone() />
            <TabItem label="Voice & Media" tab=Tab::Live ui=ui.clone() />
            <TabItem label="Dashboard Guild" tab=Tab::Dashboard ui=ui.clone() />
        </div>
    }
}

#[component]
fn TabItem(
    label: &'static str,
    tab: Tab,
    ui: UiContext,
) -> impl IntoView {
    let is_active = move || ui.active_tab.get() == tab;
    view! {
        <button
            on:click=move |_| ui.active_tab.set(tab)
            style="
                padding: 0.75rem 1rem;
                background: none;
                border: none;
                border-bottom: 2px solid transparent;
                font-family: inherit;
                font-size: 0.875rem;
                font-weight: 500;
                cursor: pointer;
                color: var(--text-secondary);
                transition: all var(--transition-fast);
            "
            style:color=move || if is_active() { "var(--color-primary)" } else { "" }
            style:border-bottom-color=move || if is_active() { "var(--color-primary)" } else { "transparent" }
        >
            {label}
        </button>
    }
}
```

- [ ] **Step 5: Create layout/mobile_tab_bar.rs**

```rust
// services/frontend-leptos/frontend/src/layout/mobile_tab_bar.rs
use leptos::*;
use shared_types::ui_state::Tab;
use crate::app::UiContext;

#[component]
pub fn MobileTabBar() -> impl IntoView {
    let ui = use_context::<UiContext>().expect("UiContext not provided");

    view! {
        <div class="hide-desktop" style="
            position: fixed;
            bottom: 0;
            left: 0;
            right: 0;
            display: flex;
            background: var(--surface-base);
            border-top: 1px solid var(--surface-border);
            z-index: var(--z-overlay);
        ">
            <MobileTabItem icon="message-square" label="Pesan" tab=Tab::Messages ui=ui.clone() />
            <MobileTabItem icon="radio" label="Voice" tab=Tab::Live ui=ui.clone() />
            <MobileTabItem icon="shield" label="Dashboard" tab=Tab::Dashboard ui=ui.clone() />
        </div>
    }
}

#[component]
fn MobileTabItem(
    icon: &'static str,
    label: &'static str,
    tab: Tab,
    ui: UiContext,
) -> impl IntoView {
    let is_active = move || ui.active_tab.get() == tab;
    view! {
        <button
            on:click=move |_| ui.active_tab.set(tab)
            style="
                flex: 1;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 0.25rem;
                padding: 0.5rem;
                background: none;
                border: none;
                font-family: inherit;
                font-size: 0.625rem;
                cursor: pointer;
                transition: color var(--transition-fast);
            "
            style:color=move || if is_active() { "var(--color-primary)" } else { "var(--text-tertiary)" }
        >
            <span style="font-size: 1.25rem;">
                // In Phase 2, replace text with lucide-leptos icons
                {icon}
            </span>
            <span>{label}</span>
        </button>
    }
}
```

- [ ] **Step 6: Update lib.rs**

```rust
pub mod layout;
```

- [ ] **Step 7: Integrate layout into app.rs**

Replace the placeholder layout in `app.rs` with proper components:

```rust
use crate::layout::header::Header;
use crate::layout::sidebar::Sidebar;
use crate::layout::tab_strip::TabStrip;
use crate::layout::mobile_tab_bar::MobileTabBar;
use crate::ui::toast::ToastProvider;

// In App component view!, replace with:
view! {
    <ToastProvider>
        <div data-theme="light" style="display: flex; flex-direction: column; height: 100vh;">
            // Auth overlay
            {move || (!auth.authenticated.get()).then(|| {
                view! { <AuthOverlay /> }
            })}

            // Main app shell
            <Header />
            <div style="flex: 1; display: flex; overflow: hidden;">
                <Sidebar />
                <main style="flex: 1; overflow: auto;">
                    <TabStrip />
                    <div style="padding: 1.5rem; max-width: 1280px;">
                        {move || match ui.active_tab.get() {
                            Tab::Messages => view! { <div>"Messages Panel"</div> }.into_view(),
                            Tab::Live => view! { <div>"Live Panel"</div> }.into_view(),
                            Tab::Dashboard => view! { <div>"Dashboard Panel"</div> }.into_view(),
                        }}
                    </div>
                </main>
            </div>
            <MobileTabBar />
        </div>
    </ToastProvider>
}
```

- [ ] **Step 8: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 9: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): layout components — Header, Sidebar, TabStrip, MobileTabBar"
```

---

### Task 11: Integrate auth with API + polish skeleton

**Files:**
- Modify: `services/frontend-leptos/frontend/src/auth.rs` (wire up actual login call)
- Modify: `services/frontend-leptos/frontend/src/app.rs` (wire auth to context, add WS connect on auth)

- [ ] **Step 1: Update auth.rs with login API call**

```rust
// services/frontend-leptos/frontend/src/auth.rs
use leptos::*;
use crate::app::AuthContext;
use crate::api::auth as auth_api;

#[component]
pub fn AuthOverlay() -> impl IntoView {
    let auth = use_context::<AuthContext>().expect("AuthContext not provided");
    let (password, set_password) = create_signal(String::new());
    let (error, set_error) = create_signal(Option::<String>::None);
    let (loading, set_loading) = create_signal(false);

    let handle_submit = move |ev: leptos::ev::SubmitEvent| {
        ev.prevent_default();
        let pwd = password.get();
        if pwd.is_empty() {
            set_error.set(Some("Password diperlukan".to_string()));
            return;
        }
        set_loading.set(true);
        set_error.set(None);

        let auth_clone = auth.clone();
        let pwd_clone = pwd.clone();
        let set_loading_clone = set_loading.clone();
        let set_error_clone = set_error.clone();

        spawn_local(async move {
            match auth_api::login(&pwd_clone).await {
                Ok(true) => {
                    // Store password in sessionStorage
                    if let Some(storage) = web_sys::window()
                        .and_then(|w| w.local_storage().ok())
                        .flatten()
                    {
                        let _ = storage.set_item("admin-password", &pwd_clone);
                    }
                    auth_clone.authenticated.set(true);
                    auth_clone.password.set(pwd_clone);
                }
                Ok(false) => {
                    set_error_clone.set(Some("Login gagal — password salah".to_string()));
                }
                Err(e) => {
                    set_error_clone.set(Some(format!("Error: {}", e.message)));
                }
            }
            set_loading_clone.set(false);
        });
    };

    // ... same view as Task 4 ...
    view! {
        <div class="modal-overlay">
            <div class="modal-content" style="width: 380px;">
                <div class="modal-body" style="text-align: center;">
                    <div style="font-size: 3rem; margin-bottom: 1rem;">
                        <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--color-primary)" stroke-width="2">
                            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                            <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                    </div>
                    <h2 style="font-size: 1.25rem; font-weight: 600; margin-bottom: 0.5rem;">
                        "Akses Dashboard"
                    </h2>
                    <p style="font-size: 0.875rem; color: var(--text-secondary); margin-bottom: 1.5rem;">
                        "Masukkan password admin untuk melanjutkan"
                    </p>
                    <form on:submit=handle_submit style="display: flex; flex-direction: column; gap: 0.75rem;">
                        <input
                            type="password"
                            class="input"
                            placeholder="Password"
                            prop:value=password
                            on:input=move |ev| set_password.set(event_target_value(&ev))
                        />
                        {move || error.get().map(|e| view! {
                            <p style="color: var(--color-error); font-size: 0.75rem;">{e}</p>
                        })}
                        <button
                            type="submit"
                            class="btn btn-primary w-full btn-lg"
                            disabled=move || loading.get()
                        >
                            {move || if loading.get() { "Memproses..." } else { "Masuk" }}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    }
}
```

- [ ] **Step 2: Wire WS connection to auth state in app.rs**

In `app.rs`, make WebSocket connect only after authentication:

```rust
// Inside App component, after provide_context calls:
{
    let ws = ws.clone();
    let auth = auth.clone();
    create_effect(move |_| {
        if auth.authenticated.get() {
            ws.connect();
        }
    });
}
```

- [ ] **Step 3: Verify build**

Run: `cd services/frontend-leptos/frontend && cargo check`
Expected: Compiles with no errors

- [ ] **Step 4: Commit**

```bash
cd /mnt/code/bete
git add services/frontend-leptos/
git commit -m "feat(leptos): auth API integration + WS auth gating"
```

---

## Summary: What We've Built

After Phase 1 and Phase 2, we have:

- ✅ Rust workspace with shared types (complete port of `@bete/shared`)
- ✅ Leptos CSR app scaffold (compiles, builds via trunk)
- ✅ Complete CSS design system (custom properties, dark/light, all component classes, animations)
- ✅ App shell with sidebar, header, tab strip, mobile nav
- ✅ Auth overlay with API login + sessionStorage persistence
- ✅ WebSocket singleton with per-event channels (connect, reconnect, binary/JSON dispatch)
- ✅ API client with all 20+ endpoint functions
- ✅ All 12 shared UI primitives (Button, Badge, Card, Input, Select, Tabs, ScrollArea, Toast, Skeleton, StatusBadge, EmptyState, Modal)
- ✅ Layout components (DashboardLayout, Header, Sidebar, TabStrip, MobileTabBar)

Next phase: **Feature implementation** — Messages (Phase 3), Live (Phase 4), Dashboard (Phase 5), Polish (Phase 6). Each gets its own implementation plan.

## Phase 3-6 Outline

### Phase 3: Messages Feature
- Tasks: MessageFeed (IntersectionObserver), MessageCard/MessageRow (rendering), ImageGrid, ModerationAlertListener, filters, search, reanalyze
- Key challenges: Infinite scroll, message merging/dedup, Discord emoji rendering, embed rendering

### Phase 4: Live Feature
- Tasks: VoiceConnectionCard, ActiveSpeakers, AudioVisualizer (Canvas 2D), MicLevelMeter, NowPlaying, MusicSubPanel, ScreenSubPanel, RecordingsSubPanel, WaveformPlayer (Canvas + Web Audio API), PCM audio playback
- Key challenges: Canvas rendering via web-sys, Web Audio API via web-sys, binary WS frames

### Phase 5: Dashboard Feature
- Tasks: StatsOverview, UserSummaryList (+ pagination), UserProfileDetail, ChannelSummaryList, ChannelProfileDetail
- Key challenges: Reusable cursor pagination, conditional stats rendering

### Phase 6: Polish
- Tasks: ParticleBackground (CSS), MascotChatbot, MascotImage, theme toggle, mobile responsive, edge cases (WS reconnect, stale data, error boundaries)
