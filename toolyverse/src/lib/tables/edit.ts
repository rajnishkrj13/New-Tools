/**
 * Editing an extracted table before download: change cells, add or remove rows and columns,
 * merge and split cells, split a table in two or put one under another. Merged cells stay
 * consistent through every change. Each function returns a new table and leaves the old one.
 */
import { cell, type Cell, type Table } from './types';

const copy = (t: Table): Table => ({ ...t, rows: t.rows.map((r) => r.map((c) => ({ ...c }))), notes: [...t.notes], rowPages: t.rowPages ? [...t.rowPages] : undefined });

/** Re-marks which cells are covered by merged cells (after any change to spans). */
export function normalize(t: Table): Table {
  const nr = t.rows.length;
  const nc = t.rows[0]?.length ?? 0;
  const covered = Array.from({ length: nr }, () => new Array<boolean>(nc).fill(false));
  for (let r = 0; r < nr; r++)
    for (let c = 0; c < nc; c++) {
      const x = t.rows[r][c];
      if (covered[r][c]) continue;
      x.hidden = false;
      x.rowSpan = Math.max(1, Math.min(x.rowSpan, nr - r));
      x.colSpan = Math.max(1, Math.min(x.colSpan, nc - c));
      for (let i = r; i < r + x.rowSpan; i++) for (let j = c; j < c + x.colSpan; j++) if (i !== r || j !== c) covered[i][j] = true;
    }
  for (let r = 0; r < nr; r++)
    for (let c = 0; c < nc; c++)
      if (covered[r][c]) {
        const x = t.rows[r][c];
        x.hidden = true;
        x.text = '';
        x.rowSpan = 1;
        x.colSpan = 1;
      }
  t.headerRows = Math.min(t.headerRows, nr);
  return t;
}

/** The visible cell whose area includes (r, c). */
export function anchorOf(t: Table, r: number, c: number): { r: number; c: number } {
  for (let i = r; i >= 0; i--)
    for (let j = c; j >= 0; j--) {
      const x = t.rows[i][j];
      if (!x.hidden && i + x.rowSpan > r && j + x.colSpan > c) return { r: i, c: j };
    }
  return { r, c };
}

export function setText(t: Table, r: number, c: number, text: string): Table {
  const n = copy(t);
  const a = anchorOf(n, r, c);
  n.rows[a.r][a.c].text = text;
  n.rows[a.r][a.c].conf = 100;
  return n;
}

export function insertRow(t: Table, at: number): Table {
  const n = copy(t);
  const nc = n.rows[0]?.length ?? 0;
  // Merged cells reaching across the new row grow to cover it.
  for (let r = 0; r < at; r++) for (const x of n.rows[r]) if (!x.hidden && r + x.rowSpan > at) x.rowSpan++;
  n.rows.splice(at, 0, Array.from({ length: nc }, () => cell('')));
  n.rowPages?.splice(at, 0, n.rowPages[Math.max(0, at - 1)] ?? n.pages[0]);
  if (at < n.headerRows) n.headerRows++;
  return normalize(n);
}

export function deleteRow(t: Table, at: number): Table {
  if (t.rows.length <= 1) return t;
  const n = copy(t);
  for (let r = 0; r < at; r++) for (const x of n.rows[r]) if (!x.hidden && r + x.rowSpan > at) x.rowSpan--;
  // A merged cell starting on the removed row moves down one row with its text.
  n.rows[at].forEach((x, c) => {
    if (!x.hidden && x.rowSpan > 1) n.rows[at + 1][c] = { ...x, rowSpan: x.rowSpan - 1, hidden: false };
  });
  n.rows.splice(at, 1);
  n.rowPages?.splice(at, 1);
  if (at < n.headerRows) n.headerRows--;
  return normalize(n);
}

export function insertCol(t: Table, at: number): Table {
  const n = copy(t);
  for (const row of n.rows) {
    for (let c = 0; c < at; c++) if (!row[c].hidden && c + row[c].colSpan > at) row[c].colSpan++;
    row.splice(at, 0, cell(''));
  }
  if (n.colX) n.colX = undefined;
  return normalize(n);
}

export function deleteCol(t: Table, at: number): Table {
  if ((t.rows[0]?.length ?? 0) <= 1) return t;
  const n = copy(t);
  for (const row of n.rows) {
    for (let c = 0; c < at; c++) if (!row[c].hidden && c + row[c].colSpan > at) row[c].colSpan--;
    const x = row[at];
    if (!x.hidden && x.colSpan > 1) row[at + 1] = { ...x, colSpan: x.colSpan - 1, hidden: false };
    row.splice(at, 1);
  }
  if (n.colX) n.colX = undefined;
  return normalize(n);
}

/** Merges the rectangle of cells into one, joining their texts. Refuses to cut through another merge. */
export function merge(t: Table, r0: number, c0: number, r1: number, c1: number): Table | string {
  const [ra, rb] = [Math.min(r0, r1), Math.max(r0, r1)];
  const [ca, cb] = [Math.min(c0, c1), Math.max(c0, c1)];
  if (ra === rb && ca === cb) return 'Choose two or more cells to merge (Shift+click the last cell).';
  for (let r = ra; r <= rb; r++)
    for (let c = ca; c <= cb; c++) {
      const a = anchorOf(t, r, c);
      const x = t.rows[a.r][a.c];
      if (a.r < ra || a.c < ca || a.r + x.rowSpan - 1 > rb || a.c + x.colSpan - 1 > cb) return 'The selection cuts through a merged cell; select the whole merged cell or split it first.';
    }
  const n = copy(t);
  const texts: string[] = [];
  for (let r = ra; r <= rb; r++) for (let c = ca; c <= cb; c++) if (!n.rows[r][c].hidden && n.rows[r][c].text.trim()) texts.push(n.rows[r][c].text);
  const first = n.rows[ra][ca];
  n.rows[ra][ca] = { ...first, text: texts.join('\n'), rowSpan: rb - ra + 1, colSpan: cb - ca + 1, hidden: false };
  return normalize(n);
}

export function split(t: Table, r: number, c: number): Table {
  const n = copy(t);
  const a = anchorOf(n, r, c);
  const x = n.rows[a.r][a.c];
  x.rowSpan = 1;
  x.colSpan = 1;
  return normalize(n);
}

/** Splits a table before row `at`: the rows from there on become a new table. */
export function splitTable(t: Table, at: number, id: string): [Table, Table] {
  const a = copy(t);
  const b = copy(t);
  a.rows = a.rows.slice(0, at);
  a.rowPages = a.rowPages?.slice(0, at);
  b.rows = b.rows.slice(at);
  b.rowPages = b.rowPages?.slice(at);
  b.id = id;
  b.name = `${t.name} (part 2)`;
  b.headerRows = 0;
  // Merged cells cut by the split are shortened.
  for (let r = 0; r < a.rows.length; r++) for (const x of a.rows[r]) if (!x.hidden && r + x.rowSpan > at) x.rowSpan = at - r;
  return [normalize(a), normalize(b)];
}

/**
 * Puts `b` under `a`. With the same number of columns rows line up; otherwise the narrower
 * table gets empty columns on the right. A heading row of `b` equal to `a`'s is left out.
 */
export function combine(a: Table, b: Table): Table {
  const n = copy(a);
  const m = copy(b);
  const width = Math.max(n.rows[0]?.length ?? 0, m.rows[0]?.length ?? 0);
  const pad = (rows: Cell[][]) => rows.forEach((r) => r.push(...Array.from({ length: width - r.length }, () => cell(''))));
  pad(n.rows);
  pad(m.rows);
  const key = (r: Cell[]) => r.map((c) => c.text.trim().toLowerCase()).join('|');
  const sameHead = n.headerRows > 0 && m.headerRows === n.headerRows && n.rows.slice(0, n.headerRows).every((r, i) => key(r) === key(m.rows[i]));
  const body = sameHead ? m.rows.slice(m.headerRows) : m.rows;
  n.rows.push(...body);
  n.rowPages = [...(n.rowPages ?? n.rows.slice(0, n.rows.length - body.length).map(() => n.pages[0])), ...(m.rowPages ?? body.map(() => m.pages[0])).slice(sameHead ? m.headerRows : 0)];
  n.pages = [...new Set([...n.pages, ...m.pages])];
  n.notes.push(`${b.name} was added below.`);
  n.colX = undefined;
  return normalize(n);
}
