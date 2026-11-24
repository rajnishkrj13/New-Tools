/**
 * Checks an extracted table the way an accountant would: do the totals add up, does each running
 * balance follow from the one before, are there repeated headings, duplicate rows, values out of
 * place or cells the reader was unsure of. Nothing is changed to make figures agree; mismatches
 * are only reported.
 */
import { valueOf, ID_HEADING } from './values';
import type { Table } from './types';

export interface Finding {
  level: 'error' | 'warning' | 'ok';
  message: string;
  /** Row and column in the table (0-based), when the finding is about one cell or row. */
  row?: number;
  col?: number;
}

export interface TableStats {
  rows: number;
  dataRows: number;
  cols: number;
  emptyCells: number;
  lowConfidence: number;
}

const TOTAL = /\b(grand\s*)?total\b|\bsub[-\s]?total\b|\btotals\b|कुल|योग|मोट|মোট|সর্বমোট|மொத்தம்|మొత్తం|ಒಟ್ಟು|മൊത്തം|કુલ|ਕੁੱਲ|ମୋଟ|کل|ٹوٹل/i;
const OPENING = /opening|b\/f|brought\s*forward|balance\s*b\/d|ओपनिंग|प्रारंभिक/i;
const heading = (t: Table, c: number) =>
  t.rows
    .slice(0, Math.max(1, t.headerRows))
    .map((r) => r[c]?.text ?? '')
    .join(' ');

/** The number in a cell, signed by Dr/Cr where written (Cr positive, Dr negative), or null. */
function num(text: string, drcr = false): number | null {
  const v = valueOf(text);
  if (v.kind !== 'number') return null;
  if (drcr && /"Dr"/.test(v.format)) return -v.value;
  return v.value;
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.011 + Math.abs(b) * 1e-9;
const fmt = (n: number) => n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function checkTable(t: Table): { findings: Finding[]; stats: TableStats } {
  const findings: Finding[] = [];
  const nc = t.rows[0]?.length ?? 0;
  const data = t.rows.map((r, i) => ({ r, i })).slice(t.headerRows);
  const textAt = (r: number, c: number) => (t.rows[r][c]?.hidden ? '' : (t.rows[r][c]?.text ?? '').trim());

  const stats: TableStats = {
    rows: t.rows.length,
    dataRows: data.length,
    cols: nc,
    emptyCells: data.reduce((n, { r }) => n + r.filter((c) => !c.hidden && !c.text.trim()).length, 0),
    lowConfidence: t.rows.flat().filter((c) => !c.hidden && c.text && (c.conf ?? 100) < 80).length,
  };

  // Heading rows repeated inside the data (a table printed with its heading on every page).
  const head = t.rows.slice(0, t.headerRows).map((r) => r.map((c) => c.text.trim().toLowerCase()).join('|'));
  for (const { r, i } of data) {
    const key = r.map((c) => c.text.trim().toLowerCase()).join('|');
    if (head.includes(key) && key.replace(/\|/g, '')) findings.push({ level: 'warning', row: i, message: `Row ${i + 1} repeats the heading row; delete it if it is a page heading.` });
  }

  // Rows that are exactly the same, which may be a real repeat or a doubled extraction.
  const seen = new Map<string, number>();
  for (const { r, i } of data) {
    const key = r.map((c) => c.text.trim()).join('|');
    if (key.replace(/\|/g, '').length < 3) continue;
    if (seen.has(key)) findings.push({ level: 'warning', row: i, message: `Row ${i + 1} is identical to row ${seen.get(key)! + 1}. Check whether the document really lists it twice.` });
    else seen.set(key, i);
  }

  // Columns of amounts: mostly numbers. Text in them may mean a value slid into the wrong column.
  const isId = Array.from({ length: nc }, (_, c) => ID_HEADING.test(heading(t, c)));
  const repeatsHeading = (r: Table['rows'][number]) => head.includes(r.map((c) => c.text.trim().toLowerCase()).join('|'));
  const numericCol = Array.from({ length: nc }, (_, c) => {
    const vals = data.filter(({ r }) => !repeatsHeading(r)).map(({ i }) => textAt(i, c)).filter(Boolean);
    return !isId[c] && vals.length >= 3 && vals.filter((v) => num(v) !== null).length / vals.length >= 0.6;
  });
  for (const { r, i } of data) {
    if (r.some((c) => TOTAL.test(c.text)) || repeatsHeading(r)) continue;
    for (let c = 0; c < nc; c++) {
      const v = textAt(i, c);
      if (numericCol[c] && v && num(v) === null && !/^[-–—]$/.test(v)) findings.push({ level: 'warning', row: i, col: c, message: `Row ${i + 1}: "${v.slice(0, 40)}" in a column of amounts (${heading(t, c) || `column ${c + 1}`}).` });
    }
  }
  for (let c = 0; c < nc; c++) if (data.length >= 3 && data.every(({ i }) => !textAt(i, c))) findings.push({ level: 'warning', col: c, message: `Column ${c + 1}${heading(t, c) ? ` (${heading(t, c)})` : ''} is empty in every row.` });

  // Totals: each total row against the rows above it (since the previous total, or from the top).
  let from = t.headerRows;
  for (const { r, i } of data) {
    if (!r.some((c) => TOTAL.test(c.text))) continue;
    for (let c = 0; c < nc; c++) {
      if (!numericCol[c]) continue;
      const total = num(textAt(i, c));
      if (total === null) continue;
      const sum = (a: number) =>
        t.rows
          .slice(a, i)
          .map((_, k) => a + k)
          .filter((k) => !t.rows[k].some((x) => TOTAL.test(x.text)) && !t.rows[k].some((x) => OPENING.test(x.text)))
          .reduce((s, k) => s + (num(textAt(k, c)) ?? 0), 0);
      const since = sum(from);
      const all = sum(t.headerRows);
      const name = heading(t, c) || `column ${c + 1}`;
      if (near(since, total) || near(all, total)) findings.push({ level: 'ok', row: i, col: c, message: `Row ${i + 1}: the ${name} total ${fmt(total)} matches the rows above.` });
      else findings.push({ level: 'error', row: i, col: c, message: `Row ${i + 1}: the ${name} total is ${fmt(total)} but the rows above add up to ${fmt(since)}. Check for a missed or misread row.` });
    }
    from = i + 1;
  }

  // Running balance: balance = previous balance − debit + credit (or + debit − credit for ledgers).
  const find = (re: RegExp) => Array.from({ length: nc }, (_, c) => c).find((c) => re.test(heading(t, c)));
  const dr = find(/debit|withdraw|\bdr\b|paid\s*out|payments?|नामे|डेबिट/i);
  const cr = find(/credit|deposit|\bcr\b|paid\s*in|receipts?|जमा|क्रेडिट/i);
  const bal = find(/balance|\bbal\b|शेष|बकाया/i);
  if (dr !== undefined && cr !== undefined && bal !== undefined && dr !== cr && bal !== dr && bal !== cr) {
    const rows = data.filter(({ r }) => !r.some((c) => TOTAL.test(c.text)));
    let prev: number | null = null;
    const mism: Record<1 | -1, number[]> = { 1: [], [-1]: [] };
    let checked = 0;
    for (const { i } of rows) {
      const b = num(textAt(i, bal), true);
      if (b === null) continue;
      if (prev !== null) {
        const d = num(textAt(i, dr)) ?? 0;
        const c = num(textAt(i, cr)) ?? 0;
        checked++;
        if (!near(prev - Math.abs(d) + Math.abs(c), b)) mism[1].push(i);
        if (!near(prev + Math.abs(d) - Math.abs(c), b)) mism[-1].push(i);
      }
      prev = b;
    }
    if (checked >= 2) {
      const dir = mism[1].length <= mism[-1].length ? 1 : -1;
      const bad = mism[dir];
      if (!bad.length) findings.push({ level: 'ok', message: `Every running balance (${checked} rows) follows from the one before.` });
      else if (bad.length <= checked / 2)
        for (const i of bad) findings.push({ level: 'error', row: i, col: bal, message: `Row ${i + 1}: the balance does not follow from the previous balance and this row's amounts. A row may be missing or misread.` });
      else findings.push({ level: 'warning', message: 'The running balances could not be checked: they do not follow a single debit/credit pattern.' });
    }
  }

  if (stats.lowConfidence) findings.push({ level: 'warning', message: `${stats.lowConfidence} cell${stats.lowConfidence === 1 ? ' was' : 's were'} read with low certainty and are marked; check them against the document.` });
  return { findings, stats };
}
