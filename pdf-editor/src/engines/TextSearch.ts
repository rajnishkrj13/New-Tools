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
