# Spec: <Judul singkat, aktif, deskriptif>

Status: **DRAFT** | **APPROVED** | **IN PROGRESS** | **DONE**
Date: YYYY-MM-DD
Author: <nama/agent>
Related: <link ke spec/plan terkait jika ada>
Todo: <link ke todo.md untuk tugas ini, jika ada>

## Problem

<Deskripsi masalah atau keinginan. Apa yang rusak? Apa yang belum ada?
Sebutkan siapa yang melaporkan (user/bot/audit) dan konteksnya.
Gunakan **evidence**: log, error, metrik, atau observasi langsung.>

## Root cause

<Analisis teknis mengapa masalah ini terjadi. Jika bug: trace dari symptom ke cause.
Jika fitur baru: jelaskan gap saat ini. Referensikan file + line number yang relevan.>

## Behavior target

<Deskripsi eksplisit perilaku yang diharapkan setelah fix/fitur.
Buat list bernomor. Setiap item harus bisa di-verify.>

## Verified facts

>Fakta-fakta teknis yang **sudah diverifikasi** dari pembacaan kode, log produksi,
>atau eksperimen langsung. Setiap fakta harus citation ke file:line.
>Jika belum diverifikasi, tulis `UNVERIFIED` dan rencana verifikasi.

- `path/to/file.ts:42` — <apa yang terjadi di sini>
- `path/to/file.ts:88` — <apa yang terjadi di sini>
- Kolom DB `table.column` — <tipe, constraint, index>
- Config `ENV_VAR` default <value> — <dibaca di mana>

## Keputusan desain

<Pilihan desain yang dibuat, beserta rationale (mengapa bukan alternatif lain).
Format: nomor, judul singkat, penjelasan.>

1. **<Judul keputusan>**: <penjelasan + rationale>
   - Alternatif yang ditolak: <apa + mengapa ditolak>

## Perubahan file

>Daftar **semua file** yang perlu diubah/ditambah/dihapus, dikelompokkan per service.
>Untuk setiap file: sebutkan **apa yang berubah** (bukan copy-paste kode).

### Gateway (`services/discord-gateway/`)
- `src/modules/<module>/<file>.ts` — <ringkasan perubahan>

### Backend (`services/backend/`)
- `src/modules/<module>/<file>.ts` — <ringkasan perubahan>

### Frontend (`services/frontend/`)
- `src/<path>/<file>.ts|tsx` — <ringkasan perubahan>

### Database / Config
- <migration file atau config change jika ada>

## Schema/type changes

<Perubahan tipe, interface, atau DB schema. Jika tidak ada, tulis "TIDAK ada perubahan.">

## Verification

>**Harus spesifik dan executable.** Jangan tulis "works correctly".
>Tulis command yang bisa dijalankan dan expected outcome.

- **Typecheck**: `<service> pnpm typecheck` — clean
- **Lint**: `<service> pnpm lint` — no errors
- **Build**: `<service> pnpm build` — compiles
- **Test**: `<service> pnpm test` — all pass (+ test baru jika ada)
- **Smoke test**: <langkah manual untuk verifikasi visual/behavioral>
- **DB**: <query untuk cek data jika applicable>
- **Deploy**: CI green → deploy → cek <specific observable>

## Notes (opsional)

<Catatan tambahan: risiko, fallback, future work, atau hal yang sengaja di-scope-out.>