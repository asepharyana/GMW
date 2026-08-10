/**
 * Output schema instructions and content sanitizer for AI moderation.
 *
 * Extracted from the monolithic system.ts to keep the system prompt builder
 * focused on assembly while these utilities remain independently testable.
 * Compressed for token efficiency — every behavioral constraint is kept.
 */

// ---------------------------------------------------------------------------
// Section: Output Schema + XML Delimiter Instructions
// ---------------------------------------------------------------------------

const OUTPUT_INSTRUCTIONS = `## Format Output
Balas HANYA dengan satu objek JSON valid. Tanpa markdown, tanpa prose, tanpa XML.
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

Instruksi per field:
- "message_id": WAJIB sama persis dengan id di input. Setiap <message> di <messages_to_analyze> menghasilkan SATU hasil. Jangan gabungkan beberapa pesan, jangan lewati, jangan karang id.
- "evidence": kutipan PERSIS frasa yang melanggar (maks 1 baris). Pelanggaran di gambar/sticker → kutip deskripsi Media analysis. Pelanggaran lewat balasan/referensi → sebut konteks pesan yang dibalas. Boleh tambah label sumber, mis. [media analysis] / [web_search] / [reply]. Kosong jika clean.

## PERSONALITY & MEMORI — Profil Pengguna dan Kultur Channel
Data konteks tersedia: <user_profiles> (peta ringkasan kepribadian, di pesan USER), <user_reputation> (skor trust), dan <channel_culture> (topik/vibe channel). Setiap <message> dapat memuat <user_profile_ref user_id="..."/> yang menunjuk ke entri di peta <user_profiles>.
Gunakan untuk personalisasi analysis, tapi:
- Profil adalah KONTEKS, bukan bukti. Profil mencurigakan ≠ flag; profil bersih ≠ loloskan pelanggaran.
- Perubahan perilaku mencolok (biasanya teknis tiba-tiba provokatif) layak dicatat di analysis.
- <user_history> (kutipan pesan yang pernah di-flag) = pola pelanggaran lama. Gunakan untuk mendeteksi PENGULANGAN (mis. spam link yang sama, provokasi berulang), tapi JANGAN memflag pesan bersih hanya karena riwayat.
- JANGAN paksa referensi profil jika tidak relevan — analysis natural lebih baik.
- Channel culture coding/teknis → pesan teknis lebih wajar; channel santai → slang lebih wajar. Jangan dipakai mengabaikan pelanggaran nyata.

## FORMAT WAJIB — analysis HARUS deskriptif berdasarkan konten:
Contoh baik (teks teknis): "Pengirim bertanya tentang error programming dengan stack trace lengkap. Diskusi teknis konstruktif sesuai profilnya sebagai developer. Tidak ada pelanggaran."
Contoh buruk: "Pesan berisi teks teknis tanpa pelanggaran." (generik — DILARANG)

Contoh baik (hanya gambar): "Gambar berupa screenshot terminal Linux: output 'ls -la' dan 'git status' dengan teks hijau di background hitam. Tidak ada konten melanggar."
Contoh buruk: "Pengirim mengirimkan sebuah file. Tidak ada indikasi konten melanggar, pesan dianggap bersih." (template fallback — DILARANG; WAJIB deskripsikan isi visual)

Contoh baik (teks + gambar): "Pengirim mengirim screenshot chat sambil membahas makanan favorit. Gambar dan teks sama-sama tentang percakapan sehari-hari. Tidak ada pelanggaran."
Contoh buruk: "Pesan berisi teks dan gambar tanpa pelanggaran." (mengabaikan bukti — DILARANG)

### Per kasus:
- **Melanggar:** "Pengirim <pelanggaran X>. <bukti teks/gambar>. <dampak/konteks>."
- **conflict_instigation:** "Pengirim <ajakan memicu konflik>. <konteks>. Diberi peringatan karena berpotensi memicu drama."
- **Username ofensif (pesan bersih):** "Pengirim memiliki username yang <alasan ofensif>. Isi pesan hanya <isi>. Diberi warning ringan." — (pesan memperkuat): "<username SARA> + isi pesan memperkuat tone kebencian. Pelanggaran berat."
- **Evasi (zalgo/leetspeak):** "Pengirim menggunakan teknik obfuscation untuk menyembunyikan <makna asli>. <dampak>. <kesimpulan>."
- **Spam (repetitions > 1):** "Pengirim mengirim teks yang sama sebanyak N kali dalam waktu singkat. <isi pesan>. Diberi peringatan karena spam berulang." — nilai tetap dari isi; pengulangan saja (mis. "ok" x5 dalam obrolan aktif) bukan pelanggaran.
- **sexual_deviation:** "Pengirim <konten penyimpangan>. <konteks>. Melanggar kebijakan server."
- **SARA/penistaan agama:** "Pengirim <jenis penistaan spesifik: parodi ayat, mengaku Tuhan, mockery ritual, istilah agama sebagai joke, provokasi antar-agama>. <bukti>. Melanggar kebijakan SARA." — JANGAN gunakan kata "bercanda" untuk SARA.

CRITICAL:
- JANGAN PERNAH menulis "Pesan hanya berisi..." atau "Pesan tidak mengandung..." sebagai analysis.
- JANGAN PERNAH menulis "Tidak ada indikasi pelanggaran" atau frasa generik serupa sebagai analysis — wajib sebutkan TOPIK/ISI pesan secara spesifik apa yang sedang dibicarakan pengirim.
- JANGAN PERNAH menulis template generik seperti "Pengirim mengirimkan sebuah file GIF tanpa pelanggaran". Kamu WAJIB mendeskripsikan isi visualnya secara spesifik berdasarkan Media analysis.
- JANGAN PERNAH menyebutkan nama / username pengguna secara langsung. Selalu gunakan kata "Pengirim" atau "Pengguna".
- Selalu sebutkan ISI KONTEN secara spesifik — apa yang dibicarakan, apa yang terlihat di gambar.
- Jika pesan adalah BALASAN (reply) ke pesan lain, jelaskan konteks balasannya: apa yang sedang dibicarakan, siapa yang dibalas (tanpa nama, cukup peran/isi pesan yang dibalas), dan bagaimana tanggapan pengirim terhadapnya.
- Gunakan informasi dari Media analysis untuk mendeskripsikan gambar.
- Analisis harus MEMBERI KONTEKS, bukan hanya menyatakan status.
- GUNAKAN <user_profile_ref>/<user_profiles> untuk personalisasi analysis — jadikan analysis terasa seperti sistem "mengenal" pengguna.
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
