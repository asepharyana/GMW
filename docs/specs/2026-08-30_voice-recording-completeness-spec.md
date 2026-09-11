# Spec: Perbaiki alur voice → recording (miss & terpotong)

## Konteks & Gejala
User melaporkan alur voice sampai recording **banyak miss** (audio tidak tercatat)
dan **terpotong** (satu alur bicara kebelah jadi beberapa segmen / audio putus di
tengah). Ini domain `services/discord-gateway/src/modules/voice-recording/`.

Pipeline per user yang mulai bicara (speaking "start"):
```
receiver.speaking "start" → speakingHandler(userId)
  ├─ await collectUserMetadata(...)        ← roundtrip API, subscribe tertunda
  ├─ receiver.subscribe(userId, {end: AfterSilence, duration: 3000ms}) → audioStream
  ├─ attach data/end/error handlers  →  audioStream.pipe(PacketFilter) → oggPacketStream
  ├─ SegmentManager.open() → OggLogicalBitstream → file .ogg
  ├─ data: SegmentManager.rotateIfNeeded (rotasi 5s) + decoder.write (web PCM tho
  └─ end: SegmentManager.close() → segmen finish → finalizeSegment upload + transkrip
```

## Root cause (dari pembacaan kode — justifikasi di bawah)

### A. MISS bagian awal bicara — subscribe tertunda (utama)
`speakingHandler.ts:53` melakukan `await collectUserMetadata(...)` SEBELUM
`receiver.subscribe`. `collectUserMetadata` (metadata.ts:30) pada cold path
(cache miss) melakukan `client.users.fetch` + `guild.members.fetch` roundtrip
Discord API (ratusan ms–detik). Selama await, seluruh opus awal bocor → awal
kalimat hilang. Cache menghilangkan ini untuk user yang pernah ter-record, tapi
user baru/evict (cache max 200) kena setiap kali.

### B. Double-subscribe race
Guard `receiver.subscriptions.has(userId)` di `speakingHandler.ts:63` diletakkan
SETELAH `await collectUserMetadata`. Dua event "start" cepat keduanya melewati
guard (belum subscribe) → dua subscription → audio terbelah/ganda per user.

### C. TERPOTONG di jeda bicara — AfterSilence 3000ms
`AUDIO_STREAM_SILENCE_DURATION_MS=3000`. Setelah 3s diam, stream auto-`end` →
`SegmentManager.close` → segmen baru saat bicara lagi. Jeda normal (berpikir,
interupsi) memecah 1 alur bicara jadi beberapa segmen/file. Ini source "terpotong".
Segmen pendek hasil jeda <1s juga DIBUANG di `finalizeSegment` (MIN_DURATION_MS=1000)
→ miss kata singkat ("ya", "siap").

### D. Rotasi segmen 5s di tengah bicara
`RECORDING_SEGMENT_MS=5000`: `rotateIfNeeded` menutup bitstream & membuka baru
setiap 5s walau bicara kontinu. Pipenya di-re-wire di dalam handler data →
window drop kecil + continuity file pecah (bukan masalah besar, tapi berkontribusi).

### E. Tidak ada sinkronisasi "stop" speaking & stream "end" flaky
Handler hanya listen "start"; mengandalkan `AfterSilence` untuk emit "end".
Bug @discordjs/voice yang dikenal: `AfterSilence` bisa TIDAK emit "end" saat
koneksi gagal/teardown → segmen menggantung & tidak pernah finalize/upload
(recording "hilang"). Tidak ada watchdog.

## Scope
Hanya `services/discord-gateway/src/modules/voice-recording/` (+ config index bila
perlu default baru). Tidak menyentuh playback (player.ts), transmitter (voice dari
browser → Discord, arah berlawanan), muxer (konsolidasi akhir), atau screen-share
video (hanya audio SSRC via `hookScreenShareAudio` sudah ada & dibiarkan).

## Perubahan

### 1. Speak-before-metadata: subscribe LEBIH DULU, metadata paralel
`recorder/speakingHandler.ts`:
- Pindahkan `receiver.subscribe` + pipeline setup ke ATAS, SEGERA di handler,
  sebelum `collectUserMetadata`.
- Jalankan `collectUserMetadata` secara paralel non-blocking; gunakan metadata
  cache untuk registrasi segmen saat finalize.
- Pertahankan guard skip bot/user (bot bisa dicek dari `client.users.cache` /
  `client.user.id` tanpa await) SEBELUM subscribe — jangan tunggu fetch user.

Detail konkret:
```
async handler(userId):
  if (userId === client.user?.id) return;
  if (receiver.subscriptions.has(userId)) return;   // guard kini di DEPAN, tanpa await
  // (belum tahu bot? gunakan cache user; subscribe dulu biar nggak miss)
  clone = subscribe(userId, {AfterSilence, duration})  // TANPA await metadata
  setup pipeline (data/end/error, pipe, open segment)
  collectUserMetadata(...).then(meta => {
     if (meta.bot) { drain & close subscription (jangan simpan) }
     else { registrasi ulang metadata utk segmen aktif }
  })
```
Karena listener `start` dibuang untuk bot, harus tutup subscription bot tanpa
menyimpan segmen (buang hasil). Pakai `receiver.subscriptions.get(userId)?.destroy()`.

### 2. Selesaikan race double-subscribe (bagian dari #1)
Guard `receiver.subscriptions.has(userId)` diletakkan SINCRON di awal (sebelum
await). Karena `subscribe` sinkron dan `subscriptions` terisi sinkron saat
dipanggil, event "start" kedua yang tiba setelah subscribe akan melihat
subscription aktif → di-skip. Tidak ada await antara guard & subscribe.

### 3. Naikkan AfterSilence + tail-length → kurangi "terpotong"
`shared/config/index.ts`:
- `AUDIO_STREAM_SILENCE_DURATION_MS` default 3000 → 4000 (beri ruang jeda
  alami; Discord packet 20ms, 4s masih wajar, tidak membengkak file).
Opsional via env override di production (tidak wajib komit env).

### 4. Segmen berorientasi "burst bicara" daripada rotasi jam
`recorder/segment.ts` + `recorder/speakingHandler.ts`:
- Hapus/lepas rotasi SEGMEN berbasis waktu (RECORDING_SEGMENT_MS). Alih-alih,
  satu segmen = satu burst bicara (buka di "start", tutup di "end"/AfterSilence
  end). Ini menghilangkan pemecahan di tengah kalimat.
- `RECORDING_SEGMENT_MS` tetap dipakai untuk rotasi decoder web-PCM (broadcast
  live), di mana segmen besar bisa menunda frame — biarkan seperti ada.
  JADI: `SegmentManager.rotateIfNeeded` TIDAK lagi dipanggil pada jalur OGG
  recording; decoder rotate tetap dijalankan.

Catatan: dengan satu segmen per burst, ukuran file ~ durasi bicara. File panjang
dibutuhkan transkrip & transcode; tidak ada batas keras yang perlu di-override.
Watchdog di #5 membatasi durasi menggantung.

### 5. Watchdog end-of-burst & teardown recovery
`recorder/speakingHandler.ts`:
- Setelah subscribe, arm timer watchdog (mis. `config twin`/hitung) yang menutup
  segmen jika `AfterSilence` tidak emit "end" dalam X detik setelah "stop"
  speaking — atau, lebih sederhana & robust: dengarkan BOTH stream "end" DAN
  timer dari `receiver.speaking` "stop" (hingga @discordjs/voice meng-klaim
  AfterSilence). Bila "stop" fire, mulai countdown kecil (mis. 500ms) lalu
  `segmentManager.close` + `decoder.destroy` + destroy subscription jika stream
  belum "end".
- Ini menutup A: segmen menggantung → jadi pasti finalize & upload.

Implementasi: subscriptionStream (audioStream) + track milik per-user di
Map<userId, {audioStream, segmentManager, decoder, timer}>; handler "stop"
menjadwalkan finalize.

### 6. Naikkan/ambil MIN segmen duration lebih rendah
`recorder/segmentFinalizer.ts`: MIN_DURATION_MS 1000 → 300ms. Kata pendek
("ya", "siap") tetap tersimpan. GUI biarkan.

## File yang disentuh
- `src/modules/voice-recording/recorder/speakingHandler.ts` (utama: subscribe
  first, guard depan, watchdog stop, hapus rotasi segmen dari jalur OGG)
- `src/modules/voice-recording/recorder/segment.ts` (opsional: API close/open,
  pertahankan rotate untuk decoder tapi tak dipakai jalur OGG)
- `src/modules/voice-recording/recorder/streamSetup.ts` (kecil: backfill subscribe
  supaya return subscription utk cleanup/destroy bot)
- `src/modules/voice-recording/recorder/segmentFinalizer.ts` (MIN_DURATION)
- `src/shared/config/index.ts` (default AfterSilence 4000)

## Yang TIDAK disentuh
- `transmitter.ts` (arah browser→Discord, bukan recording)
- `player.ts`, `mediaSource.ts`, `screenShareAudio.ts` (hook SSRC sudah benar)
- `muxer.ts` (konsolidasi akhir tetap jalan)
- Flake/deps/bundle

## Verification
1. `cd services/discord-gateway && pnpm typecheck` (tsc --noEmit) — 0 error.
2. `pnpm lint` (biome check src/) — exit 0.
3. `pnpm build` (tsc → dist/).
4. Unit test baru (vitest, kalau infra tes ada):
   - subscribe terjadi tanpa await metadata (spy urutan panggilan)
   - double-start skip lewat guard sinkron
   - "stop" → watchdog finalize segmen walau stream tidak "end"
   - MIN_DURATION 300ms menyimpan kata pendek
5. Smoke/CI: `nix flake check` (eval). Push → CI `Build & Deploy (Nix)` hijau →
   deploy landing (`systemctl show gmw-discord-gateway.service --property=ActiveEnterTimestamp`).
6. Runtime manual (user): join voice, bicara dengan jeda >3s, pastikan 1 alur
   kontinu = 1 segmen utuh (bukan 3), dan awal kata tidak hilang.

## Risiko / Trade-off
- Subscribe-before-metadata: burst bot akan dikumpulkan sesaat lalu dibuang
  (cost kecil: buang segmen). Lebih baik miss bot daripada miss user.
- AfterSilence naik: file lebih panjang sedikit saat jeda; upload/transkrip
  timeout (transcodeToMp3 30s) tetap aman.
- Satu segmen per burst: tidak ada rotasi paksa → durasi segmen = durasi bicara
  (bisa menit). Transkrip & transcode tetap ok. Watchdog batasi menggantung.
