/**
 * Few-shot examples for LLM moderation prompts.
 *
 * Compressed for token efficiency: analysis strings are shortened,
 * redundant fields (categories, policy_version) omitted from example
 * outputs — both are optional in the response schema and the parser
 * derives them when missing. All teaching signals are preserved.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type PromptMode = "text" | "media" | "mixed";

export interface ExampleDef {
  id: string;
  title: string;
  input: string;
  output: string;
  /** Which modes this example appears in. Defaults to all modes. */
  modes: PromptMode[];
}

// ---------------------------------------------------------------------------
// Formatter
// ---------------------------------------------------------------------------

/** Formats an array of ExampleDef into the prompt-ready string block. */
export function formatExamples(examples: ExampleDef[], prefix: string): string {
  return `${prefix}\n\n${examples
    .map(
      (ex) =>
        `Contoh ${ex.id} — ${ex.title}:\nInput: ${ex.input}\nOutput: ${ex.output}`,
    )
    .join("\n\n")}`;
}

// ---------------------------------------------------------------------------
// All examples
// ---------------------------------------------------------------------------

export const ALL_EXAMPLES: ExampleDef[] = [
  // ── Text-only examples ──
  {
    id: "1",
    title: "Pesan bersih dengan slang",
    input: "[target] id=12345 user=budi: anjay wkwk gaskeun santuy bro",
    output:
      '{"results":[{"message_id":"12345","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Slang Indonesia umum, tanpa pelanggaran."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "2",
    title: "Harassment terarah",
    input:
      "[target] id=67890 user=anon: lu goblok banget sih kontol, mampus aja lo",
    output:
      '{"results":[{"message_id":"67890","status":"flagged","flags":["harassment","vulgar_language"],"score":0.85,"severity":"high","confidence":0.9,"recommended_action":"delete","evidence":["lu goblok banget sih kontol"],"analysis":"Insult langsung dengan kata kasar terarah ke individu."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "15",
    title: "Emoji Huruf (Evasion)",
    input: "[target] id=16161 user=sneaky: gsap expo 🇬 🇦 🇾",
    output:
      '{"results":[{"message_id":"16161","status":"flagged","flags":["sexual_deviation"],"score":0.8,"severity":"medium","confidence":0.95,"recommended_action":"delete","evidence":["🇬 🇦 🇾"],"analysis":"Regional indicator mengeja kata terlarang — evasi untuk topik yang dibatasi server."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "16",
    title: "Typo QWERTY Programming (False Positive Prevention)",
    input: "[target] id=17171 user=dian432: Apakah bisa ngodonf disitu?",
    output:
      '{"results":[{"message_id":"17171","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Kata \'ngodonf\' typo QWERTY natural (f-g, o-i) dari \'ngoding\', bukan obfuscation. Diskusi teknis wajar."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "17",
    title: "Error log programming (AMAN)",
    input:
      "[target] id=17172 user=dev: TypeError: Cannot read properties of undefined (reading 'map'). Kalo ada yang tau solusinya tolong bantu",
    output:
      '{"results":[{"message_id":"17172","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Diskusi teknis normal tentang error programming, bukan pelanggaran."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "18",
    title: "Nama proyek/tools (AMAN, false positive prevention)",
    input:
      "[target] id=17173 user=dev: Guys pake Cursor lebih enak daripada VSCode? Gw pake Claude buat bantuin debugging",
    output:
      '{"results":[{"message_id":"17173","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Diskusi tools programming biasa (Cursor, VSCode, Claude), tidak ada pelanggaran."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "19",
    title: "Diskusi orientasi seksual LGBT (dilarang — zero tolerance)",
    input:
      "[target] id=17174 user=alex: btw gw gay, semoga ga masalah ya. Gw cmn mau jujur aja",
    output:
      '{"results":[{"message_id":"17174","status":"flagged","flags":["sexual_deviation"],"score":0.85,"severity":"high","confidence":0.95,"recommended_action":"delete","evidence":["btw gw gay, semoga ga masalah ya"],"analysis":"Pengakuan orientasi LGBT — server zero tolerance terhadap segala diskusi/coming out. Dihapus."}]}',
    modes: ["text", "mixed"],
  },

  // ── Mixed examples ──
  {
    id: "3",
    title: "Sticker kartun dengan nama provokatif",
    input:
      '[target] id=11111 user=citra: <:singa_injek:123456> [sticker: "Singa injek pejabat"]',
    output:
      '{"results":[{"message_id":"11111","status":"clean","flags":[],"score":0.1,"severity":"none","confidence":0.8,"recommended_action":"none","evidence":[],"analysis":"Sticker kartun satir dengan nama provokatif, bukan ancaman nyata."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "8",
    title: "Seksisme terarah",
    input:
      "[target] id=88888 user=sexist: dasar perempuan ngerti apa sih, logika lo aja kagak bener",
    output:
      '{"results":[{"message_id":"88888","status":"flagged","flags":["hate_speech","harassment"],"score":0.82,"severity":"high","confidence":0.9,"recommended_action":"delete","evidence":["dasar perempuan ngerti apa sih"],"analysis":"Komentar seksis merendahkan yang menyasar gender — stereotip ofensif terarah."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "9",
    title: "Memancing drama/konflik",
    input:
      "[target] id=99999 user=drama: si budi kemarin ngomongin lo di belakang, masa tega banget dia, ayo kita konfrontasi di sini aja",
    output:
      '{"results":[{"message_id":"99999","status":"warn","flags":["conflict_instigation"],"score":0.65,"severity":"low","confidence":0.75,"recommended_action":"warn","evidence":["ayo kita konfrontasi di sini aja"],"analysis":"Mengajak konfrontasi masalah personal di channel publik, berpotensi memicu drama."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "10",
    title: "Sexual_deviation EKSPLISIT (ajakan seksual)",
    input:
      "[target] id=10101 user=fox: mau liat foto pake kostum hewan? DM aja, khusus 18+",
    output:
      '{"results":[{"message_id":"10101","status":"flagged","flags":["sexual_deviation"],"score":0.85,"severity":"high","confidence":0.9,"recommended_action":"delete","evidence":["mau liat foto pake kostum hewan? DM aja, khusus 18+"],"analysis":"Ajakan aktivitas seksual eksplisit \'DM khusus 18+\'. Melanggar kebijakan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "10.5",
    title: "Kode programming (AMAN)",
    input:
      "[target] id=10505 user=dev: ERROR: Cannot read properties of undefined (reading 'data'). Stack trace: at Module._compile (node:internal/modules/cjs/loader:1256:14)",
    output:
      '{"results":[{"message_id":"10505","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Error log programming biasa antara developer, aman."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "11",
    title: "Username ofensif (isi pesan bersih)",
    input:
      "[target] id=12121 user=pejabat_munafik_dajjal: Halo teman-teman, ada yang main game?",
    output:
      '{"results":[{"message_id":"12121","status":"flagged","flags":["offensive_username"],"score":0.3,"severity":"low","confidence":0.95,"recommended_action":"warn","evidence":["Username \'pejabat_munafik_dajjal\' mengandung unsur ofensif/SARA"],"analysis":"Username ofensif menyerang pejabat dengan label SARA, tapi isi pesan bersih — flag ringan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "12",
    title: "Username ofensif (isi pesan memperkuat)",
    input:
      "[target] id=13131 user=nazi_babi_itu: bener tuh nih ras emang harus dibasmi",
    output:
      '{"results":[{"message_id":"13131","status":"flagged","flags":["offensive_username","hate_speech","sara"],"score":0.9,"severity":"high","confidence":0.95,"recommended_action":"delete","evidence":["bener tuh nih ras emang harus dibasmi"],"analysis":"Username SARA dan isi pesan memperkuat kebencian dengan ajakan kekerasan. Pelanggaran berat."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "13",
    title: "Obfuscation / Zalgo Text (Evasion)",
    input:
      '[target] id=14141 user=hater: ++++++K1[[ your $€/F" "~`| \\\\0ve $ 1F ¥°U |}iE ®©',
    output:
      '{"results":[{"message_id":"14141","status":"flagged","flags":["harassment","hate_speech"],"score":0.95,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["++++++K1[[ your $€/F"],"analysis":"Obfuscation simbol menyembunyikan frasa ancaman \'Kill yourself\'. Ancaman berat yang disamarkan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "14",
    title: "Vulgaritas Bahasa Asing / All-Caps",
    input: "[target] id=15151 user=troll: AKU RAJA TITTEN",
    output:
      '{"results":[{"message_id":"15151","status":"flagged","flags":["vulgar_language"],"score":0.85,"severity":"medium","confidence":0.9,"recommended_action":"delete","evidence":["AKU RAJA TITTEN"],"analysis":"Kata vulgar bahasa asing (\'titten\') dengan huruf kapital — melanggar meski format seperti candaan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "20",
    title: "Parodi ayat palsu (SARA agama)",
    input:
      '[target] id=20201 user=parodist: Kitabonia 11:17 — "Dan bersabdalah Sang Admin: barang siapa yang melakukan spam, niscaya akan kena mute tujuh hari tujuh malam"',
    output:
      '{"results":[{"message_id":"20201","status":"flagged","flags":["sara"],"score":0.92,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["Kitabonia 11:17"],"analysis":"Ayat palsu dengan format kitab suci memparodikan wahyu — penistaan agama, bukan humor."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "22",
    title: "Istilah agama sebagai joke (SARA agama, shirkmaxxing)",
    input:
      "[target] id=22223 user=edgy: Shirkmaxxing grindset, nanti halalmaxxing juga",
    output:
      '{"results":[{"message_id":"22223","status":"flagged","flags":["sara"],"score":0.88,"severity":"high","confidence":0.95,"recommended_action":"delete","evidence":["Shirkmaxxing grindset"],"analysis":"Istilah suci agama (shirk, halal) sebagai bahan candaan meme — penistaan konsep teologis."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "27",
    title: "Ekspresi keagamaan normal (AMAN, BUKAN SARA)",
    input: "[target] id=27278 user=muslim_user: Astaghfirullah, sabar ya bro",
    output:
      '{"results":[{"message_id":"27278","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Istighfar untuk menenangkan teman — ekspresi keagamaan wajar Indonesia, bukan penistaan."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── Media-only examples ──
  {
    id: "4",
    title: "Pesan biasa dengan gambar (JANGAN flag sebagai judi)",
    input:
      "[target] id=22222 user=rina: Aku suka nasgor loh [Media analysis for message 22222] [gambar di atas adalah attachment foto.jpg dari pesan id=22222]: Gambar menampilkan tangkapan layar aplikasi chat dengan teks percakapan biasa. Tidak ada konten melanggar terlihat. Aman.",
    output:
      '{"results":[{"message_id":"22222","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Percakapan sehari-hari tentang makanan; gambar screenshot chat biasa tanpa pelanggaran."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "5",
    title: "Pesan promosi judi dengan gambar situs judi",
    input:
      '[target] id=33333 user=spammer: MAIN DI SINI GACOR PARAH https://judionline.xyz [Media analysis for message 33333] [gambar di atas adalah attachment slot.jpg dari pesan id=33333]: Gambar menampilkan antarmuka situs judi online dengan mesin slot, chip, dan tombol deposit. Terlihat logo "JudiOnline" dan odds taruhan.',
    output:
      '{"results":[{"message_id":"33333","status":"flagged","flags":["gambling"],"score":0.92,"severity":"high","confidence":0.92,"recommended_action":"delete","evidence":["MAIN DI SINI GACOR PARAH","https://judionline.xyz"],"analysis":"Promosi situs judi dengan link, teks promosi, dan gambar antarmuka judi yang jelas."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "6",
    title: "Pesan HANYA GAMBAR tanpa teks (WAJIB analisis deskripsi)",
    input:
      "[target] id=44444 user=dev: [Media analysis for message 44444] [gambar di atas adalah attachment screenshot.png dari pesan id=44444]: Screenshot terminal Linux dengan background hitam dan teks hijau. Terlihat output command 'ls -la' dan 'git status'. Tidak ada teks atau elemen mencurigakan.",
    output:
      '{"results":[{"message_id":"44444","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Screenshot terminal Linux (ls -la, git status) — aktivitas coding biasa, tidak ada pelanggaran."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "7",
    title: "Pesan HANYA GAMBAR situs judi (teks kosong, tapi gambar jelas)",
    input:
      '[target] id=55555 user=promotor: [Media analysis for message 55555] [gambar di atas adalah attachment promo.jpg dari pesan id=55555]: Screenshot website dengan background merah dan emas. Terlihat teks "DEPOSIT NOW", "BONUS 100%", "SLOT GACOR", chip poker, dan roda roulette. Ada tombol "DAFTAR" dan "LOGIN".',
    output:
      '{"results":[{"message_id":"55555","status":"flagged","flags":["gambling"],"score":0.94,"severity":"high","confidence":0.94,"recommended_action":"delete","evidence":["Gambar antarmuka situs judi dengan chip, roulette, tombol deposit"],"analysis":"Gambar promosi judi jelas: chip, roulette, teks deposit dan bonus. Melanggar gambling."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "21",
    title: "Membuat agama palsu / mengaku Tuhan (SARA agama)",
    input:
      "[target] id=21212 user=troll: ayo bikin agama, aku tuhannya, yg mau jadi malaikat DM aku",
    output:
      '{"results":[{"message_id":"21212","status":"flagged","flags":["sara"],"score":0.95,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["ayo bikin agama, aku tuhannya"],"analysis":"Mengajak membuat agama palsu dan mengaku Tuhan — penistaan agama serius, bukan candaan."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "23",
    title: "Mockery tokoh agama (SARA agama, Hashem)",
    input:
      "[target] id=23234 user=edgelord: Hashem is watching you jerk off lol",
    output:
      '{"results":[{"message_id":"23234","status":"flagged","flags":["sara"],"score":0.94,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["Hashem is watching you jerk off lol"],"analysis":"Nama suci (Hashem) dalam konteks vulgar merendahkan — blasphemy serius."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "24",
    title: "Nabi palsu (SARA agama, Ba'al)",
    input:
      "[target] id=24245 user=provokator: nabi palsu ba'al, sembah aja patung",
    output:
      '{"results":[{"message_id":"24245","status":"flagged","flags":["sara","hate_speech"],"score":0.9,"severity":"high","confidence":0.95,"recommended_action":"delete","evidence":["nabi palsu ba\'al"],"analysis":"Sindiran konsep nabi dengan referensi Ba\'al + ajakan menyembah patung — penistaan monoteis."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "25",
    title: "Parodi bahasa keagamaan untuk mengejek (SARA agama)",
    input:
      "[target] id=25256 user=sindiran: Bodoh admin-admin kita itu. Mereka tidak minta petunjuk dari Tuhan",
    output:
      '{"results":[{"message_id":"25256","status":"flagged","flags":["sara","hate_speech"],"score":0.82,"severity":"high","confidence":0.9,"recommended_action":"delete","evidence":["tidak minta petunjuk dari Tuhan"],"analysis":"Framework agama (\'petunjuk dari Tuhan\') dipakai untuk mengejek — parodi merendahkan."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "26",
    title: "Provokasi antar-agama (SARA agama)",
    input:
      "[target] id=26267 user=provokator: Islam/Kristen itu agama sesat semua, cuma agama gue yg bener",
    output:
      '{"results":[{"message_id":"26267","status":"flagged","flags":["sara","hate_speech","conflict_instigation"],"score":0.95,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["Islam/Kristen itu agama sesat semua"],"analysis":"Menyerang agama lain sebagai \'sesat\' dengan truth claim provokatif — provokasi antar-agama serius."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "28",
    title: "Diskusi teologis sopan (AMAN, BUKAN SARA)",
    input:
      "[target] id=28289 user=thinker: Menurutku konsep trinitas dalam Kristen menarik dibandingkan tauhid dalam Islam. Apa pendapat kalian?",
    output:
      '{"results":[{"message_id":"28289","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.9,"recommended_action":"none","evidence":[],"analysis":"Perbandingan teologis dengan bahasa sopan dan tone diskusi — bukan provokasi. Aman."}]}',
    modes: ["media", "mixed"],
  },

  // ── Invite link / promosi server ──
  {
    id: "29",
    title: "Promosi invite Discord tanpa konteks (spam)",
    input:
      "[target] id=29292 user=promotor: Join sini bro https://discord.gg/xyzk123 diskusi coding seru",
    output:
      '{"results":[{"message_id":"29292","status":"warn","flags":["spam"],"score":0.55,"severity":"low","confidence":0.7,"recommended_action":"warn","evidence":["https://discord.gg/xyzk123"],"analysis":"Promosi server lain via invite di channel publik tanpa izin — potensi spam."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── LGBT zero tolerance ──
  {
    id: "30",
    title: "LGBT coming out (dilarang — zero tolerance)",
    input:
      "[target] id=30303 user=rainbow: jujur aja gua lesbian, terima apa adanya",
    output:
      '{"results":[{"message_id":"30303","status":"flagged","flags":["sexual_deviation"],"score":0.9,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["jujur aja gua lesbian"],"analysis":"Pengakuan orientasi lesbian — zero tolerance LGBT di server ini. Dihapus."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── Topik Israel/Palestina/Yahudi ──
  {
    id: "31",
    title: "Diskusi Israel-Palestina (dilarang total)",
    input:
      "[target] id=31313 user=hot_takes: gw sih dukung palestina, israel biadab banget",
    output:
      '{"results":[{"message_id":"31313","status":"flagged","flags":["conflict_instigation","sara"],"score":0.95,"severity":"critical","confidence":0.95,"recommended_action":"delete","evidence":["gw sih dukung palestina"],"analysis":"Segala diskusi Israel/Palestina/Yahudi dilarang total — tidak ada debat, dukungan, atau berita. Dihapus."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── Physics / Technology Discussions (false positive prevention) ──
  {
    id: "32",
    title: "Diskusi fisika/kinetik dalam konteks teknis (AMAN, bukan ancaman)",
    input:
      "[target] id=32323 user=physics_student: Cukup cuman tubuh manusia vs gravitasi. Konsep energy conservation di sini penting buat analisis statis.",
    output:
      '{"results":[{"message_id":"32323","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.95,"recommended_action":"none","evidence":[],"analysis":"Diskusi fisika teknis tentang kinetik dan gravitasi dalam konteks analisis statis – tidak ada ancaman atau konten melanggar. Penggunaan istilah fisika untuk perhitungan teknis adalah hal wajar."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "33",
    title: "Diskusi drone/senjata dalam konteks teknis (AMAN, bukan ancaman)",
    input:
      "[target] id=33333 user=engineer: Pengirim menyiratkan penggunaan energi kinetik dari jatuh (tubuh manusia vs gravitasi) sebagai metode untuk 'menetralisir' target dalam konteks diskusi senjata drone sebelumnya.",
    output:
      '{"results":[{"message_id":"33333","status":"clean","flags":[],"score":0.0,"severity":"none","confidence":0.9,"recommended_action":"none","evidence":[],"analysis":"Diskusi teknis tentang drone dan aplikasi fisika dalam konteks engineering – tidak ada ajuan aksi atau ancaman nyata. Penggunaan istilah senjata dalam konteks diskusi teori adalah hal wajar."}]}',
    modes: ["text", "mixed"],
  },
];

// Derive per-mode strings from the single ALL_EXAMPLES array (zero duplication)
export const FEW_SHOT_EXAMPLES = formatExamples(
  ALL_EXAMPLES.filter((ex) => ex.modes.includes("mixed")),
  "## Contoh Output yang Benak",
);
export const TEXT_ONLY_EXAMPLES = formatExamples(
  ALL_EXAMPLES.filter((ex) => ex.modes.includes("text")),
  "## Contoh Output yang Benak",
);
export const MEDIA_EXAMPLES = formatExamples(
  ALL_EXAMPLES.filter((ex) => ex.modes.includes("media")),
  "## Contoh Output yang Benak — Mode Media",
);
