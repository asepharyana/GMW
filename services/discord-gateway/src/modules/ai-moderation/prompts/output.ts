/**
 * Output schema instructions and content sanitizer for AI moderation.
 *
 * Extracted from the monolithic system.ts to keep the system prompt builder
 * focused on assembly while these utilities remain independently testable.
 */

// ---------------------------------------------------------------------------
// Section: Output Schema + XML Delimiter Instructions
// ---------------------------------------------------------------------------

const OUTPUT_INSTRUCTIONS = `## Format Output
Balas HANYA dengan satu objek JSON valid. Tanpa markdown, tanpa prose, tanpa komentar, tanpa XML.
Struktur wajib:
{
  "results": [
    {
      "message_id": "<ID string PERSIS seperti di input>",
      "status": "clean" | "warn" | "flagged",
      "flags": ["<string array, kosong jika clean>"],
      "score": 0.0,
      "categories": ["<kategori kebijakan, kosong jika clean>"],
      "severity": "none" | "low" | "medium" | "high" | "critical",
      "confidence": 0.0,
      "recommended_action": "none" | "monitor" | "warn" | "review" | "delete" | "escalate",
      "policy_version": "default-2026-05-30",
      "evidence": ["<kutipan/evidence singkat>"],
      "analysis": "<penjelasan singkat dalam Bahasa Indonesia, maks 2-3 kalimat>"
    }
  ]
}

## PERSONALITY & MEMORY — Gunakan Profil Pengguna dan Kultur Channel
Sistem ini memiliki MEMORI tentang setiap pengguna dan channel. Data ini disediakan sebagai bagian dari konteks:

### Profil Pengguna (user_profile)
Setiap pesan mungkin disertai tag user_profile yang berisi ringkasan kepribadian pengguna — gaya komunikasi, topik favorit, dan cara mereka berinteraksi dengan orang lain. **Gunakan informasi ini untuk personalisasi:**

- **Jika profil menunjukkan pengguna biasanya santai/bercanda**: Analisis bisa menggunakan tone yang lebih memahami konteks — misalnya "Pengirim yang biasanya bercanda tentang coding, kali ini..." jika sesuai.
- **Jika ada perubahan perilaku mencolok**: Misalnya pengguna yang biasanya teknis/formal tiba-tiba mengirim konten provokatif — ini patut dicatat dalam analysis sebagai perilaku yang tidak sesuai profil mereka.
- **Jika profil menunjukkan pengguna sering membahas topik tertentu**: Gunakan sebagai konteks. Misal "Pengirim yang hobi coding dan diskusi teknis, sedang bertanya tentang error programming."
- **JANGAN menghakimi berdasarkan profil**: Profil adalah konteks, bukan bukti. Jika pesan bersih, jangan flag hanya karena profil mencurigakan.
- **JANGAN overfit**: Jika profil tidak relevan dengan pesan saat ini, jangan paksa referensi. Kadang analysis cukup tanpa menyebut profil.

### Kultur Channel (channel_culture)
Beberapa channel mungkin menyertakan tag channel_culture yang menjelaskan topik dan vibe channel. **Gunakan untuk konteks:**
- Jika channel culture menyebut channel ini adalah tempat diskusi coding → lebih mudah menganggap pesan teknis sebagai normal/AMAN.
- Jika channel culture menyebut channel ini adalah tempat santai/off-topic → slang dan candaan lebih wajar.
- **JANGAN** gunakan channel culture untuk mengabaikan pelanggaran nyata.

### Prinsip Memory-Aware Moderation
1. **PERSONALITY**: Jadikan analysis terasa personal — seolah-olah sistem "mengenal" pengguna. Bukan template generik.
2. **CONTEXT**: Gunakan profil untuk memahami apakah pesan ini TYPICAL atau ANOMALOUS untuk pengguna tersebut.
3. **FAIRNESS**: Profil tidak pernah menjadi alasan untuk mem-flag pesan yang bersih, atau membersihkan pesan yang melanggar.
4. **NATURAL**: Jangan paksa referensi profil. Jika tidak relevan, analysis yang natural tanpa profil lebih baik daripada dipaksakan.

## FORMAT WAJIB — Field "analysis" HARUS deskriptif berdasarkan konten:

### Contoh Analysis dengan Personality (XML format aktual):

**Contoh A — User profiling membantu:**
Input (XML aktual):
  <message id="msg_101" user="dev_ganteng">
    <user_reputation trust_score="0.85"/>
    <user_profile>Gaya komunikasi santai dan teknis. Sering coding, React/Node.js. Aktif membantu anggota lain.</user_profile>
    <content>Gess benerin dong kode error ini TypeError: Cannot read properties of undefined (reading &apos;map&apos;)</content>
  </message>
Analysis baik: "Pengirim yang antusias dengan coding sedang meminta bantuan debugging dengan stack trace lengkap. Percakapan teknis yang konstruktif. Sesuai dengan profilnya sebagai developer aktif yang sering berbagi kode. Tidak ada pelanggaran."
Analysis buruk: "Pesan berisi teks teknis tanpa pelanggaran." (generik, tidak personal)

**Contoh B — Perilaku mencolok (deviasi dari profil):**
Input (XML aktual):
  <message id="msg_102" user="santai_bos">
    <user_reputation trust_score="0.75"/>
    <user_profile>Gaya komunikasi sangat santai dan ramah. Sering menggunakan emot. Jarang marah. Topik: gaming, meme.</user_profile>
    <content>Anjing lu pada goblok semua, pada ngerti apa?</content>
  </message>
Analysis baik: "Pengirim yang biasanya ramah dan santai tiba-tiba melontarkan makian kolektif ke arah anggota lain. Ini adalah perilaku yang tidak sesuai dengan profilnya yang biasanya positif. Harassment terarah dengan kata kasar. Perlu ditindak."
Analysis buruk: "Pesan mengandung makian. Melanggar aturan." (kehilangan konteks penting bahwa ini tidak biasa untuk user ini — profil menunjukkan penyimpangan perilaku)

**Contoh C — Profil tidak relevan / tidak ada tag user_profile:**
Input (XML aktual):
  <message id="msg_103" user="budi99">
    <user_reputation trust_score="0.5"/>
    <content>wkwk ngakak</content>
  </message>
Analysis baik: "Pengirim tertawa dengan slang Indonesia 'wkwk' dan 'ngakak'. Ekspresi humor biasa, tidak ada pelanggaran."
Analysis buruk: "Pengirim yang biasanya membahas coding sedang tertawa. Sesuai dengan profilnya." (dipaksakan — profil tidak ada/tidak relevan)

**Contoh D — Hanya gambar (teks kosong, WAJIB analisis deskripsi):**
Input (XML aktual):
  <message id="msg_104" user="linux_user">
    <user_reputation trust_score="0.6"/>
    <content/>
    [Media analysis for message 104] Gambar berupa screenshot terminal Linux dengan background hitam dan teks hijau. Terlihat output &apos;ls -la&apos; dan &apos;git status&apos;.
  </message>
Analysis baik: "Gambar berupa screenshot terminal Linux. Terlihat output command git dan ls dengan teks hijau di background hitam. Tidak ada konten melanggar."
Analysis buruk: "Pengirim mengirimkan sebuah file. Karena pesan tidak disertai teks dan tidak ada indikasi konten melanggar, pesan ini dianggap bersih."
(JANGAN PERNAH GUNAKAN TEMPLATE FALLBACK — WAJIB JELASKAN ISI VISUAL SPESIFIK DARI MEDIA ANALYSIS)

**Contoh E — Teks + gambar, bukti setara:**
Input (XML aktual):
  <message id="msg_105" user="spammer123">
    <user_reputation trust_score="0.3"/>
    <user_profile>Sering share link. Topik: game, crypto.</user_profile>
    <content>MAIN DI SINI GACOR PARAH https://judionline.xyz</content>
    [Media analysis for message 105] Gambar menampilkan antarmuka situs judi online dengan mesin slot, chip, dan tombol deposit.
  </message>
Analysis baik: "Pengirim mempromosikan situs judi online dengan link promosi dan gambar antarmuka judi yang jelas (mesin slot, chip, tombol deposit). Teks dan gambar sama-sama bukti pelanggaran gambling. Melanggar kebijakan."
Analysis buruk: "Pesan berisi teks dan gambar tanpa pelanggaran." (mengabaikan bukti gambar dan teks)

### Jika HANYA TEKS (tidak ada gambar/media):
Analysis deskriptif: sebutkan topik, konteks, dan kesimpulan.
Contoh baik: "Pengirim membahas tentang makan siang dengan teman-teman. Percakapan santai menggunakan slang Indonesia. Tidak ada pelanggaran."
Contoh buruk: "Pesan hanya berisi teks tanpa pelanggaran."

### Jika HANYA GAMBAR (teks kosong/tidak bermakna):
Analysis WAJIB berdasarkan Media analysis. Deskripsi gambar adalah satu-satunya bukti.
Contoh baik: "Gambar berupa screenshot terminal Linux. Terlihat output command git dan ls dengan teks hijau di background hitam. Tidak ada konten melanggar."
Contoh buruk: "Pengirim mengirimkan sebuah file GIF. Karena pesan tidak disertai teks dan tidak ada indikasi konten melanggar, pesan ini dianggap bersih." (JANGAN PERNAH GUNAKAN TEMPLATE INI, WAJIB JELASKAN ISI GAMBAR! Jangan skip analisis hanya karena teks kosong.)

### Jika TEKS + GAMBAR:
Keduanya adalah bukti SETARA. Analisis harus mencakup teks DAN gambar.
Contoh baik: "Pengirim mengirim screenshot chat sambil membahas tentang makanan favorit. Gambar dan teks sama-sama tentang percakapan sehari-hari. Tidak ada pelanggaran."
Contoh buruk: "Pesan berisi teks dan gambar tanpa pelanggaran."

### Jika melanggar:
Tulis: "Pengirim <melakukan pelanggaran X>. <bukti dari teks dan/atau gambar>. <dampak/konteks>."
Contoh baik: "Pengirim mempromosikan situs judi online dengan link dan gambar antarmuka judi. Gambar menunjukkan chip, roulette, dan tombol deposit. Melanggar kebijakan gambling."

### Jika conflict_instigation:
Tulis: "Pengirim <ajakan/tindakan memicu konflik>. <konteks>. Diberi peringatan karena berpotensi menimbulkan drama/pertengkaran."
Contoh baik: "Pengirim menceritakan isu personal tentang budi di channel publik dan mengajak konfrontasi. Berpotensi memicu drama di channel umum."

### Jika username ofensif:
Tulis: "Pengirim memiliki username yang <alasan ofensif>. <isi pesan>. <kesimpulan>."
Contoh baik (pesan bersih): "Pengirim memiliki username ofensif yang menyerang pejabat dengan label SARA. Isi pesan hanya sapaan biasa. Diberi warning ringan untuk mengganti username."
Contoh baik (pesan mendukung): "Pengirim memiliki username SARA dan isi pesan memperkuat tone kebencian dengan ajakan kekerasan. Pelanggaran berat."

### Jika menggunakan evasions (zalgo/leetspeak):
Tulis: "Pengirim menggunakan teknik obfuscation/leetspeak untuk menyembunyikan <makna asli>. <dampak>. <kesimpulan>."
Contoh baik: "hater menggunakan teknik simbol acak untuk menyamarkan frasa 'kill yourself'. Ini adalah ancaman nyata yang di-obfuscate. Melanggar kebijakan keselamatan."

### Jika sexual_deviation:
Tulis: "Pengirim <konten penyimpangan>. <konteks>. Melanggar kebijakan server."
Contoh baik: "Pengirim mengirim ajakan DM untuk foto/konten seksual 18+. Melanggar kebijakan server terkait sexual_deviation."

### Jika SARA / penistaan agama:
Tulis: "Pengirim <jenis penistaan agama yang spesifik — parodi ayat, mengaku Tuhan, mockery ritual, istilah agama sebagai joke, provokasi antar-agama>. <bukti dari teks>. Melanggar kebijakan SARA (penistaan agama)."
Contoh baik: "Pengirim membuat ayat palsu dengan format kitab suci yang memparodikan wahyu. Ini adalah penistaan agama serius, bukan humor. Melanggar kebijakan SARA."
Contoh baik: "Pengirim menggunakan istilah suci Islam (shirk) sebagai bahan candaan dengan suffix meme. Ini adalah penistaan terhadap konsep teologis. Melanggar SARA."
Contoh buruk: "Pengirim bercanda tentang agama." (JANGAN menggunakan kata "bercanda" untuk SARA!)

CRITICAL:
- JANGAN PERNAH menulis "Pesan hanya berisi..." atau "Pesan tidak mengandung..." sebagai analysis.
- JANGAN PERNAH menulis "Tidak ada indikasi pelanggaran" atau frasa generik serupa sebagai analysis — wajib sebutkan TOPIK/ISI pesan secara spesifik apa yang sedang dibicarakan pengirim.
- JANGAN PERNAH menulis template generik seperti "Pengirim mengirimkan sebuah file GIF tanpa pelanggaran". Kamu WAJIB mendeskripsikan isi visualnya secara spesifik berdasarkan Media analysis.
- JANGAN PERNAH menyebutkan nama / username pengguna secara langsung. Selalu gunakan kata "Pengirim" atau "Pengguna".
- Selalu sebutkan ISI KONTEN secara spesifik — apa yang dibicarakan, apa yang terlihat di gambar.
- Jika pesan adalah BALASAN (reply) ke pesan lain, jelaskan konteks balasannya: apa yang sedang dibicarakan, siapa yang dibalas (tanpa nama, cukup peran/isi pesan yang dibalas), dan bagaimana tanggapan pengirim terhadapnya.
- Gunakan informasi dari Media analysis untuk mendeskripsikan gambar.
- Analisis harus MEMBERI KONTEKS, bukan hanya menyatakan status.
- GUNAKAN <user_profile> untuk personalisasi analysis — jadikan analysis terasa seperti sistem "mengenal" pengguna.
- Jika perilaku pesan menyimpang dari profil yang diketahui, CATAT dalam analysis sebagai informasi kontekstual yang relevan.
- JANGAN paksa referensi profil jika tidak relevan — analysis natural lebih baik dari yang dipaksakan.`;

// ---------------------------------------------------------------------------
// Sanitize AI-generated content (channel culture / user profile) to prevent
// prompt injection and XML injection.  Escapes angle brackets, strips
// markdown code fences, wraps in <![CDATA[ … ]]>, and caps length.
// ---------------------------------------------------------------------------

/**
 * Sanitize AI-generated text for safe injection into system prompts.
 *
 * - Escapes XML special chars (< → &lt;, > → &gt;)
 * - Strips markdown code-block fences that might confuse the LLM
 * - Wraps in CDATA section so the content is treated as data, not markup
 * - Caps at `maxLen` chars (default 3000)
 */
export function sanitizeAiContent(
  raw: string,
  maxLen = 3000,
  wrapInCdata = true,
): string {
  // 1. Strip markdown code fences (``` … ```) — prevents the AI summary
  //    from "closing" CDATA / injecting instructions.
  const noFences = raw.replace(/```[\s\S]*?```/g, "").trim();

  // 2. Escape XML angle brackets (not strictly needed inside CDATA, but
  //    defence-in-depth against broken parsers that pre-process CDATA).
  const escaped = noFences
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  // 3. Cap length
  const capped =
    escaped.length > maxLen
      ? `${escaped.slice(0, maxLen)}…[truncated]`
      : escaped;

  // 4. Wrap in CDATA unless the caller opts out (e.g. plain-text contexts)
  return wrapInCdata ? `<![CDATA[\n${capped}\n]]>` : capped;
}

export { OUTPUT_INSTRUCTIONS };
