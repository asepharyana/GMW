# Frontend dependency upgrade design

Date: 2026-07-04

## Goal

Upgrade the Bete frontend to the newest feasible dependency and build-tool surface, including pre-release versions when they can be verified. The upgrade should preserve dashboard behavior and leave the repository in a buildable state.

## Scope

The frontend upgrade covers the full Rust/WASM frontend build surface:

- `services/frontend/frontend/Cargo.toml`
- `services/frontend/shared-types/Cargo.toml`
- `services/frontend/Cargo.lock`
- `services/frontend/rust-toolchain.toml`
- root frontend scripts when they need to reflect tool changes
- production frontend build path in `infra/docker/Dockerfile.proxy`
- CI integration in `.gitlab-ci.yml` only if required by the Docker/build changes

The upgrade does not include UI redesign, feature changes, backend API changes, or unrelated refactors.

## Target dependency policy

Use a "max feasible" policy:

1. Attempt the newest visible releases, including pre-releases, for the main frontend stack.
2. Prefer the newest version that passes verification over forcing a broken latest version.
3. If a pre-release blocks compilation or requires migration work outside this upgrade's scope, pin the newest passing version and document the blocker.

Initial target versions discovered during design:

- `leptos = "0.9.0-alpha"`
- `leptos-use = "0.19"`
- `lucide-leptos = "3.23"`
- `trunk = "0.22.0-beta.1"`

Support crates such as `wasm-bindgen`, `wasm-bindgen-futures`, `web-sys`, `js-sys`, `serde`, `serde_json`, `serde-wasm-bindgen`, `gloo-net`, `gloo-timers`, `wasm-logger`, `console_error_panic_hook`, and `regex` should be updated through Cargo resolution unless direct manifest changes are needed.

## Toolchain and production build alignment

The current frontend toolchain is pinned to `nightly-2026-06-01`. The latest Trunk beta advertises a Rust requirement of `1.90.0`, so the toolchain must be checked and raised if needed.

The production proxy image currently runs:

```dockerfile
RUN cargo install trunk --locked
```

That is non-deterministic over time because it installs whatever `trunk` is latest when the image is built. The upgrade should make this deterministic, preferably by pinning the intended Trunk version explicitly:

```dockerfile
RUN cargo install trunk --version 0.22.0-beta.1 --locked
```

If the beta package fails with `--locked`, the implementation may either adjust the install command with a documented reason or fall back to the newest verified Trunk version.

## Migration strategy

1. Establish a baseline by running the existing frontend check/build commands before changing dependencies.
2. Upgrade build tooling first so local and Docker builds agree on Rust and Trunk versions.
3. Upgrade the main frontend crates in `Cargo.toml` and refresh `Cargo.lock`.
4. Fix compatibility errors caused by Leptos, Leptos-use, Lucide, or support-crate API changes.
5. Keep fixes behavior-preserving. Avoid UI redesign and broad refactoring.
6. If a dependency cannot be upgraded to the initial target, record the attempted version, the failure mode, and the chosen fallback.

## Verification plan

Run these checks after the upgrade:

1. `pnpm run typecheck:web`
2. `pnpm run build:web`
3. `pnpm run lint` if changed files are covered by Biome or root linting
4. `pnpm run test` if the changes affect packages with runnable tests; otherwise explicitly report that tests were skipped and why
5. Prefer `docker build -f infra/docker/Dockerfile.proxy .` to validate the production frontend build path

If Docker is unavailable or impractical in the environment, report that limitation and rely on the local Trunk release build as the minimum build verification.

## Success criteria

- The frontend Cargo workspace resolves cleanly.
- The WASM release build succeeds.
- The production proxy Dockerfile uses a deterministic Trunk/toolchain path or has a documented reason for any exception.
- No intentional dashboard behavior or visual design changes are introduced.
- Any dependency left below the newest attempted version has a clear documented reason.

## Risks and mitigations

- **Leptos alpha API churn:** Fix only compatibility issues required for compilation and runtime preservation. Roll back to the newest verified Leptos version if the migration becomes too broad.
- **Trunk beta toolchain requirement:** Align Rust toolchain and Docker install commands before validating the app build.
- **Local build passing while Docker fails:** Verify the proxy Dockerfile when possible because production serves the frontend from that image.
- **Unrelated churn:** Keep edits scoped to manifests, lockfile, build tooling, and compatibility changes directly caused by the upgrade.
