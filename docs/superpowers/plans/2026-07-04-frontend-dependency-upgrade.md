# Frontend Dependency Upgrade Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the Bete frontend to the newest feasible Rust/WASM dependency and build-tool surface, including pre-releases when verified.

**Architecture:** The frontend is a Leptos CSR WASM app in the `services/frontend` Cargo workspace. The upgrade is intentionally narrow: update manifests/tooling, refresh `Cargo.lock`, repair only compiler-required compatibility issues, and verify both local Trunk builds and the production proxy Docker build path.

**Tech Stack:** Rust, Cargo workspace, Leptos CSR, Trunk, wasm-bindgen/web-sys, Docker proxy image, pnpm root scripts.

## Global Constraints

- Attempt newest visible releases, including pre-releases, for the main frontend stack.
- Prefer the newest version that passes verification over forcing a broken latest version.
- Initial target versions: `leptos = "0.9.0-alpha"`, `leptos-use = "0.19"`, `lucide-leptos = "3.23"`, `trunk = "0.22.0-beta.1"`.
- The current frontend toolchain is `nightly-2026-06-01`; raise it if needed to satisfy Rust `1.90.0` requirements from Trunk beta.
- Preserve dashboard behavior; do not redesign UI, change backend APIs, or do unrelated refactors.
- Keep edits scoped to manifests, lockfile, build tooling, and compatibility changes directly caused by the upgrade.
- Do not create implementation commits unless the user explicitly grants commit permission for implementation changes in this session.

---

## File Structure

- Modify: `services/frontend/rust-toolchain.toml` — pins the Rust toolchain and `wasm32-unknown-unknown` target for local frontend builds.
- Modify: `services/frontend/frontend/Cargo.toml` — direct dependency declarations for the Leptos CSR app.
- Modify: `services/frontend/shared-types/Cargo.toml` — direct dependency declarations for frontend-shared serde types.
- Modify: `services/frontend/Cargo.lock` — resolved frontend Cargo workspace dependency graph.
- Modify: `infra/docker/Dockerfile.proxy` — production build path that compiles the frontend WASM bundle and serves `dist` from nginx.
- Inspect only unless needed: `.gitlab-ci.yml` — CI already builds the proxy Docker image; only modify if Dockerfile changes require CI variables or arguments.
- Compatibility edits may modify Rust files under `services/frontend/frontend/src/**/*.rs` only when the upgraded crates require API syntax changes.

---

### Task 1: Establish baseline and choose deterministic build tool pins

**Files:**
- Inspect: `services/frontend/rust-toolchain.toml`
- Inspect: `services/frontend/frontend/Cargo.toml`
- Inspect: `infra/docker/Dockerfile.proxy`
- Modify: none in this task

**Interfaces:**
- Consumes: Existing frontend workspace and root scripts.
- Produces: Baseline command results and confirmed target pins for Task 2.

- [ ] **Step 1: Record current git state**

```bash
git status --short
```

Expected: clean except for this plan file if it has not yet been committed. If there are unrelated user changes, stop and report them before editing dependency files.

- [ ] **Step 2: Run current frontend typecheck baseline**

```bash
pnpm run typecheck:web
```

Expected: PASS before dependency edits. If this fails before edits, save the output and report that the baseline is already broken.

- [ ] **Step 3: Run current frontend release build baseline**

```bash
pnpm run build:web
```

Expected: PASS before dependency edits. If this fails before edits, save the output and report that the baseline is already broken.

- [ ] **Step 4: Confirm latest target metadata**

```bash
cargo info leptos
cargo info leptos-use
cargo info lucide-leptos
cargo info trunk
```

Expected: metadata includes at least these target versions unless newer releases appeared during implementation:

```text
leptos 0.9.0-alpha
leptos-use 0.19.0
lucide-leptos 3.23.0
trunk 0.22.0-beta.1
```

If newer versions appear, use the same max-feasible policy: attempt the newest visible version, including pre-release, then fall back only if verification fails.

---

### Task 2: Update frontend toolchain and deterministic Docker Trunk install

**Files:**
- Modify: `services/frontend/rust-toolchain.toml`
- Modify: `infra/docker/Dockerfile.proxy`
- Inspect: `.gitlab-ci.yml`

**Interfaces:**
- Consumes: Target Trunk version from Task 1.
- Produces: A deterministic local/Docker build-tool surface for dependency compilation.

- [ ] **Step 1: Replace the frontend toolchain pin**

Edit `services/frontend/rust-toolchain.toml` to this content:

```toml
[toolchain]
channel = "nightly-2026-07-04"
components = ["rust-src", "rustc-dev"]
targets = ["wasm32-unknown-unknown"]
```

Rationale: the frontend currently has no `#![feature(...)]` gates, but keeping nightly avoids changing compiler channel semantics while moving past the Rust `1.90.0` requirement advertised by Trunk beta.

- [ ] **Step 2: Verify the selected toolchain exists**

```bash
cd services/frontend && rustup show active-toolchain && rustc --version
```

Expected: active toolchain is `nightly-2026-07-04` or rustup installs it and then reports a Rust version at or above `1.90.0-nightly`.

If `nightly-2026-07-04` is unavailable, use the newest installed or installable nightly at or after 2026-07-04 that satisfies Rust `1.90.0` and update `services/frontend/rust-toolchain.toml` to that exact date.

- [ ] **Step 3: Pin Trunk in the production proxy Dockerfile**

In `infra/docker/Dockerfile.proxy`, replace:

```dockerfile
RUN cargo install trunk --locked
```

with:

```dockerfile
RUN cargo install trunk --version 0.22.0-beta.1 --locked
```

- [ ] **Step 4: Inspect CI for required changes**

```bash
grep -n "build-proxy\|Dockerfile.proxy\|SERVICE_NAME" .gitlab-ci.yml
```

Expected: CI builds `infra/docker/Dockerfile.$SERVICE_NAME` with `SERVICE_NAME: proxy`, so no `.gitlab-ci.yml` change is required.

If CI does not build `Dockerfile.proxy`, update the CI job so `build-proxy` builds `infra/docker/Dockerfile.proxy` and keep the existing image tags.

- [ ] **Step 5: Check formatting of edited non-Rust files**

```bash
git diff -- services/frontend/rust-toolchain.toml infra/docker/Dockerfile.proxy .gitlab-ci.yml
```

Expected: diff only changes the toolchain channel and Trunk install version unless CI inspection revealed a real mismatch.

---

### Task 3: Upgrade Cargo manifests and refresh the frontend lockfile

**Files:**
- Modify: `services/frontend/frontend/Cargo.toml`
- Modify: `services/frontend/shared-types/Cargo.toml`
- Modify: `services/frontend/Cargo.lock`

**Interfaces:**
- Consumes: Toolchain and Docker Trunk pin from Task 2.
- Produces: Updated Cargo dependency declarations and resolved lockfile for Task 4.

- [ ] **Step 1: Update direct frontend app dependencies**

Edit the `[dependencies]` section in `services/frontend/frontend/Cargo.toml` to keep the existing dependency list and set these version requirements:

```toml
leptos = { version = "0.9.0-alpha", features = ["csr"] }
leptos-use = "0.19"
lucide-leptos = "3.23"
wasm-bindgen = "0.2"
wasm-bindgen-futures = "0.4"
js-sys = "0.3"
web-sys = { version = "0.3", features = [
    "WebSocket",
    "MessageEvent",
    "CloseEvent",
    "ErrorEvent",
    "CanvasRenderingContext2d",
    "AudioContext",
    "AudioBuffer",
    "AudioBufferSourceNode",
    "AudioDestinationNode",
    "AudioNode",
    "AudioProcessingEvent",
    "MediaStreamAudioSourceNode",
    "ScriptProcessorNode",
    "Window",
    "Document",
    "Element",
    "HtmlElement",
    "HtmlSelectElement",
    "KeyboardEvent",
    "Storage",
    "IntersectionObserver",
    "ResizeObserver",
    "Url",
    "Headers",
    "Request",
    "RequestInit",
    "RequestMode",
    "Response",
    "HtmlInputElement",
    "HtmlAudioElement",
    "HtmlCanvasElement",
    "MediaDevices",
    "MediaStream",
    "MediaStreamConstraints",
    "MediaStreamTrack",
    "Navigator",
    "console",
] }
gloo-net = "0.6"
gloo-timers = "0.3"
serde = { version = "1", features = ["derive"] }
serde_json = "1"
serde-wasm-bindgen = "0.6"
wasm-logger = "0.2"
console_error_panic_hook = "0.1"
regex = "1"
```

Do not remove `shared-types = { path = "../shared-types" }`.

- [ ] **Step 2: Keep shared-types serde on latest compatible major**

Confirm `services/frontend/shared-types/Cargo.toml` still contains:

```toml
[dependencies]
serde = { version = "1", features = ["derive"] }
```

No change is required unless `cargo update` reports a resolver issue.

- [ ] **Step 3: Refresh the frontend workspace lockfile**

```bash
cd services/frontend && cargo update
```

Expected: `services/frontend/Cargo.lock` updates to resolved versions compatible with the new manifest requirements.

- [ ] **Step 4: Check direct resolved versions**

```bash
cargo tree --manifest-path services/frontend/frontend/Cargo.toml -e normal --depth 1
```

Expected: direct tree includes the newest feasible resolved versions, ideally:

```text
leptos v0.9.0-alpha
leptos-use v0.19.0
lucide-leptos v3.23.0
```

If Cargo cannot resolve `leptos 0.9.0-alpha` with `leptos-use 0.19`, try the newest mutually compatible pair and record the resolver error and fallback pair in the final report.

---

### Task 4: Run compiler-driven compatibility repairs

**Files:**
- Modify as needed: `services/frontend/frontend/src/**/*.rs`
- Modify as needed: `services/frontend/frontend/Cargo.toml` only for documented fallback versions
- Modify as needed: `services/frontend/Cargo.lock` after fallback changes

**Interfaces:**
- Consumes: Upgraded dependency graph from Task 3.
- Produces: A compiling Leptos frontend with behavior-preserving source compatibility fixes.

- [ ] **Step 1: Run the upgraded typecheck**

```bash
pnpm run typecheck:web
```

Expected: either PASS, or FAIL with concrete compiler errors from upgraded Leptos/tooling.

- [ ] **Step 2: Apply compatibility fix pattern A for Leptos mount changes if needed**

If the compiler reports that `leptos::mount::mount_to_body(app::App)` no longer matches the expected signature, edit `services/frontend/frontend/src/lib.rs` from:

```rust
    // Mount the Leptos app to the body
    leptos::mount::mount_to_body(app::App);
```

to:

```rust
    // Mount the Leptos app to the body
    leptos::mount::mount_to_body(|| leptos::view! { <app::App /> });
```

Then rerun:

```bash
pnpm run typecheck:web
```

Expected: the mount signature error disappears.

- [ ] **Step 3: Apply compatibility fix pattern B for removed empty-view hacks if needed**

If the compiler reports errors around statements like `let _: () = view! { <></> };` or converting `()` into a view, replace the empty branch with an explicit empty view.

For `services/frontend/frontend/src/features/live/components/voice_connection_card.rs`, replace:

```rust
                        } else {
                            let _: () = view! { <></> };
                            ().into_any()
                        }
```

with:

```rust
                        } else {
                            view! { <></> }.into_any()
                        }
```

Then rerun:

```bash
pnpm run typecheck:web
```

Expected: the empty-view conversion error disappears.

- [ ] **Step 4: Apply compatibility fix pattern C for signal constructor changes if needed**

If the compiler reports that `RwSignal::new(...)` is unavailable or deprecated as an error under Leptos alpha, convert local signal creation to the Leptos function form.

Example replacement in `services/frontend/frontend/src/app.rs`:

```rust
let auth = AuthContext {
    authenticated: RwSignal::new(false),
    password: RwSignal::new(String::new()),
};
```

becomes:

```rust
let auth = AuthContext {
    authenticated: RwSignal::new(false),
    password: RwSignal::new(String::new()),
};
```

Expected: no edit is needed unless the compiler makes this an error. If it is an error and Leptos documents a replacement such as `RwSignal::new_with_options` or `signal`, apply the smallest mechanical change consistently to all reported sites and rerun `pnpm run typecheck:web`.

- [ ] **Step 5: Apply compatibility fix pattern D for event and property macro changes if needed**

If the compiler reports `view!` macro errors around event/property syntax, keep the current behavior and update only the reported syntax. Typical sites include:

```rust
on:click=move |_| active_tab.set(tab4.clone())
prop:value=selected_guild
class:btn=true
style:background=move || if active_tab.get() == tab2 { "var(--surface-overlay)" } else { "" }
```

For each compiler-reported macro error, change only the syntax required by the new macro and rerun:

```bash
pnpm run typecheck:web
```

Expected: each macro error is removed without changing UI classes, inline styles, event behavior, or signal reads.

- [ ] **Step 6: Decide fallback if alpha migration exceeds scope**

If `leptos 0.9.0-alpha` causes broad API breakage across many components and the typecheck cannot be repaired with behavior-preserving mechanical edits, fall back to newest stable Leptos visible in `cargo info leptos` or documented by Cargo metadata.

Use these commands to test the fallback:

```bash
cd services/frontend
cargo update -p leptos --precise 0.8.14
cargo update
cd ../..
pnpm run typecheck:web
```

Expected: fallback version typechecks after minimal compatibility repairs. Record the attempted alpha error summary and selected fallback in the final report.

- [ ] **Step 7: Finish with a passing typecheck**

```bash
pnpm run typecheck:web
```

Expected: PASS.

---

### Task 5: Verify release build, lint/test scope, and production Docker path

**Files:**
- Inspect: `package.json`
- Inspect: `.gitlab-ci.yml`
- Inspect/modify only if required: `infra/docker/Dockerfile.proxy`

**Interfaces:**
- Consumes: Compiling upgraded frontend from Task 4.
- Produces: Verification evidence for the final response.

- [ ] **Step 1: Run the frontend release build**

```bash
pnpm run build:web
```

Expected: PASS and Trunk writes release assets to `services/frontend/frontend/dist`.

- [ ] **Step 2: Run root lint if relevant to changed files**

```bash
pnpm run lint
```

Expected: PASS. If Biome does not cover the changed Rust/TOML/Docker files and running lint is not useful, report that it was skipped and why.

- [ ] **Step 3: Run tests if relevant**

```bash
pnpm run test
```

Expected: PASS if tests are runnable in this environment. If tests are unrelated to the frontend Rust workspace or fail for pre-existing service reasons, report the exact result and do not claim all tests pass.

- [ ] **Step 4: Verify the production proxy Docker build path if Docker is available**

```bash
docker build -f infra/docker/Dockerfile.proxy .
```

Expected: PASS and the build reaches the nginx runner stage after compiling the frontend WASM bundle.

If Docker is unavailable, permission-denied, or impractical in this environment, report that Docker verification was skipped with the exact error and rely on the passing local Trunk release build as the minimum production-path proxy.

- [ ] **Step 5: Inspect final dependency and build-tool diff**

```bash
git diff -- services/frontend/rust-toolchain.toml services/frontend/frontend/Cargo.toml services/frontend/shared-types/Cargo.toml services/frontend/Cargo.lock infra/docker/Dockerfile.proxy .gitlab-ci.yml services/frontend/frontend/src
```

Expected: diff contains only dependency/toolchain/build pin changes and compatibility edits required by the upgrade.

---

### Task 6: Final review and report

**Files:**
- Inspect: all changed files from `git status --short`
- Modify: none unless review finds a concrete issue

**Interfaces:**
- Consumes: Verification evidence from Task 5.
- Produces: Final user-facing summary with versions, fallbacks, and verification results.

- [ ] **Step 1: Summarize changed files**

```bash
git status --short
```

Expected: changed files are limited to the plan, frontend manifests/lockfile/toolchain, Dockerfile/CI if needed, and frontend Rust compatibility edits if needed.

- [ ] **Step 2: Check resolved direct frontend versions**

```bash
cargo tree --manifest-path services/frontend/frontend/Cargo.toml -e normal --depth 1
```

Expected: output shows the final resolved versions for `leptos`, `leptos-use`, `lucide-leptos`, and support crates.

- [ ] **Step 3: Prepare final response**

Include this information:

```text
- Dependency targets attempted: leptos, leptos-use, lucide-leptos, trunk.
- Final resolved versions: copied from cargo tree/cargo metadata.
- Toolchain version: copied from services/frontend/rust-toolchain.toml and rustc --version.
- Fallbacks: none, or exact attempted version -> selected version with reason.
- Verification: exact commands run and PASS/FAIL/SKIPPED status.
- Docker: built successfully, or skipped with exact environment limitation.
```

- [ ] **Step 4: Stop before committing implementation changes unless permission was granted**

```bash
git diff --stat
```

Expected: final diff is ready for the user to review. Do not run `git commit` unless the user explicitly asks for a commit.
