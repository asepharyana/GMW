# GMW — Agent Guide

GMW (Guild Moderation Watcher) is a Discord bot + web dashboard for AI-powered moderation. A monorepo with three services: a selfbot gateway that captures Discord events and runs LLM moderation, an Express/oRPC backend that serves the dashboard API, and a Next.js 16 SSR frontend. They communicate via Redis pub/sub (gateway→backend) and WebSocket (backend→browser).

## Quick reference

```bash
# Per-service — cd into the service first
bun install              # install deps (bun 1.3.14, not pnpm/npm)
bun typecheck            # tsc --noEmit
bun lint                 # biome check
bun format               # biome format --write
bun build                # gateway/backend: tsc + fix-imports.mjs; frontend: next build
bun test                 # bun test tests/ (gateway & backend only — frontend has no tests)
```

No monorepo-level scripts exist. Run each command from inside the service directory.

## Layout

```
services/
├── discord-gateway/   Event-driven selfbot. No HTTP (except :4016 metrics).
│   ├── src/
│   │   ├── app/            Bootstrap, shutdown, retention
│   │   ├── modules/        Feature modules — each self-contained
│   │   └── shared/         Config, DB (Drizzle), logger, errors, utils
│   ├── tests/              Vitest tests (colocated, not inside src/)
│   ├── drizzle/migrations/ DB migrations
│   └── scripts/fix-imports.mjs  Post-build: rewrites @/ aliases → relative .js
│
├── backend/           Express HTTP + WebSocket + oRPC server (:4001).
│   ├── src/
│   │   ├── modules/        Feature modules (schema→repo→service→controller→routes)
│   │   ├── http/           Express app setup
│   │   ├── ws/             WebSocket server + Redis bridge
│   │   ├── orpc/           oRPC router definition
│   │   └── shared/         Config, DB, errors, Redis, logger
│   └── tests/              Vitest tests
│
└── frontend/          Next.js 16 App Router, React 19, Tailwind v4 (:4017).
    ├── src/
    │   ├── src/            Pages — route groups under (dashboard)/
    │   ├── components/     UI components (primitives, shell, charts, etc.)
    │   ├── hooks/          React hooks
    │   └── lib/            API clients, types, utils, WebSocket, audio
    ```

    ## Conventions

    ### Package manager & runtime

    - **bun** (v1.3.14), package manager + test runner. Lockfiles (`bun.lock`) are committed. Node 22 is still used at runtime for the tsc-built `dist/` (via `fix-imports.mjs`), plus bun for dev/install/test. Bun is NOT the production runtime for gateway/backend — the Nix wrapper execs `node dist/index.js` — so native modules resolve against the Node ABI (e.g. `@discordjs/opus` prebuilds for node-v127).
    - ESM throughout (`"type": "module"` in all package.json files).
    - Test runner: **bun test** (`bun test tests/`). The old vitest configs are replaced by `bunfig.toml` `[test] preload = ["./tests/setup-env.ts"]` — note bun 1.3.14 **ignores `[test] env`**, so env vars for tests go in the preload file. Bun's jest-compat layer aliases most vitest APIs (`vi.fn`→`jest.fn`, `vi.useFakeTimers`→`jest.useFakeTimers`, `vi.spyOn`→`spyOn`, `vi.mock`→`mock.module`), but there is no `vi.waitFor` or `jest` global — use the small `waitForCompat` helper in `tests/placeholder.test.ts`.
- ESM throughout (`"type": "module"` in all package.json files).

### Import style

Source files use `@/*` path aliases (mapped in tsconfig to `./src/*`). Relative imports **must include the `.js` extension** (e.g., `from "./embed.js"`). The `moduleResolution: "bundler"` tsconfig setting allows bare specifiers during dev, but `tsc` emits them as-is. A post-build script (`scripts/fix-imports.mjs`) rewrites both `@/` aliases and extensionless imports in `dist/` so Node ESM can resolve them at runtime.

### Error handling

Both gateway and backend define an `AppError` base class in `@/shared/errors/index` with subclasses: `ValidationError` (400), `NotFoundError` (404), `UnauthorizedError` (401), `DatabaseError` (500), `ConfigError` (500). Services throw these; callers or middleware map them to HTTP status codes.

### Logging

Use `createChildLogger('module-name')` from `@/shared/logger/index`. Never use raw `console`. It wraps pino; in development it pretty-prints via `pino-pretty`.

### Config

Environment variables are validated with Zod at startup in `shared/config/index.ts` of both gateway and backend. Do not read `process.env` directly outside config modules.

### Module boundaries

- Gateway: each feature lives in `src/modules/<name>/` with its own `index.ts` barrel. Modules register event listeners and are composed in `src/app/bootstrap.ts`.
- Backend: `modules/<name>/` follows schema → repository → service → controller → routes. Data flows up only. No cross-module repository imports.
- Frontend: `page.tsx` is a server component that fetches data via `src/lib/api/server.ts` (oRPC over HTTP, server-side only) and passes it to a `view.tsx` client component. Browser code uses `src/lib/orpc/client.ts` (oRPC over WebSocket via partysocket). Never import the server API client from a client component.

### API layer

The backend exposes an oRPC router mounted at `/trpc` (both HTTP and WebSocket). The frontend does **not** use a REST `/api/*` layer — all data goes through oRPC procedures. The server-side client (`src/lib/api/server.ts`) uses a fetch-based RPCLink; the browser client uses a WebSocket-based RPCLink backed by partysocket for auto-reconnection. Results are asserted to the frontend's local types at each call site (the backend's router type is not imported into the frontend).

### Testing

- **Gateway**: Vitest, tests in `tests/` at the service root. Config sets env vars (`DISCORD_TOKEN`, `DATABASE_URL`, etc.) so tests run without real services.
- **Backend**: Vitest, tests in `tests/` and `src/`. Includes an `e2e.test.ts` excluded from CI (needs a live backend).
- **Frontend**: No test runner configured.
- Tests are pure-function / unit-level. Mock external dependencies; do not start real DB/Redis in tests.

### Formatting

Biome, 2-space indent, spaces. Config at repo root `biome.json`. `lint` uses `--diagnostic-level=error`; `format` auto-writes.

## Pitfalls

1. **Never commit without running `fix-imports.mjs` after `tsc`** — gateway and backend builds will produce ESM that crashes at startup (`ERR_MODULE_NOT_FOUND`).
2. **Don't add `@discordjs/opus` build-from-source flags** — it ships prebuilt binaries for Node 22. Forcing source builds in CI/Nix will fail or add minutes of compile time.
3. **Frontend SSR fetches are always `cache: "no-store"`** — the server API client bypasses Next.js fetch cache. Do not add caching without understanding the live dashboard requirement.
4. **oRPC types are loosely coupled** — the frontend casts oRPC results to its own types with `as unknown`. Adding a field to the backend schema does not automatically update the frontend type. Update both sides.
5. **Gateway is a selfbot** (`discord.js-selfbot-v13`) — it uses a user token, not a bot token. It must not be deployed as a standard Discord bot.
