# GMW — Agent Development Guide

> **Rule #1: No code without a spec.**
> Setiap perubahan signifikan dimulai dari spec di `docs/specs/`.
> Baca spec → verifikasi facts → implement → verify → commit.
> Gunakan `todo.md` (TODO list terdokumentasi) untuk melacak progress.

## Project overview

GMW (Go Mod Watch) adalah Discord bot + dashboard untuk AI-powered moderation.
Monorepo berisi 3 service utama:

| Service | Path | Port | Tech |
|---|---|---|---|
| **discord-gateway** | `services/discord-gateway/` | 4016 (metrics) | discord.js-selfbot-v13, Piscina, Drizzle ORM, pino |
| **backend** | `services/backend/` | 4001 | Express, oRPC, Drizzle ORM, Redis pub/sub, Vitest |
| **frontend** | `services/frontend/` | 4017 (standalone) | Next.js 16 App Router, React 19, Tailwind v4, SWR |

## Data flow

```
Discord → discord-gateway → Redis pub/sub → backend (:4001) ←→ frontend Next.js SSR
                                                   ↑ REST /api/*
                                                   └ WS /ws
```

- Gateway = event-driven (no HTTP, except Prometheus :4016/metrics)
- Backend = HTTP + WebSocket server, serves the frontend
- Frontend = SSR (RSC) + client hydration, proxied by nginx :4009

## Konvensi dokumentasi: `docs/`

Semua dokumen kerja ada di `docs/`, bukan di `.hermes/`:

```
docs/
├── README.md                  # Panduan workflow (spec-driven + todo)
├── spec-template.md           # Template spec standar
├── todo-template.md           # Template todo list
└── specs/                     # Semua spec & implementation plan
    ├── YYYY-MM-DD_<slug>-spec.md    # Spec (apa & mengapa)
    └── YYYY-MM-DD_<slug>.md         # Plan/fix (spec + plan dalam satu file)
```

Service-specific docs: `services/<service>/docs/specs/`.

## Workflow: Spec-Driven Development

### Checklist wajib untuk setiap perubahan signifikan

1. **Tulis spec** → `docs/specs/YYYY-MM-DD_<slug>-spec.md`
2. **Tulis `todo.md`** → daftar task konkret yang bisa diceklis
3. **Verifikasi facts** → baca kode aktual, konfirmasi referensi file:line
4. **Keputusan desain** → pilih approach, dokumentasikan alternatif yang ditolak
5. **Implementasi** → ikuti spec + todo step-by-step
6. **Verifikasi** → jalankan semua verification steps dari spec
7. **Commit** → reference spec di commit message

### Todo list (`todo.md`)

Setiap tugas berjalan WAJIB punya `todo.md`. Format:

```markdown
# Todo — <judul tugas>

## Task
- [ ] Tulis spec
- [ ] Verifikasi facts (baca kode: file:line)
- [ ] Implementasi tahap 1: ...
- [ ] Implementasi tahap 2: ...
- [ ] Verifikasi: pnpm typecheck / lint / build / test
- [ ] Commit + push
```

Aturan:
- Task harus **konkret & verifiable** — bukan "fix bug", tapi "ubah X di file Y".
- Ceklis `[x]` saat selesai, jangan menunggu batch di akhir.
- Gunakan `docs/todo-template.md` sebagai template.
- Simpan `todo.md` di `docs/` untuk tugas lintas-service, atau di
  `services/<service>/docs/` untuk tugas satu service.

### Spec template

Salin `docs/spec-template.md` untuk setiap spec baru. Sections:

1. **Problem** — apa yang rusak/missing, dengan evidence
2. **Root cause** — analisis teknis (bukan symptom)
3. **Behavior target** — perilaku setelah fix, daftar verifiable
4. **Verified facts** — fakta dari pembacaan kode, citation ke file:line
5. **Keputusan desain** — pilihan + rationale + alternatif ditolak
6. **Perubahan file** — semua file yang disentuh, per service
7. **Schema/type changes** — perubahan tipe/DB
8. **Verification** — command executable + expected outcome

### Kapan perlu spec + todo.md

Perlu: fitur baru, bug fix non-trivial, refactor behavior-changing, perubahan
DB schema, perubahan API contract, perubahan arsitektur.

Tidak perlu: typo fix, dep bump, format/lint auto-fix, test-only, README update.

Baca selengkapnya di `docs/README.md`.

## Coding conventions

### General

- **TypeScript strict mode** — semua service
- **Biome** — formatting + linting (`pnpm format`, `pnpm lint`)
- **Bun** — package manager (`bun install`, `bun run`)
- **Bisa bilingual** — code comments & specs boleh Indonesia/English

### Per-service conventions

#### discord-gateway
- **Event-driven** — no HTTP server (except metrics). Listeners → Redis pub/sub.
- **Module pattern**: `src/modules/<module>/` — each module encapsulates own logic.
- **Piscina pools**: text pool (4 threads) + media pool (2 threads), each with own pg Pool.
- **Logger**: `createChildLogger('module-name')` — never raw `console`.
- **Config**: Zod-validated env in `shared/config/index.ts` — single source of truth.
- **DB**: Drizzle ORM. Migrations in `drizzle/migrations/`.
- **Invariant**: LLM is the only judge. Never reintroduce regex content classification.
- **Invariant**: Discord tokens sanitized before reaching LLM.
- Lihat `services/discord-gateway/AGENTS.md` untuk detail.

#### backend
- **Modular MVC**: `modules/<module>/` — schema → repository → service → controller → routes.
- **No cross-module repo imports** — each module owns its data.
- **Data flows up only**: Repository → Service → Controller.
- **Error hierarchy**: `AppError` subclasses with code + statusCode.
- **Config**: Zod-validated env in `shared/config/index.ts`.
- **API**: oRPC for type-safe procedures + standard Express routes.
- Lihat `services/backend/AGENTS.md` untuk detail.

#### frontend
- **SSR-first**: `page.tsx` (server component) → fetch via `src/lib/api/server.ts` → pass to `view.tsx` (client).
- **No auth**: all endpoints public.
- **Never hardcode host**: same-origin or `GMW_BACKEND_URL` only.
- **WebSocket**: `src/lib/ws/` — auto-reconnecting, typed events.
- **Local dev**: `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`, `GMW_BACKEND_URL`.
- Lihat `services/frontend/AGENTS.md` untuk detail Next.js rules.

## Build & Verify

```bash
# Per service (run from service root)
pnpm typecheck          # TypeScript strict
pnpm lint               # Biome check
pnpm build              # Compile
pnpm test               # Vitest (gateway & backend only)
pnpm format             # Biome auto-format
```

## Commit conventions

```
<type>(<scope>): <subject>

<optional body>

Ref: docs/specs/<spec-file>.md
```

Types: `feat`, `fix`, `refactor`, `test`, `docs`, `chore`, `build`, `ci`

## Deployment

CI/CD: GitHub Actions → build → deploy to production server via Nix flakes.
- Gateway: `nixos-rebuild` or `systemctl restart gmw-discord-gateway`
- Backend: `nixos-rebuild` or `systemctl restart gmw-backend`
- Frontend: Next.js standalone, proxied by nginx :4009

## Remember

- Spec dulu, code belakangan.
- Todo list (`todo.md`) wajib untuk tugas yang berjalan — ceklis tiap selesai.
- Verified facts harus dari pembacaan kode aktual, bukan asumsi.
- Setiap change harus verifiable — tulis command di spec.
- One spec = one focused change. Don't mix unrelated features.