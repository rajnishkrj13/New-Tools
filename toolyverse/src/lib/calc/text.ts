/** Text case changes, counts and age arithmetic. */

const SMALL = new Set(['a', 'an', 'the', 'and', 'but', 'or', 'nor', 'for', 'so', 'yet', 'of', 'in', 'on', 'at', 'to', 'by', 'up', 'as', 'via', 'vs', 'per', 'from', 'with', 'into']);

export type CaseMode = 'upper' | 'lower' | 'title' | 'sentence' | 'camel' | 'snake' | 'kebab' | 'toggle';

export function changeCase(text: string, mode: CaseMode): string {
  switch (mode) {
    case 'upper':
      return text.toUpperCase();
    case 'lower':
      return text.toLowerCase();
    case 'toggle':
      return [...text].map((c) => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).join('');
    case 'title':
      return text
        .split('\n')
        .map((line) => {
          let first = true;
          return line.replace(/[\p{L}\p{N}][\p{L}\p{N}'’]*/gu, (w) => {
            const lower = w.toLowerCase();
            const out = !first && SMALL.has(lower) ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
            first = false;
            return out;
          });
        })
        .join('\n');
    case 'sentence':
      return text.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_, gap, c) => gap + c.toUpperCase()).replace(/\bi\b/g, 'I');
    case 'camel': {
      const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
      return words.map((w, i) => (i ? w.charAt(0).toUpperCase() + w.slice(1) : w)).join('');
    }
    case 'snake':
      return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join('_');
    case 'kebab':
      return (text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).join('-');
  }
}

export function countText(text: string) {
  const graphemes =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(text)].length : [...text].length;
  const words = text.match(/[\p{L}\p{N}\p{M}][\p{L}\p{N}\p{M}'’.-]*/gu)?.length ?? 0;
  const sentences = text.split(/[.!?।]+(?:\s|$)/u).filter((s) => /[\p{L}\p{N}]/u.test(s)).length;
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim()).length;
  const noSpaces = text.replace(/\s/g, '');
  const noSpaceCount =
    typeof Intl !== 'undefined' && 'Segmenter' in Intl ? [...new Intl.Segmenter(undefined, { granularity: 'grapheme' }).segment(noSpaces)].length : [...noSpaces].length;
  return { characters: graphemes, charactersNoSpaces: noSpaceCount, words, sentences, paragraphs, readingMinutes: words / 220, speakingMinutes: words / 140 };
}

/** Calendar difference between two dates (b on or after a). */
export function dateDiff(a: Date, b: Date) {
  const utc = (d: Date) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  // Whole calendar months first; a later day of month than b's does not complete the month.
  let total = (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth());
  if (b.getDate() < a.getDate()) total -= 1;
  // The anchor is a + total months, kept inside the month (31 Jan + 1 month = 28/29 Feb).
  const y = a.getFullYear() + Math.floor((a.getMonth() + total) / 12);
  const m = (a.getMonth() + total) % 12;
  const anchor = new Date(y, m, Math.min(a.getDate(), new Date(y, m + 1, 0).getDate()));
  const days = Math.round((utc(b) - utc(anchor)) / 864e5);
  const totalDays = Math.round((utc(b) - utc(a)) / 864e5);
  return { years: Math.floor(total / 12), months: total % 12, days, totalDays, totalWeeks: Math.floor(totalDays / 7), totalMonths: total };
}

export function nextBirthday(birth: Date, from: Date) {
  let next = new Date(from.getFullYear(), birth.getMonth(), birth.getDate());
  // 29 February in a non-leap year is celebrated on 1 March by this rule.
  if (next < new Date(from.getFullYear(), from.getMonth(), from.getDate())) next = new Date(from.getFullYear() + 1, birth.getMonth(), birth.getDate());
  const days = Math.round((Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - Date.UTC(from.getFullYear(), from.getMonth(), from.getDate())) / 864e5);
  return { date: next, days, weekday: next.toLocaleDateString('en-IN', { weekday: 'long' }) };
}
