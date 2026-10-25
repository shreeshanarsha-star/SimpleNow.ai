// Dr.Remi language catalogue. "auto" = detect from what the customer says
// or types and answer in that same language. The list below is what the UI
// offers as an explicit choice; detection itself is open-ended (any language
// the speech model and the LLM recognise is answered in kind).
//
// `bcp47` drives the browser speech-synthesis fallback voice; `whisper` is
// the lowercase name Whisper returns in verbose_json `language`.

export interface RemiLanguage {
  code: string; // ISO 639-1 (or closest)
  name: string; // English name
  native: string; // endonym shown in the picker
  bcp47: string;
  rtl?: boolean;
}

export const REMI_LANGUAGES: RemiLanguage[] = [
  { code: "en", name: "English", native: "English", bcp47: "en-IN" },
  { code: "hi", name: "Hindi", native: "हिन्दी", bcp47: "hi-IN" },
  { code: "kn", name: "Kannada", native: "ಕನ್ನಡ", bcp47: "kn-IN" },
  { code: "ta", name: "Tamil", native: "தமிழ்", bcp47: "ta-IN" },
  { code: "te", name: "Telugu", native: "తెలుగు", bcp47: "te-IN" },
  { code: "ml", name: "Malayalam", native: "മലയാളം", bcp47: "ml-IN" },
  { code: "mr", name: "Marathi", native: "मराठी", bcp47: "mr-IN" },
  { code: "gu", name: "Gujarati", native: "ગુજરાતી", bcp47: "gu-IN" },
  { code: "bn", name: "Bengali", native: "বাংলা", bcp47: "bn-IN" },
  { code: "pa", name: "Punjabi", native: "ਪੰਜਾਬੀ", bcp47: "pa-IN" },
  { code: "or", name: "Odia", native: "ଓଡ଼ିଆ", bcp47: "or-IN" },
  { code: "ur", name: "Urdu", native: "اردو", bcp47: "ur-PK", rtl: true },
  { code: "ne", name: "Nepali", native: "नेपाली", bcp47: "ne-NP" },
  { code: "si", name: "Sinhala", native: "සිංහල", bcp47: "si-LK" },
  { code: "es", name: "Spanish", native: "Español", bcp47: "es-ES" },
  { code: "pt", name: "Portuguese", native: "Português", bcp47: "pt-BR" },
  { code: "fr", name: "French", native: "Français", bcp47: "fr-FR" },
  { code: "de", name: "German", native: "Deutsch", bcp47: "de-DE" },
  { code: "it", name: "Italian", native: "Italiano", bcp47: "it-IT" },
  { code: "nl", name: "Dutch", native: "Nederlands", bcp47: "nl-NL" },
  { code: "pl", name: "Polish", native: "Polski", bcp47: "pl-PL" },
  { code: "ro", name: "Romanian", native: "Română", bcp47: "ro-RO" },
  { code: "ru", name: "Russian", native: "Русский", bcp47: "ru-RU" },
  { code: "uk", name: "Ukrainian", native: "Українська", bcp47: "uk-UA" },
  { code: "tr", name: "Turkish", native: "Türkçe", bcp47: "tr-TR" },
  { code: "el", name: "Greek", native: "Ελληνικά", bcp47: "el-GR" },
  { code: "ar", name: "Arabic", native: "العربية", bcp47: "ar-SA", rtl: true },
  { code: "fa", name: "Persian", native: "فارسی", bcp47: "fa-IR", rtl: true },
  { code: "he", name: "Hebrew", native: "עברית", bcp47: "he-IL", rtl: true },
  { code: "sw", name: "Swahili", native: "Kiswahili", bcp47: "sw-KE" },
  { code: "am", name: "Amharic", native: "አማርኛ", bcp47: "am-ET" },
  { code: "ha", name: "Hausa", native: "Hausa", bcp47: "ha-NG" },
  { code: "yo", name: "Yoruba", native: "Yorùbá", bcp47: "yo-NG" },
  { code: "zu", name: "Zulu", native: "isiZulu", bcp47: "zu-ZA" },
  { code: "af", name: "Afrikaans", native: "Afrikaans", bcp47: "af-ZA" },
  { code: "id", name: "Indonesian", native: "Bahasa Indonesia", bcp47: "id-ID" },
  { code: "ms", name: "Malay", native: "Bahasa Melayu", bcp47: "ms-MY" },
  { code: "th", name: "Thai", native: "ไทย", bcp47: "th-TH" },
  { code: "vi", name: "Vietnamese", native: "Tiếng Việt", bcp47: "vi-VN" },
  { code: "fil", name: "Filipino", native: "Filipino", bcp47: "fil-PH" },
  { code: "my", name: "Burmese", native: "မြန်မာ", bcp47: "my-MM" },
  { code: "km", name: "Khmer", native: "ខ្មែរ", bcp47: "km-KH" },
  { code: "zh", name: "Chinese (Mandarin)", native: "中文", bcp47: "zh-CN" },
  { code: "ja", name: "Japanese", native: "日本語", bcp47: "ja-JP" },
  { code: "ko", name: "Korean", native: "한국어", bcp47: "ko-KR" },
];

const BY_CODE = new Map(REMI_LANGUAGES.map((l) => [l.code, l]));
const BY_NAME = new Map(REMI_LANGUAGES.map((l) => [l.name.toLowerCase(), l]));

// Whisper returns lowercase English names ("hindi", "portuguese", ...).
const WHISPER_ALIASES: Record<string, string> = {
  mandarin: "zh",
  chinese: "zh",
  tagalog: "fil",
  filipino: "fil",
  myanmar: "my",
  burmese: "my",
  persian: "fa",
  farsi: "fa",
  punjabi: "pa",
  panjabi: "pa",
  odia: "or",
  oriya: "or",
};

export function findLanguage(input: string | null | undefined): RemiLanguage | null {
  if (!input) return null;
  const k = input.trim().toLowerCase();
  if (!k || k === "auto") return null;
  if (BY_CODE.has(k)) return BY_CODE.get(k)!;
  const short = k.split(/[-_]/)[0];
  if (BY_CODE.has(short)) return BY_CODE.get(short)!;
  if (BY_NAME.has(k)) return BY_NAME.get(k)!;
  if (WHISPER_ALIASES[k]) return BY_CODE.get(WHISPER_ALIASES[k]) || null;
  return null;
}

/** Best-effort BCP-47 tag for any code/name, including ones not in the list. */
export function toBcp47(codeOrName: string | null | undefined): string {
  const l = findLanguage(codeOrName);
  if (l) return l.bcp47;
  const k = (codeOrName || "").trim();
  return /^[a-z]{2,3}(-[A-Za-z]{2})?$/.test(k) ? k : "en-IN";
}

export function isRtl(codeOrName: string | null | undefined): boolean {
  return !!findLanguage(codeOrName)?.rtl;
}

// Unicode script ranges -> the languages written in that script. Used to
// sanity-check speech-to-text language labels (Whisper sometimes labels
// Kannada or other Indic speech as Arabic/Urdu), and to name the language
// of a transcript when the STT model returns no label.
const SCRIPTS: { re: RegExp; codes: string[] }[] = [
  { re: /[ಀ-೿]/g, codes: ["kn"] },
  { re: /[஀-௿]/g, codes: ["ta"] },
  { re: /[ఀ-౿]/g, codes: ["te"] },
  { re: /[ഀ-ൿ]/g, codes: ["ml"] },
  { re: /[઀-૿]/g, codes: ["gu"] },
  { re: /[਀-੿]/g, codes: ["pa"] },
  { re: /[଀-୿]/g, codes: ["or"] },
  { re: /[ঀ-৿]/g, codes: ["bn", "as"] },
  { re: /[඀-෿]/g, codes: ["si"] },
  { re: /[ऀ-ॿ]/g, codes: ["hi", "mr", "ne", "sa"] },
  { re: /[؀-ۿݐ-ݿ]/g, codes: ["ar", "ur", "fa", "ps", "sd"] },
  { re: /[֐-׿]/g, codes: ["he", "yi"] },
  { re: /[฀-๿]/g, codes: ["th"] },
  { re: /[က-႟]/g, codes: ["my"] },
  { re: /[ក-៿]/g, codes: ["km"] },
  { re: /[ሀ-፿]/g, codes: ["am"] },
  { re: /[Ͱ-Ͽ]/g, codes: ["el"] },
  { re: /[Ѐ-ӿ]/g, codes: ["ru", "uk", "bg", "sr", "kk", "be", "mk", "mn"] },
  { re: /[가-힯ᄀ-ᇿ]/g, codes: ["ko"] },
  { re: /[぀-ヿ]/g, codes: ["ja"] },
  { re: /[一-鿿]/g, codes: ["zh", "ja"] },
];

/**
 * Languages consistent with the dominant non-Latin script in `text`, or
 * null when the text is Latin-script / too short to tell.
 */
export function scriptLanguages(text: string): string[] | null {
  let best: { n: number; codes: string[] } | null = null;
  for (const s of SCRIPTS) {
    const n = (text.match(s.re) || []).length;
    if (n >= 2 && (!best || n > best.n)) best = { n, codes: s.codes };
  }
  return best ? best.codes : null;
}

/**
 * Reconcile an STT language label with the transcript's own script. The
 * script wins when they disagree; a label is kept only when consistent.
 */
export function reconcileSpokenLanguage(text: string, label: string | null): string | null {
  const labelCode = findLanguage(label)?.code || (label && /^[a-z]{2,3}$/.test(label) ? label : null);
  const codes = scriptLanguages(text);
  if (!codes) {
    // Latin (or unknown) script: a non-Latin label is certainly wrong.
    if (labelCode && NON_LATIN.has(labelCode)) return null;
    return labelCode;
  }
  if (labelCode && codes.includes(labelCode)) return labelCode;
  return codes[0];
}

const NON_LATIN = new Set(SCRIPTS.flatMap((s) => s.codes));
