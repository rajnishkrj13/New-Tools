export type SearchMode = 'text' | 'email' | 'phone' | 'ids' | 'regex';

export const SEARCH_MODES: { id: SearchMode; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'email', label: 'Email addresses' },
  { id: 'phone', label: 'Phone numbers' },
  { id: 'ids', label: 'ID and card numbers' },
  { id: 'regex', label: 'Pattern (regular expression)' },
];

export interface SearchSpec {
  mode: SearchMode;
  query: string;
  matchCase: boolean;
}

export interface Match {
  start: number;
  end: number;
}

/** Whether the mode needs something typed in (the ready-made patterns do not). */
export const needsQuery = (mode: SearchMode) => mode === 'text' || mode === 'regex';

/** Start positions of every occurrence of `query` in `text` (no overlaps). */
export function findInText(text: string, query: string, matchCase: boolean): number[] {
  if (!query) return [];
  const hay = matchCase ? text : text.toLowerCase();
  const needle = matchCase ? query : query.toLowerCase();
  // Lower-casing can change the length of unusual characters; then positions would not line up.
  if (hay.length !== text.length || needle.length !== query.length) return findInText(text, query, true);
  const out: number[] = [];
  for (let i = hay.indexOf(needle); i >= 0; i = hay.indexOf(needle, i + needle.length)) out.push(i);
  return out;
}

// ---- ready-made patterns -----------------------------------------------------------------------

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;

/** Something that looks like a phone number: digits with spaces, dashes, dots or brackets, 7 to 15 digits. */
const PHONE_CANDIDATE = /(?<![\w.,/-])\+?\(?\d[\d\s().-]{5,}\d(?![\w-])/g;
const DATE_LIKE = /^\d{1,4}[-/. ]\d{1,2}[-/. ]\d{1,4}$/;

function phoneMatches(text: string): Match[] {
  const out: Match[] = [];
  for (const m of text.matchAll(PHONE_CANDIDATE)) {
    const raw = m[0].trimEnd();
    const digits = raw.replace(/\D/g, '');
    // 7 to 15 digits is what telephone numbers have; a date or a plain amount is not one.
    if (digits.length < 7 || digits.length > 15 || DATE_LIKE.test(raw.trim())) continue;
    // Brackets must be balanced, and a number cannot contain two separators in a row.
    if ((raw.match(/\(/g)?.length ?? 0) !== (raw.match(/\)/g)?.length ?? 0) || /[\s.-]{3,}/.test(raw)) continue;
    out.push({ start: m.index!, end: m.index! + raw.length });
  }
  return out;
}

const luhn = (digits: string) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
};

// Verhoeff check digit, used by Aadhaar numbers: it separates real numbers from random 12-digit ones.
const VD = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 2, 3, 4, 0, 6, 7, 8, 9, 5], [2, 3, 4, 0, 1, 7, 8, 9, 5, 6], [3, 4, 0, 1, 2, 8, 9, 5, 6, 7], [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1], [6, 5, 9, 8, 7, 1, 0, 4, 3, 2], [7, 6, 5, 9, 8, 2, 1, 0, 4, 3], [8, 7, 6, 5, 9, 3, 2, 1, 0, 4], [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const VP = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9], [1, 5, 7, 6, 2, 8, 3, 0, 9, 4], [5, 8, 0, 3, 7, 9, 6, 1, 4, 2], [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0], [4, 2, 8, 6, 5, 7, 3, 9, 0, 1], [2, 7, 9, 3, 8, 0, 6, 4, 1, 5], [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];
export const verhoeffValid = (digits: string) => {
  let c = 0;
  [...digits].reverse().forEach((ch, i) => {
    c = VD[c][VP[i % 8][Number(ch)]];
  });
  return c === 0;
};

function idMatches(text: string): Match[] {
  const out: Match[] = [];
  const add = (m: RegExpMatchArray) => out.push({ start: m.index!, end: m.index! + m[0].length });
  // Permanent Account Number (India): five letters, four digits, one letter.
  for (const m of text.matchAll(/(?<![A-Za-z0-9])[A-Z]{5}\d{4}[A-Z](?![A-Za-z0-9])/g)) add(m);
  // US social security number.
  for (const m of text.matchAll(/(?<!\d)\d{3}-\d{2}-\d{4}(?!\d)/g)) add(m);
  // Aadhaar: 12 digits in groups of four, first digit 2-9, valid check digit.
  for (const m of text.matchAll(/(?<![\d-])[2-9]\d{3}[ -]?\d{4}[ -]?\d{4}(?![\d-])/g)) {
    if (verhoeffValid(m[0].replace(/\D/g, ''))) add(m);
  }
  // Payment cards: 13 to 19 digits that pass the Luhn check.
  for (const m of text.matchAll(/(?<![\d-])\d(?:[ -]?\d){12,18}(?![\d-])/g)) {
    const digits = m[0].replace(/\D/g, '');
    if (luhn(digits) && !out.some((o) => o.start <= m.index! && o.end >= m.index! + m[0].length)) add(m);
  }
  return out.sort((a, b) => a.start - b.start);
}

/** The pattern the user typed, or an error message when it is not a valid pattern. */
export function compilePattern(query: string, matchCase: boolean): { regex: RegExp } | { error: string } {
  try {
    return { regex: new RegExp(query, matchCase ? 'g' : 'gi') };
  } catch (e: any) {
    return { error: String(e?.message ?? 'Not a valid pattern').replace(/^Invalid regular expression: /, '') };
  }
}

export function patternError(spec: SearchSpec): string | null {
  if (spec.mode !== 'regex' || !spec.query) return null;
  const c = compilePattern(spec.query, spec.matchCase);
  return 'error' in c ? c.error : null;
}

/** Every match of the search in one line of text. */
export function findMatches(text: string, spec: SearchSpec): Match[] {
  switch (spec.mode) {
    case 'email':
      return [...text.matchAll(EMAIL)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
    case 'phone':
      return phoneMatches(text);
    case 'ids':
      return idMatches(text);
    case 'regex': {
      if (!spec.query) return [];
      const c = compilePattern(spec.query, spec.matchCase);
      if ('error' in c) return [];
      return [...text.matchAll(c.regex)].filter((m) => m[0].length > 0).map((m) => ({ start: m.index!, end: m.index! + m[0].length }));
    }
    default:
      return findInText(text, spec.query, spec.matchCase).map((start) => ({ start, end: start + spec.query.length }));
  }
}
