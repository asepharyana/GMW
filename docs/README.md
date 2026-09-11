# docs/ — Spec-Driven Development Hub

Direktori ini adalah pusat dari workflow **spec-driven development** di GMW.
Semua perubahan signifikan dimulai dari satu spec, **sebelum kode ditulis**,
dan setiap tugas yang berjalan dilacak lewat `todo.md`.

## Struktur

```
docs/
├── README.md                 # Dokumen ini
├── spec-template.md          # Template standar untuk semua spec
├── todo-template.md          # Template todo list
└── specs/                    # Semua spec dan implementation plan
    ├── YYYY-MM-DD_<slug>-spec.md   # Spec (apa & mengapa)
    └── YYYY-MM-DD_<slug>.md        # Plan/fix (bisa langsung spec+plan)
```

### Naming convention

```
YYYY-MM-DD_<slug>-spec.md     # Spec baru untuk fitur/fix
YYYY-MM-DD_<slug>.md          # Plan yang sudah include spec di dalamnya
```

Contoh:
- `2026-08-30_recordings-v2-features-spec.md` — spec untuk Recordings v2
- `2026-08-24-attachment-delay-fix.md` — spec + plan untuk attachment delay fix

### Service-specific docs

```
services/<service>/docs/specs/  # Spec yang spesifik untuk 1 service
```

## Workflow: Spec-Driven Development

### Prinsip utama

> **No code without a spec.** Semua perubahan signifikan harus punya spec
> terlebih dahulu. Spec adalah kontrak: apa yang akan dibangun, mengapa,
> dan bagaimana memverifikasinya.

### Todo list (`todo.md`) — WAJIB

Setiap tugas berjalan (implementasi fitur/fix) harus punya `todo.md`:

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

Aturan `todo.md`:
- Task **konkret & verifiable** — "ubah X di file Y", bukan "fix bug".
- Satu task `[in_progress]` pada satu waktu; ceklis `[x]` segera setelah selesai.
- Gunakan `docs/todo-template.md` sebagai template.
- Simpan `todo.md` di `docs/` (tugas lintas-service) atau di
  `services/<service>/docs/` (tugas satu service).

### Kapan perlu spec + todo

| Perlu spec + todo | Tidak perlu |
|---|---|
| Fitur baru | Typo fix |
| Bug fix non-trivial | Dependency bump (dependabot) |
| Refactor yang mengubah behavior | Format/lint auto-fix |
| Perubahan DB schema | Test-only change |
| Perubahan API contract | README/doc update |
| Perubahan arsitektur | Variable rename |

### Workflow step-by-step

1. **Tulis spec** — Salin `docs/spec-template.md`, isi semua section yang relevan.
   - **Verified facts**: baca kode yang terpengaruh, catat temuan dengan file:line.
   - **Root cause**: analisis sebab (jangan hanya describe symptom).
   - **Decisions**: pilih pendekatan, jelaskan alternatif yang ditolak.
   - **Verification**: command executable, bukan "should work".
   - Simpan sebagai `docs/specs/YYYY-MM-DD_<slug>-spec.md`.

2. **Tulis `todo.md`** — Pecah spec jadi task konkret yang bisa diceklis
   (gunakan `docs/todo-template.md`), dengan urutan implementasi yang logis.

3. **Review spec** — Baca ulang spec sendiri. Cek:
   - Apakah verified facts benar-benar verified (bukan asumsi)?
   - Apakah file changes lengkap (tidak ada yang terlewat)?
   - Apakah verification steps executable?
   - Jika spec untuk user request: pastikan user setuju dengan approach.

4. **Implement** — Ikuti spec + todo step-by-step. Ceklis `[x]` setiap task
   yang selesai. Jika menemukan sesuatu yang berubah dari asumsi spec,
   **update spec dulu**, baru implement.

5. **Verify** — Jalankan semua verification steps di spec. Catat hasilnya.

6. **Commit** — Reference spec di commit message:
   ```
   feat(module): deskripsi singkat

   Ref: docs/specs/YYYY-MM-DD_<slug>-spec.md
   ```

### Tips menulis spec yang baik

- **Evidence-based**: setiap klaim harus ada sumbernya (file:line, log, error).
- **Actionable**: orang lain (atau AI agent) harus bisa implementasi dari spec saja.
- **Verifiable**: setiap requirement harus bisa di-test secara eksplisit.
- **Scoped**: satu spec = satu perubahan terfokus. Jangan campur 3 fitur dalam 1 spec.
- **Bahasa campuran**: narrative boleh Indonesia/English, istilah teknis pakai English.

### Role of AI agents

AI coding agents (Shiro Neko / Hermes) **harus**:
- Membaca spec sebelum menulis kode
- Membuat & meng-update `todo.md` untuk setiap tugas berjalan
- Verifikasi fakta dari kode aktual (bukan dari asumsi training data)
- Update spec jika temuan baru mengubah approach
- Jalankan verification steps setelah implementasi
- Reference spec di commit message

AI agents **tidak boleh**:
- Langsung implement tanpa membaca/menulis spec
- Mengabaikan verified facts yang bertentangan dengan asumsi
- Skip verification steps
- Mengerjakan tugas tanpa todo list yang jelas