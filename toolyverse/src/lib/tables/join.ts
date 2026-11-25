/**
 * Tables that run on over several pages (statements, ledgers, registers): the part at the top of
 * a page continues the table at the bottom of the page before when it has the same columns.
 * Repeated heading rows are dropped from the continuation; rows are never reordered or removed.
 */
import { colCount, type Cell, type Table } from './types';

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
const rowText = (r: Cell[]) => r.map((c) => (c.hidden ? '' : norm(c.text))).join('|');

/** Same column layout: the same count and column edges within 3% of the page width. */
function sameColumns(a: Table, b: Table, pageWidth: number): boolean {
  if (colCount(a) !== colCount(b)) return false;
  if (a.colX && b.colX && a.colX.length === b.colX.length) {
    const close = a.colX.filter((x, i) => Math.abs(x - b.colX![i]) <= pageWidth * 0.03).length;
    if (close / a.colX.length >= 0.75) return true;
  }
  return false;
}

const sameHeader = (a: Table, b: Table) => a.headerRows > 0 && b.headerRows > 0 && a.headerRows === b.headerRows && a.rows.slice(0, a.headerRows).every((r, i) => rowText(r) === rowText(b.rows[i]));

export interface JoinResult {
  tables: Table[];
  /** "Page 2 table 1 continues Page 1 table 2" lines, for the report. */
  joined: string[];
}

/**
 * Joins continuation tables. `pageWidth` is used to compare column positions; with `pageHeight`,
 * a table only continues one that runs down to the lower part of its page (a table that ends
 * half-way down a page, followed by one with the same heading on the next, is a second table).
 */
export function joinAcrossPages(tables: Table[], pageWidth: (page: number) => number, pageHeight?: (page: number) => number): JoinResult {
  const out: Table[] = [];
  const joined: string[] = [];
  // Tables arrive in reading order: by page, then from the top.
  tables.forEach((t, k) => {
    const prev = out[out.length - 1];
    const prevPage = prev?.pages[prev.pages.length - 1];
    const before = tables[k - 1];
    // The continuation is the first table on its page, and the table before it was the last on the page before.
    const runsOn = !pageHeight || !before || (before.box.y1 >= pageHeight(before.pages[0]) * 0.6 && t.box.y0 <= pageHeight(t.pages[0]) * 0.5);
    const fits = prev && before && runsOn && t.pages[0] === prevPage! + 1 && before.pages[0] === prevPage && colCount(prev) === colCount(t) && (sameHeader(prev, t) || sameColumns(prev, t, pageWidth(t.pages[0])));
    if (!fits) {
      out.push(t);
      return;
    }
    const header = sameHeader(prev, t);
    // Without a repeated heading, the first rows of the continuation are data, not headings.
    const body = header ? t.rows.slice(t.headerRows) : t.rows;
    const bodyPages = (t.rowPages ?? t.rows.map(() => t.pages[0])).slice(header ? t.headerRows : 0);
    prev.rows.push(...body);
    prev.rowPages = [...(prev.rowPages ?? prev.rows.map(() => prev.pages[0])).slice(0, prev.rows.length - body.length), ...bodyPages];
    prev.pages.push(t.pages[0]);
    prev.confidence = {
      table: Math.min(prev.confidence.table, t.confidence.table),
      rows: Math.min(prev.confidence.rows, t.confidence.rows),
      cols: Math.min(prev.confidence.cols, t.confidence.cols),
      cells: Math.min(prev.confidence.cells, t.confidence.cells),
    };
    prev.notes.push(`Continues on page ${t.pages[0] + 1}${header ? ' (its repeated heading row was left out)' : ''}.`);
    joined.push(`${t.name} continues ${prev.name}`);
  });
  out.forEach((t, k) => {
    t.id = `t${k + 1}`;
    if (t.pages.length > 1) t.name = `Pages ${t.pages[0] + 1}-${t.pages[t.pages.length - 1] + 1} table`;
  });
  return { tables: out, joined };
}
