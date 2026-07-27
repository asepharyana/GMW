/**
 * Few-shot examples for LLM moderation prompts.
 *
 * Extracted from the monolithic system.ts to reduce line count and enable
 * focused maintenance of example data.
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

/**
 * Formats an array of ExampleDef into the prompt-ready string block.
 */
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
  // ── Text-only examples (1, 2, 15, 16, 17, 18, 19) ──
  {
    id: "1",
    title: "Pesan bersih dengan slang",
    input: "[target] id=12345 user=budi: anjay wkwk gaskeun santuy bro",
    output:
      '{"results":[{"message_id":"12345","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Slang Indonesia umum tanpa pelanggaran terdeteksi."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "2",
    title: "Harassment terarah",
    input:
      "[target] id=67890 user=anon: lu goblok banget sih kontol, mampus aja lo",
    output:
      '{"results":[{"message_id":"67890","status":"flagged","flags":["harassment","vulgar_language"],"score":0.85,"categories":["harassment","vulgar_language"],"severity":"high","confidence":0.9,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["lu goblok banget sih kontol","mampus aja lo"],"analysis":"Insult langsung dengan kata kasar terarah ke individu."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "15",
    title: "Emoji Huruf (Evasion)",
    input: "[target] id=16161 user=sneaky: gsap expo 🇬 🇦 🇾",
    output:
      '{"results":[{"message_id":"16161","status":"flagged","flags":["sexual_deviation"],"score":0.8,"categories":["sexual_deviation"],"severity":"medium","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["🇬 🇦 🇾"],"analysis":"Pengirim menggunakan emoji regional indicator untuk mengeja kata terlarang — teknik evasi untuk topik yang dibatasi server. Melanggar kebijakan."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "16",
    title: "Typo QWERTY Programming (False Positive Prevention)",
    input: "[target] id=17171 user=dian432: Apakah bisa ngodonf disitu?",
    output:
      '{"results":[{"message_id":"17171","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim bertanya tentang pemrograman. Kata \'ngodonf\' adalah typo natural (QWERTY f-g, o-i) dari \'ngoding\'. Bukan obfuscation kata kasar. Konteks percakapan wajar."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "17",
    title: "Error log programming (AMAN)",
    input:
      "[target] id=17172 user=dev: TypeError: Cannot read properties of undefined (reading 'map'). Kalo ada yang tau solusinya tolong bantu",
    output:
      '{"results":[{"message_id":"17172","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim bertanya tentang error programming. Ini adalah diskusi teknis normal, bukan pelanggaran. Aman."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "18",
    title: "Nama proyek/tools (AMAN, false positive prevention)",
    input:
      "[target] id=17173 user=dev: Guys pake Cursor lebih enak daripada VSCode? Gw pake Claude buat bantuin debugging",
    output:
      '{"results":[{"message_id":"17173","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim membahas tools programming (Cursor, VSCode, Claude). Ini adalah diskusi teknis biasa. Tidak ada pelanggaran."}]}',
    modes: ["text", "mixed"],
  },
  {
    id: "19",
    title: "Diskusi orientasi seksual LGBT (dilarang — zero tolerance)",
    input:
      "[target] id=17174 user=alex: btw gw gay, semoga ga masalah ya. Gw cmn mau jujur aja",
    output:
      '{"results":[{"message_id":"17174","status":"flagged","flags":["sexual_deviation"],"score":0.85,"categories":["sexual_deviation"],"severity":"high","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["btw gw gay, semoga ga masalah ya"],"analysis":"Pengirim menyebutkan orientasi LGBT. Berdasarkan kebijakan server, segala bentuk diskusi tentang LGBT dilarang — tidak ada toleransi untuk pengakuan orientasi, coming out, atau curhat personal. Dihapus."}]}',
    modes: ["text", "mixed"],
  },

  // ── Mixed examples (3, 8, 9, 10, 10.5, 11, 12, 13, 14, 20, 22, 27) ──
  {
    id: "3",
    title: "Sticker kartun dengan nama provokatif",
    input:
      '[target] id=11111 user=citra: <:singa_injek:123456> [sticker: "Singa injek pejabat"]',
    output:
      '{"results":[{"message_id":"11111","status":"clean","flags":[],"score":0.1,"categories":[],"severity":"none","confidence":0.8,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Sticker kartun satir dengan nama provokatif namun bukan ancaman nyata."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "8",
    title: "Seksisme terarah",
    input:
      "[target] id=88888 user=sexist: dasar perempuan ngerti apa sih, logika lo aja kagak bener",
    output:
      '{"results":[{"message_id":"88888","status":"flagged","flags":["hate_speech","harassment"],"score":0.82,"categories":["hate_speech","harassment"],"severity":"high","confidence":0.9,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["dasar perempuan ngerti apa sih","logika lo aja kagak bener"],"analysis":"Pengirim mengirim komentar seksis merendahkan yang menyasar gender perempuan. Penghinaan terarah dan stereotip ofensif. Melanggar aturan hate speech dan harassment."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "9",
    title: "Memancing drama/konflik",
    input:
      "[target] id=99999 user=drama: si budi kemarin ngomongin lo di belakang, masa tega banget dia, ayo kita konfrontasi di sini aja",
    output:
      '{"results":[{"message_id":"99999","status":"warn","flags":["conflict_instigation"],"score":0.65,"categories":["conflict_instigation"],"severity":"low","confidence":0.75,"recommended_action":"warn","policy_version":"default-2026-05-30","evidence":["si budi kemarin ngomongin lo di belakang","ayo kita konfrontasi di sini aja"],"analysis":"Pengirim mengajak konfrontasi masalah personal di channel publik. Berpotensi menimbulkan pertengkaran dan drama. Tidak ada pelanggaran berat namun perlu diperingatkan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "10",
    title: "Sexual_deviation EKSPLISIT (ajakan seksual)",
    input:
      "[target] id=10101 user=fox: mau liat foto pake kostum hewan? DM aja, khusus 18+",
    output:
      '{"results":[{"message_id":"10101","status":"flagged","flags":["sexual_deviation"],"score":0.85,"categories":["sexual_deviation"],"severity":"high","confidence":0.9,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["mau liat foto pake kostum hewan? DM aja, khusus 18+"],"analysis":"Pengirim mengajak aktivitas seksual dengan frasa eksplisit \'DM aja, khusus 18+\'. Ini melanggar kebijakan server."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "10.5",
    title: "Kode programming (AMAN)",
    input:
      "[target] id=10505 user=dev: ERROR: Cannot read properties of undefined (reading 'data'). Stack trace: at Module._compile (node:internal/modules/cjs/loader:1256:14)",
    output:
      '{"results":[{"message_id":"10505","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim berbagi error log programming. Ini adalah diskusi teknis normal antara developer, bukan pelanggaran. Aman."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "11",
    title: "Username ofensif (isi pesan bersih)",
    input:
      "[target] id=12121 user=pejabat_munafik_dajjal: Halo teman-teman, ada yang main game?",
    output:
      '{"results":[{"message_id":"12121","status":"flagged","flags":["offensive_username"],"score":0.3,"categories":["offensive_username"],"severity":"low","confidence":0.95,"recommended_action":"warn","policy_version":"default-2026-05-30","evidence":["Username \'pejabat_munafik_dajjal\' mengandung unsur ofensif/SARA"],"analysis":"Pengirim memiliki username ofensif yang menyerang pejabat dengan label SARA. Namun isi pesan bersih dan tidak terkait username. Flag ringan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "12",
    title: "Username ofensif (isi pesan memperkuat)",
    input:
      "[target] id=13131 user=nazi_babi_itu: bener tuh nih ras emang harus dibasmi",
    output:
      '{"results":[{"message_id":"13131","status":"flagged","flags":["offensive_username","hate_speech","sara"],"score":0.9,"categories":["offensive_username","hate_speech","sara"],"severity":"high","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Username \'nazi_babi_itu\' mengandung unsur SARA","bener tuh nih ras emang harus dibasmi"],"analysis":"Pengirim memiliki username SARA dan isi pesan memperkuat tone kebencian dengan ajakan kekerasan terhadap ras tertentu. Pelanggaran berat."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "13",
    title: "Obfuscation / Zalgo Text (Evasion)",
    input:
      '[target] id=14141 user=hater: ++++++K1[[ your $€/F" "~`| \\\\0ve $ 1F ¥°U |}iE ®©',
    output:
      '{"results":[{"message_id":"14141","status":"flagged","flags":["harassment","hate_speech"],"score":0.95,"categories":["harassment","hate_speech"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["++++++K1[[ your $€/F","\\\\\\\\0ve $ 1F ¥°U |}iE"],"analysis":"Pesan menggunakan teknik obfuscation/simbol untuk menyembunyikan frasa \'Kill yourself I love if you die\'. Ini adalah ancaman dan pelecehan berat yang disamarkan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "14",
    title: "Vulgaritas Bahasa Asing / All-Caps",
    input: "[target] id=15151 user=troll: AKU RAJA TITTEN",
    output:
      '{"results":[{"message_id":"15151","status":"flagged","flags":["vulgar_language"],"score":0.85,"categories":["vulgar_language"],"severity":"medium","confidence":0.9,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["AKU RAJA TITTEN"],"analysis":"Pesan menggunakan kata vulgar bahasa asing (\'titten\' berarti payudara dalam bahasa Jerman) dengan huruf kapital. Ini adalah pelanggaran vulgar_language meskipun formatnya seperti candaan."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "20",
    title: "Parodi ayat palsu (SARA agama)",
    input:
      '[target] id=20201 user=parodist: Kitabonia 11:17 — "Dan bersabdalah Sang Admin: barang siapa yang melakukan spam, niscaya akan kena mute tujuh hari tujuh malam"',
    output:
      '{"results":[{"message_id":"20201","status":"flagged","flags":["sara"],"score":0.92,"categories":["sara"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Kitabonia 11:17","Dan bersabdalah Sang Admin: barang siapa yang melakukan spam, niscaya akan kena mute tujuh hari tujuh malam"],"analysis":"Pengirim membuat ayat palsu dengan format penulisan kitab suci (pasal:ayat) yang memparodikan wahyu. Ini adalah penistaan agama serius, bukan humor. Melanggar kebijakan SARA."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "22",
    title: "Istilah agama sebagai joke (SARA agama, shirkmaxxing)",
    input:
      "[target] id=22223 user=edgy: Shirkmaxxing grindset, nanti halalmaxxing juga",
    output:
      '{"results":[{"message_id":"22223","status":"flagged","flags":["sara"],"score":0.88,"categories":["sara"],"severity":"high","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Shirkmaxxing grindset","halalmaxxing juga"],"analysis":"Pengirim menggunakan istilah suci agama Islam (shirk/syirik dan halal) sebagai bahan candaan dengan suffix meme. Ini adalah penistaan terhadap konsep teologis serius. Melanggar SARA."}]}',
    modes: ["text", "media", "mixed"],
  },
  {
    id: "27",
    title: "Ekspresi keagamaan normal (AMAN, BUKAN SARA)",
    input: "[target] id=27278 user=muslim_user: Astaghfirullah, sabar ya bro",
    output:
      '{"results":[{"message_id":"27278","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim mengucapkan istighfar (doa normal) dalam konteks menenangkan teman. Ini adalah ekspresi keagamaan wajar dalam budaya Indonesia, bukan penistaan. Aman."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── Media-only examples (4, 5, 6, 7, 21, 23, 24, 25, 26, 28) ──
  {
    id: "4",
    title: "Pesan biasa dengan gambar (JANGAN flag sebagai judi)",
    input:
      "[target] id=22222 user=rina: Aku suka nasgor loh [Media analysis for message 22222] [gambar di atas adalah attachment foto.jpg dari pesan id=22222]: Gambar menampilkan tangkapan layar aplikasi chat dengan teks percakapan biasa. Tidak ada konten melanggar terlihat. Aman.",
    output:
      '{"results":[{"message_id":"22222","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pesan berisi percakapan sehari-hari tentang makanan. Gambar menunjukkan screenshot chat biasa tanpa pelanggaran."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "5",
    title: "Pesan promosi judi dengan gambar situs judi",
    input:
      '[target] id=33333 user=spammer: MAIN DI SINI GACOR PARAH https://judionline.xyz [Media analysis for message 33333] [gambar di atas adalah attachment slot.jpg dari pesan id=33333]: Gambar menampilkan antarmuka situs judi online dengan mesin slot, chip, dan tombol deposit. Terlihat logo "JudiOnline" dan odds taruhan.',
    output:
      '{"results":[{"message_id":"33333","status":"flagged","flags":["gambling"],"score":0.92,"categories":["gambling"],"severity":"high","confidence":0.92,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["MAIN DI SINI GACOR PARAH","https://judionline.xyz","Gambar menampilkan antarmuka situs judi online dengan mesin slot, chip, dan tombol deposit"],"analysis":"Promosi situs judi online dengan link, teks promosi, dan gambar antarmuka judi yang jelas."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "6",
    title: "Pesan HANYA GAMBAR tanpa teks (WAJIB analisis deskripsi)",
    input:
      "[target] id=44444 user=dev: [Media analysis for message 44444] [gambar di atas adalah attachment screenshot.png dari pesan id=44444]: Screenshot terminal Linux dengan background hitam dan teks hijau. Terlihat output command 'ls -la' dan 'git status'. Tidak ada teks atau elemen mencurigakan.",
    output:
      '{"results":[{"message_id":"44444","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.95,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim mengirim screenshot terminal Linux. Terlihat output command ls -la dan git status dengan teks hijau di background hitam. Aktivitas coding biasa, tidak ada konten melanggar."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "7",
    title: "Pesan HANYA GAMBAR situs judi (teks kosong, tapi gambar jelas)",
    input:
      '[target] id=55555 user=promotor: [Media analysis for message 55555] [gambar di atas adalah attachment promo.jpg dari pesan id=55555]: Screenshot website dengan background merah dan emas. Terlihat teks "DEPOSIT NOW", "BONUS 100%", "SLOT GACOR", chip poker, dan roda roulette. Ada tombol "DAFTAR" dan "LOGIN".',
    output:
      '{"results":[{"message_id":"55555","status":"flagged","flags":["gambling"],"score":0.94,"categories":["gambling"],"severity":"high","confidence":0.94,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Gambar menampilkan antarmuka situs judi online dengan chip, roulette, tombol deposit, dan teks promosi judi"],"analysis":"Promosi situs judi melalui gambar dengan elemen judi jelas: chip, roulette, teks deposit dan bonus."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "21",
    title: "Membuat agama palsu / mengaku Tuhan (SARA agama)",
    input:
      "[target] id=21212 user=troll: ayo bikin agama, aku tuhannya, yg mau jadi malaikat DM aku",
    output:
      '{"results":[{"message_id":"21212","status":"flagged","flags":["sara"],"score":0.95,"categories":["sara"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["ayo bikin agama, aku tuhannya, yg mau jadi malaikat DM aku"],"analysis":"Pengirim mengajak membuat agama palsu dan mengaku sebagai Tuhan. Ini adalah penistaan agama yang sangat serius, bukan candaan. Melanggar kebijakan SARA."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "23",
    title: "Mockery tokoh agama (SARA agama, Hashem)",
    input:
      "[target] id=23234 user=edgelord: Hashem is watching you jerk off lol",
    output:
      '{"results":[{"message_id":"23234","status":"flagged","flags":["sara"],"score":0.94,"categories":["sara"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Hashem is watching you jerk off lol"],"analysis":"Pengirim menggunakan nama suci Yahudi (Hashem) dalam konteks vulgar dan merendahkan. Ini adalah penistaan/blasphemy serius terhadap figur agama. Melanggar SARA."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "24",
    title: "Nabi palsu (SARA agama, Ba'al)",
    input:
      "[target] id=24245 user=provokator: nabi palsu ba'al, sembah aja patung",
    output:
      '{"results":[{"message_id":"24245","status":"flagged","flags":["sara","hate_speech"],"score":0.9,"categories":["sara","hate_speech"],"severity":"high","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["nabi palsu ba\'al","sembah aja patung"],"analysis":"Pengirim menyindir konsep nabi dengan referensi Ba\'al dan menyuruh menyembah patung. Ini adalah penistaan dan provokasi terhadap agama monoteis. Melanggar SARA."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "25",
    title: "Parodi bahasa keagamaan untuk mengejek (SARA agama)",
    input:
      "[target] id=25256 user=sindiran: Bodoh admin-admin kita itu. Mereka tidak minta petunjuk dari Tuhan",
    output:
      '{"results":[{"message_id":"25256","status":"flagged","flags":["sara","hate_speech"],"score":0.82,"categories":["sara","hate_speech"],"severity":"high","confidence":0.9,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Bodoh admin-admin kita itu","tidak minta petunjuk dari Tuhan"],"analysis":"Pengirim menggunakan bahasa keagamaan (\'petunjuk dari Tuhan\') untuk mengejek admin. Ini adalah parodi yang menggunakan framework agama untuk merendahkan orang lain. Melanggar SARA dan hate speech."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "26",
    title: "Provokasi antar-agama (SARA agama)",
    input:
      "[target] id=26267 user=provokator: Islam/Kristen itu agama sesat semua, cuma agama gue yg bener",
    output:
      '{"results":[{"message_id":"26267","status":"flagged","flags":["sara","hate_speech","conflict_instigation"],"score":0.95,"categories":["sara","hate_speech","conflict_instigation"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["Islam/Kristen itu agama sesat semua","cuma agama gue yg bener"],"analysis":"Pengirim menyerang agama lain sebagai \'sesat\' dan mengklaim kebenaran mutlak agamanya sendiri dengan tone provokatif. Ini adalah provokasi antar-agama serius. Melanggar SARA."}]}',
    modes: ["media", "mixed"],
  },
  {
    id: "28",
    title: "Diskusi teologis sopan (AMAN, BUKAN SARA)",
    input:
      "[target] id=28289 user=thinker: Menurutku konsep trinitas dalam Kristen menarik dibandingkan tauhid dalam Islam. Apa pendapat kalian?",
    output:
      '{"results":[{"message_id":"28289","status":"clean","flags":[],"score":0.0,"categories":[],"severity":"none","confidence":0.9,"recommended_action":"none","policy_version":"default-2026-05-30","evidence":[],"analysis":"Pengirim membandingkan konsep teologis antar agama dengan bahasa sopan dan tone diskusi, bukan provokasi. Mengajak diskusi dengan hormat. Aman."}]}',
    modes: ["media", "mixed"],
  },

  // ── New: Invite link / promosi server ──
  {
    id: "29",
    title: "Promosi invite Discord tanpa konteks (spam)",
    input:
      "[target] id=29292 user=promotor: Join sini bro https://discord.gg/xyzk123 diskusi coding seru",
    output:
      '{"results":[{"message_id":"29292","status":"warn","flags":["spam"],"score":0.55,"categories":["spam"],"severity":"low","confidence":0.7,"recommended_action":"warn","policy_version":"default-2026-05-30","evidence":["https://discord.gg/xyzk123"],"analysis":"Pengirim mempromosikan server Discord lain melalui invite link di channel. Meskipun topik coding relevan, promosi server tanpa izin di channel publik berpotensi spam. Diberi peringatan."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── New: LGBT zero tolerance ──
  {
    id: "30",
    title: "LGBT coming out (dilarang — zero tolerance)",
    input:
      "[target] id=30303 user=rainbow: jujur aja gua lesbian, terima apa adanya",
    output:
      '{"results":[{"message_id":"30303","status":"flagged","flags":["sexual_deviation"],"score":0.9,"categories":["sexual_deviation"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["jujur aja gua lesbian, terima apa adanya"],"analysis":"Pengirim mengungkapkan orientasi lesbian. LGBT zero tolerance — segala bentuk diskusi/pengakuan orientasi LGBT dilarang di server ini. Dihapus."}]}',
    modes: ["text", "media", "mixed"],
  },

  // ── New: Topik Israel/Palestina/Yahudi ──
  {
    id: "31",
    title: "Diskusi Israel-Palestina (dilarang total)",
    input:
      "[target] id=31313 user=hot_takes: gw sih dukung palestina, israel biadab banget",
    output:
      '{"results":[{"message_id":"31313","status":"flagged","flags":["conflict_instigation","sara"],"score":0.95,"categories":["conflict_instigation","sara"],"severity":"critical","confidence":0.95,"recommended_action":"delete","policy_version":"default-2026-05-30","evidence":["gw sih dukung palestina, israel biadab banget"],"analysis":"Segala bentuk diskusi tentang Israel, Palestina, dan Yahudi dilarang total di server ini — tidak ada debat, dukungan, atau berita. Dihapus."}]}',
    modes: ["text", "media", "mixed"],
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
