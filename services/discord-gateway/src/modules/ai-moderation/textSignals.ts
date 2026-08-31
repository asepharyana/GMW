/**
 * textSignals.ts
 *
 * Shared, LLM-free text scoring signals for deciding which words/phrases in
 * a message are worth an external lookup (Wikipedia glossary term, Wikipedia
 * search query, etc.).
 *
 * Extracted out of termGlossary.ts (2026-08-31) so wikipediaClient.ts's
 * phrase-level search-query extractor can reuse the exact same
 * stopword/known-term/scoring logic instead of maintaining a second,
 * divergent copy. Everything here is pure CPU-side regex + scoring — no
 * network or LLM call — so using it in more places never adds AI requests.
 */

/** Word tokenizer — letters/digits plus internal -_'· (handles "well-known",
 *  "node_modules", diacritics). */
export const WORD_RE = /[\p{L}\p{N}]+(?:[-_'’·][\p{L}\p{N}]+)*/gu;

/** Removes URLs, Discord mentions/custom emoji, code fences, markdown noise. */
export function cleanContent(raw: string): string {
  return raw
    .replace(/https?:\/\/\S+/gi, " ")
    .replace(/<@!?\d+>/g, " ")
    .replace(/<#\d+>/g, " ")
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/[`*_~|>[\]]/g, " ")
    .replace(/[\p{Emoji}\p{Extended_Pictographic}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Filters out tokens that are useless as lookup candidates (numbers,
 *  repeated-char noise, mega-tokens). */
export function isNoiseWord(word: string): boolean {
  if (word.length > 28) return true;
  if (/^\d+$/.test(word)) return true;
  const lower = word.toLowerCase();
  // "aaaa…", "wwwwww" — single repeated character
  if (/^(.)\1{2,}$/.test(lower)) return true;
  // "wkwk", "hehe", "69" alternations — repeated 2–3 char base. "meme" is
  // the one legit 4-letter word this matches; it is whitelisted below.
  if (/^([a-z]{2,3})\1{1,}$/.test(lower)) return true;
  return false;
}

/** Deterministic bonus for words that look like proper nouns or foreign. */
export function scoreWord(word: string): number {
  let score = 1;
  // Capitalized first letter (proper noun / title) but not ALL-CAPS acronyms
  if (/^[A-Z]/.test(word) && !/^[A-Z]{2,}$/.test(word)) score += 3;
  // Contains a letter outside basic latin → regional/foreign spelling
  if (/[\p{L}]/u.test(word.replace(/[A-Za-z]/g, ""))) score += 2;
  // Contains an internal apostrophe or hyphen → likely a named entity
  if (/[-_'’·]/.test(word)) score += 2;
  return score;
}

export const STOPWORDS = new Set(
  // ── Bahasa Indonesia ────────────────────────────────────────────────
  (
    " yang dan di ke dari ini itu dengan untuk pada dalam adalah akan telah sudah bisa dapat harus tidak juga saya kamu kita kami mereka dia aku kau gua lu lo gw gue elu anda kalian nya kah lah pun ya yah kan sih dong deh kok loh toh aja saja gitu gini begitu begini tapi tetapi namun atau karena sebab jika kalau bila maka supaya agar meski meskipun walau walaupun ketika saat setelah sebelum selama antara terhadap tentang mengenai bagi oleh secara sebagai seperti daripada tanpa hingga sampai sejak menuju bahwa padahal sebenarnya sepertinya mungkin memang jadi lalu terus akhirnya misalnya contohnya banyak sedikit semua seluruh setiap tiap beberapa ada bukan jangan boleh mau ingin pengen nggak ngak gak ga kagak ngga ndak nanti kemarin besok hari ini sekarang waktu itu masih sedang belum pernah sering selalu kadang jarang cepat lambat awal akhir baru lama besar kecil tinggi rendah panjang pendek baik buruk benar salah sama beda penting biasanya selamat terima kasih makasih sangat sekali paling cuma cuman hanya lebih kurang sekitar hampir ternyata rupanya begitu gimana bagaimana kenapa mengapa siapa apa mana kapan darimana kemana bilang ngomong omong kata tadi dulu terus lagi tetap pasti seharusnya sebaiknya seakan seolah kayaknya keliatan kelihatan ketahuan disini disitu disana kesini kesana bener pake pakai kayak emang lagian mulu istilah istilahnya banget" +
    // ── English ───────────────────────────────────────────────────────
    " the a an and or but if then else for to in on at by with without from of is are was were be been being have has had do does did will would can could should may might must shall this that these those it its i you he she we they them their there here when where why how what which who whom whose only very just about above after before below under over into onto within upon against between among during through across along around behind beyond near off out up down now then so as not no yes ok okay" +
    // ── Common net slang / acronyms the LLM already knows ──────────────
    " lol omg wtf idk btw tbh imo aka fyi nsfw smh nvm asap afk brb gg wp ty np mb sry thx kk oke okk ygy frfr"
  ).split(/\s+/),
);

/**
 * Words that are either already defined by the moderation rules, or are so
 * common (brands, tech vocabulary, project names) that a Wikipedia lookup is
 * a guaranteed miss/waste. Keeps lookups focused on genuinely unknown terms.
 */
export const KNOWN_SAFE_TERMS = new Set(
  (
    "discord youtube google facebook instagram twitter tiktok whatsapp telegram netflix spotify steam github gitlab bitbucket chatgpt openai anthropic claude deepseek gemini llama copilot cursor vscode vscodium jetbrains intellij pycharm webstorm sublime codeblocks" +
    " docker kubernetes k8s linux ubuntu debian arch fedora manjaro kali windows macos android ios chrome firefox safari edge opera brave" +
    " react nextjs next vue svelte angular node nodejs deno bun pnpm yarn npm javascript typescript python golang go rust java kotlin swift cplusplus cpp css html json xml yaml toml regex backend frontend database mysql postgres postgresql mongodb redis qdrant sqlite nosql graphql rest websocket webhook" +
    " bug crash error debug fix issue pr merge commit push pull branch main master dev staging production server client app website web browser" +
    " stream streaming video audio voice call camera screen share screenshare gameplay gaming game play steam epic xbox playstation nintendo switch console" +
    " bot discordbot moderation moderator admin member user profile avatar channel server guild message chat dm reply forward embed sticker emoji role permission" +
    " meme code coding ngoding programmer program developer engineer software hardware cpu gpu ram rom storage disk network internet wifi lan ip dns vpn proxy cloud aws azure gcp vercel netlify heroku railway render vps hosting domain ssl login logout register account password email username" +
    " anime manga waifu husbando tsundere moe otaku wibu weeb otome isekai shonen seinen josei manga manhwa manhua doujin" +
    " anjay wkwk wkwkwk gws gaskeun santuy njir baka woy woi hadeh astaga asu anjing bangsat ngehe asal alay lebay caper mabar" +
    " asus bete imphnen impnhen ngab" +
    " syahadat sholat shalat solat puasa zakat haji umrah doa tuhan nabi allah yesus muhammad hashem" +
    " loli shota incest exhibition furry fursuit cosplay costume" +
    " gaza palestine israel yahudi yahud israel palestina israeli" +
    " hokkian mandarin arabic jawa sunda betawi minang bugis batak melayu inggris indonesia"
  ).split(/\s+/),
);

export function isKnownTerm(word: string): boolean {
  return STOPWORDS.has(word) || KNOWN_SAFE_TERMS.has(word);
}

/** True when a phrase is mostly filler words (skip it as a lookup candidate). */
export function isMostlyStopwords(phrase: string): boolean {
  const words = phrase
    .toLowerCase()
    .split(/[^a-zà-öø-ÿ]+/i)
    .filter(Boolean);
  if (words.length === 0) return true;
  const stopCount = words.filter((w) => STOPWORDS.has(w)).length;
  return stopCount / words.length >= 0.6;
}
