/**
 * Indian languages and scripts for the document tools: which script each language is written
 * in, which OCR model reads it (when one exists), and script detection for text that is already
 * Unicode. Text is never translated or transliterated; this only decides how to read a page.
 */

export type Script =
  | 'Latin'
  | 'Devanagari'
  | 'Bengali'
  | 'Gurmukhi'
  | 'Gujarati'
  | 'Oriya'
  | 'Tamil'
  | 'Telugu'
  | 'Kannada'
  | 'Malayalam'
  | 'Arabic'
  | 'MeeteiMayek'
  | 'OlChiki';

export interface Language {
  code: string;
  name: string;
  /** Name in the language itself, for the picker. */
  native: string;
  scripts: Script[];
  /**
   * Tesseract model used to read scans. A different language's model is used when the
   * language has none of its own but shares the script (noted in `note`).
   */
  model: string | null;
  note?: string;
  rtl?: boolean;
}

export const LANGUAGES: Language[] = [
  { code: 'en', name: 'English', native: 'English', scripts: ['Latin'], model: 'eng' },
  { code: 'hi', name: 'Hindi', native: 'हिन्दी', scripts: ['Devanagari'], model: 'hin' },
  { code: 'bn', name: 'Bengali', native: 'বাংলা', scripts: ['Bengali'], model: 'ben' },
  { code: 'as', name: 'Assamese', native: 'অসমীয়া', scripts: ['Bengali'], model: 'asm' },
  { code: 'gu', name: 'Gujarati', native: 'ગુજરાતી', scripts: ['Gujarati'], model: 'guj' },
  { code: 'mr', name: 'Marathi', native: 'मराठी', scripts: ['Devanagari'], model: 'mar' },
  { code: 'pa', name: 'Punjabi', native: 'ਪੰਜਾਬੀ', scripts: ['Gurmukhi'], model: 'pan' },
  { code: 'or', name: 'Odia', native: 'ଓଡ଼ିଆ', scripts: ['Oriya'], model: 'ori' },
  { code: 'ta', name: 'Tamil', native: 'தமிழ்', scripts: ['Tamil'], model: 'tam' },
  { code: 'te', name: 'Telugu', native: 'తెలుగు', scripts: ['Telugu'], model: 'tel' },
  { code: 'kn', name: 'Kannada', native: 'ಕನ್ನಡ', scripts: ['Kannada'], model: 'kan' },
  { code: 'ml', name: 'Malayalam', native: 'മലയാളം', scripts: ['Malayalam'], model: 'mal' },
  { code: 'ur', name: 'Urdu', native: 'اردو', scripts: ['Arabic'], model: 'urd', rtl: true },
  { code: 'sa', name: 'Sanskrit', native: 'संस्कृतम्', scripts: ['Devanagari'], model: 'san' },
  { code: 'ks', name: 'Kashmiri', native: 'کٲشُر', scripts: ['Arabic', 'Devanagari'], model: 'urd', rtl: true, note: 'No Kashmiri OCR model exists; scans are read with the Urdu model (same script), so Kashmiri-only letters may need checking.' },
  { code: 'sd', name: 'Sindhi', native: 'سنڌي', scripts: ['Arabic', 'Devanagari'], model: 'snd', rtl: true },
  { code: 'kok', name: 'Konkani', native: 'कोंकणी', scripts: ['Devanagari'], model: 'mar', note: 'No Konkani OCR model exists; scans are read with the Marathi model (same script).' },
  { code: 'mni', name: 'Manipuri (Meitei)', native: 'ꯃꯩꯇꯩꯂꯣꯟ', scripts: ['MeeteiMayek', 'Bengali'], model: null, note: 'No OCR model exists for Meitei Mayek. Digital PDFs and Word files keep the text exactly; scanned Meitei Mayek pages cannot be read (Manipuri in Bengali script is read with the Bengali model).' },
  { code: 'brx', name: 'Bodo', native: 'बड़ो', scripts: ['Devanagari'], model: 'hin', note: 'No Bodo OCR model exists; scans are read with the Hindi model (same script).' },
  { code: 'doi', name: 'Dogri', native: 'डोगरी', scripts: ['Devanagari'], model: 'hin', note: 'No Dogri OCR model exists; scans are read with the Hindi model (same script).' },
  { code: 'sat', name: 'Santali', native: 'ᱥᱟᱱᱛᱟᱲᱤ', scripts: ['OlChiki'], model: null, note: 'No OCR model exists for Ol Chiki. Digital PDFs and Word files keep the text exactly; scanned Ol Chiki pages cannot be read.' },
  { code: 'mai', name: 'Maithili', native: 'मैथिली', scripts: ['Devanagari'], model: 'hin', note: 'No Maithili OCR model exists; scans are read with the Hindi model (same script).' },
  { code: 'ne', name: 'Nepali', native: 'नेपाली', scripts: ['Devanagari'], model: 'nep' },
];

export const languageByCode = new Map(LANGUAGES.map((l) => [l.code, l]));

/** Unicode blocks of each script. */
const RANGES: [Script, number, number][] = [
  ['Devanagari', 0x0900, 0x097f],
  ['Devanagari', 0xa8e0, 0xa8ff],
  ['Bengali', 0x0980, 0x09ff],
  ['Gurmukhi', 0x0a00, 0x0a7f],
  ['Gujarati', 0x0a80, 0x0aff],
  ['Oriya', 0x0b00, 0x0b7f],
  ['Tamil', 0x0b80, 0x0bff],
  ['Telugu', 0x0c00, 0x0c7f],
  ['Kannada', 0x0c80, 0x0cff],
  ['Malayalam', 0x0d00, 0x0d7f],
  ['Arabic', 0x0600, 0x06ff],
  ['Arabic', 0x0750, 0x077f],
  ['Arabic', 0xfb50, 0xfdff],
  ['Arabic', 0xfe70, 0xfeff],
  ['MeeteiMayek', 0xabc0, 0xabff],
  ['MeeteiMayek', 0xaae0, 0xaaff],
  ['OlChiki', 0x1c50, 0x1c7f],
  ['Latin', 0x0041, 0x005a],
  ['Latin', 0x0061, 0x007a],
  ['Latin', 0x00c0, 0x024f],
];

export function scriptOf(cp: number): Script | null {
  for (const [s, a, b] of RANGES) if (cp >= a && cp <= b) return s;
  return null;
}

/** How many letters of each script a text holds (digits, spaces and punctuation are not counted). */
export function scriptCounts(text: string): Partial<Record<Script, number>> {
  const out: Partial<Record<Script, number>> = {};
  for (const ch of text) {
    const s = scriptOf(ch.codePointAt(0)!);
    if (s) out[s] = (out[s] ?? 0) + 1;
  }
  return out;
}

/** Scripts making up at least `min` of the letters, most used first. */
export function mainScripts(text: string, min = 0.05): Script[] {
  const c = scriptCounts(text);
  const total = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
  if (!total) return [];
  return (Object.entries(c) as [Script, number][])
    .filter(([, n]) => n / total >= min)
    .sort((a, b) => b[1] - a[1])
    .map(([s]) => s);
}

/** Right-to-left text: mostly Arabic-script letters. */
export const isRtl = (text: string) => {
  const c = scriptCounts(text);
  const arabic = c.Arabic ?? 0;
  const total = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
  return total > 0 && arabic / total > 0.5;
};

/** The OCR model normally used for a script found by Tesseract's script detection or in text. */
export const SCRIPT_MODEL: Record<Script, string | null> = {
  Latin: 'eng',
  Devanagari: 'hin',
  Bengali: 'ben',
  Gurmukhi: 'pan',
  Gujarati: 'guj',
  Oriya: 'ori',
  Tamil: 'tam',
  Telugu: 'tel',
  Kannada: 'kan',
  Malayalam: 'mal',
  Arabic: 'urd',
  MeeteiMayek: null,
  OlChiki: null,
};

/** Tesseract's script-detection names to ours. */
export const OSD_SCRIPT: Record<string, Script> = {
  Latin: 'Latin',
  Devanagari: 'Devanagari',
  Bengali: 'Bengali',
  Gurmukhi: 'Gurmukhi',
  Gujarati: 'Gujarati',
  Oriya: 'Oriya',
  Tamil: 'Tamil',
  Telugu: 'Telugu',
  Kannada: 'Kannada',
  Malayalam: 'Malayalam',
  Arabic: 'Arabic',
};

/** Models for chosen language codes, always with English for the numbers and words mixed in. */
export function modelsFor(codes: string[]): { models: string[]; unreadable: Language[] } {
  const models = new Set<string>(['eng']);
  const unreadable: Language[] = [];
  for (const c of codes) {
    const l = languageByCode.get(c);
    if (!l) continue;
    if (l.model) models.add(l.model);
    else unreadable.push(l);
  }
  return { models: [...models], unreadable };
}

/** Old non-Unicode Hindi and regional fonts: their text comes out as Latin letters, not Indian script. */
export const LEGACY_FONT = /kruti[\s_-]?dev|devlys|chanakya|shivaji|walkman|akruti|shree[-_ ]?(dev|guj|lipi)|sulekha|aps[-_ ]?dv|sunbeng|bijoy|sutonny|anmollipi|bamini|tscii|nudi|baraha/i;

/**
 * How much of a PDF's Indian-language text is broken: share of Indian-script words with letter
 * sequences Unicode text never has (a vowel sign or virama starting a word, a doubled vowel sign,
 * a virama before a vowel sign). PDFs made by some programs store shaped letters in an order or
 * mapping that does not give the original text back; such pages are better read with OCR.
 */
export function brokenIndicShare(text: string): number {
  // Dependent vowel signs, virama, nukta and candrabindu/anusvara/visarga of the Indic blocks.
  const SIGN = '[\u093A-\u094F\u0955-\u0957\u0962\u0963\u0981-\u0983\u09BC-\u09CD\u09D7\u09E2\u09E3\u0A01-\u0A03\u0A3C-\u0A4D\u0A70\u0A71\u0A81-\u0A83\u0ABC-\u0ACD\u0AE2\u0AE3\u0B01-\u0B03\u0B3C-\u0B4D\u0B55-\u0B57\u0B82\u0BBE-\u0BCD\u0BD7\u0C00-\u0C04\u0C3E-\u0C56\u0C81-\u0C83\u0CBC-\u0CD6\u0D00-\u0D03\u0D3E-\u0D4D\u0D57]';
  const VIRAMA = '[\u094D\u09CD\u0A4D\u0ACD\u0B4D\u0BCD\u0C4D\u0CCD\u0D4D]';
  const VOWEL_SIGN = '[\u093E-\u094C\u09BE-\u09CC\u0A3E-\u0A4C\u0ABE-\u0ACC\u0B3E-\u0B4C\u0BBE-\u0BCC\u0C3E-\u0C4C\u0CBE-\u0CCC\u0D3E-\u0D4C]';
  const startsWithSign = new RegExp(`^${SIGN}`);
  // Two vowel signs in a row never occur in correct text (each letter takes at most one).
  const doubled = new RegExp(`${VOWEL_SIGN}${VOWEL_SIGN}`);
  const viramaThenSign = new RegExp(`${VIRAMA}${VOWEL_SIGN}`);
  const words = text.split(/[\s,.;:()[\]{}"'|/\-]+/).filter((w) => /[ऀ-ൿ]/.test(w));
  if (words.length < 8) return 0;
  const bad = words.filter((w) => startsWithSign.test(w) || doubled.test(w) || viramaThenSign.test(w)).length;
  return bad / words.length;
}

/**
 * How closely two readings of the same Indian-language text agree (0–1): shared pairs of
 * neighbouring letters, counting Indian-script letters only. Used to check a PDF's own text
 * against OCR of the page.
 */
export function indicAgreement(a: string, b: string): number {
  const pairs = (t: string) => {
    const letters = [...t].filter((ch) => /[ऀ-ൿ]/.test(ch));
    const m = new Map<string, number>();
    for (let i = 1; i < letters.length; i++) {
      const k = letters[i - 1] + letters[i];
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return { m, n: Math.max(0, letters.length - 1) };
  };
  const x = pairs(a);
  const y = pairs(b);
  if (!x.n || !y.n) return 1;
  let common = 0;
  for (const [k, v] of x.m) common += Math.min(v, y.m.get(k) ?? 0);
  return (2 * common) / (x.n + y.n);
}
