/**
 * Turns positioned pieces of text from a PDF page into Word paragraphs: lines are rebuilt from
 * baselines, lines become flowing paragraphs when they read as one, columns of a table become
 * tab stops (or real Word tables when the table engine found them), pages set in two columns
 * become Word columns, and alignment, indents and spacing are measured from the page. Pure
 * functions, no browser APIs, so the rules are unit-tested.
 *
 * Units are PDF points (1/72 inch); y grows downwards from the top of the page.
 */
import { isRtl } from '../../lang';
import type { Box, Segment, Table } from '../../tables/types';

/**
 * Lines drawn on the page that belong to the text. A thin line just under a piece of text is its
 * underline. A longer line on a line of text (a blank to fill in: "Name ______") becomes
 * underscores in its place, which is how Word documents write such blanks. Lines inside
 * tables (`skip`), and lines with no text beside them (rules, frames), are left alone.
 */
export function markLines(page: PageIn, segments: Segment[], skip: Box[], blanks = true): void {
  const hs = segments.filter((s) => Math.abs(s.y1 - s.y0) < 1.2 && Math.abs(s.x1 - s.x0) > 2);
  const used = new Set<Segment>();
  // Lines inside tables are not blanks to fill in.
  const inside = (h: Segment) => skip.some((b) => Math.min(h.x0, h.x1) >= b.x0 - 2 && Math.max(h.x0, h.x1) <= b.x1 + 2 && h.y0 >= b.y0 - 2 && h.y0 <= b.y1 + 2);
  // An underline: a line just under the baseline that the visible text above it covers (one
  // piece of text or several, as in an underlined title). Space-only pieces do not count.
  const visible = page.spans.filter((s) => s.str.trim());
  // A grid line meets the table's vertical lines at its ends; an underline floats under its text.
  const vs = segments.filter((v) => Math.abs(v.x1 - v.x0) < 1.2 && Math.abs(v.y1 - v.y0) > 2);
  const grid = (h: Segment) => {
    const a0 = Math.min(h.x0, h.x1);
    const b0 = Math.max(h.x0, h.x1);
    return vs.some((v) => (Math.abs(v.x0 - a0) < 2 || Math.abs(v.x0 - b0) < 2) && h.y0 >= Math.min(v.y0, v.y1) - 1.5 && h.y0 <= Math.max(v.y0, v.y1) + 1.5);
  };
  for (const h of hs) {
    if (grid(h)) continue;
    const a = Math.min(h.x0, h.x1);
    const b = Math.max(h.x0, h.x1);
    const above = visible.filter((s) => h.y0 >= s.y - 0.5 && h.y0 <= s.y + s.size * 0.35 && s.x < b && s.x + s.w > a);
    if (!above.length) continue;
    const covered = above.reduce((n, s) => n + Math.min(b, s.x + s.w) - Math.max(a, s.x), 0);
    const size = Math.max(...above.map((s) => s.size));
    if (covered < (b - a) * 0.6 || Math.min(...above.map((s) => s.x)) > a + size * 1.5 || Math.max(...above.map((s) => s.x + s.w)) < b - size * 1.5) continue;
    for (const s of above) s.underline = true;
    used.add(h);
  }
  // Lines are often drawn in pieces, or twice: pieces on one level that touch become one.
  const free = hs.filter((h) => !used.has(h) && !inside(h)).map((h) => ({ x0: Math.min(h.x0, h.x1), x1: Math.max(h.x0, h.x1), y: h.y0 })).sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const merged: { x0: number; x1: number; y: number }[] = [];
  for (const h of free) {
    const m = merged.find((o) => Math.abs(o.y - h.y) < 1 && h.x0 <= o.x1 + 1 && h.x1 >= o.x0 - 1);
    if (m) {
      m.x0 = Math.min(m.x0, h.x0);
      m.x1 = Math.max(m.x1, h.x1);
    } else merged.push({ ...h });
  }
  if (!blanks) return;
  const text = page.spans.filter((s) => s.str.trim());
  for (const h of merged) {
    const len = h.x1 - h.x0;
    if (len < 12 || len > page.width * 0.85) continue;
    // Text on the same line: its baseline just above the line.
    const beside = text.filter((s) => h.y - s.y > -1 && h.y - s.y < s.size * 0.6);
    if (!beside.length) continue;
    // Not under text (that would be an underline the size test above missed).
    if (beside.some((s) => s.x < h.x1 - 2 && s.x + s.w > h.x0 + 2)) continue;
    const ref = beside.sort((a, b) => Math.abs(a.x - h.x0) - Math.abs(b.x - h.x0))[0];
    const n = Math.max(3, Math.round(len / (ref.size * 0.556)));
    page.spans.push({ str: '_'.repeat(n), x: h.x0, y: ref.y, w: len, size: ref.size, font: ref.font, bold: false, italic: false });
  }
}

export interface Span {
  str: string;
  /** Left edge of the text. */
  x: number;
  /** Baseline. */
  y: number;
  /** Advance width. */
  w: number;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  /** Text colour as RRGGBB, when not black. */
  color?: string;
  /** Link target of the text (from the PDF's link annotations). */
  link?: string;
  underline?: boolean;
  /** Read by OCR with low certainty: marked in Word for checking. */
  low?: boolean;
}

export interface PageImage {
  x: number;
  y: number;
  w: number;
  h: number;
  bytes: Uint8Array;
  type: 'png' | 'jpeg';
  /** The page's lines and boxes drawn as one picture, not a picture from the PDF. */
  graphics?: boolean;
}

export interface PageIn {
  width: number;
  height: number;
  spans: Span[];
  images: PageImage[];
}

export interface Run {
  text: string;
  size: number;
  font: string;
  bold: boolean;
  italic: boolean;
  color?: string;
  link?: string;
  underline?: boolean;
  low?: boolean;
  /** A tab character instead of text (columns of a table). */
  tab?: boolean;
}

export interface Tab {
  /** From the left margin. */
  pos: number;
  align: 'left' | 'right';
}

/** A table found by the table engine, written as a real Word table. */
export interface TableItem {
  table: Table;
  /** Column widths and row heights in points. */
  widths: number[];
  heights: number[];
  /** Drawn grid lines in the PDF: the Word table gets borders too. */
  ruled: boolean;
  size: number;
  font: string;
  /** Indent of the table from the left margin. */
  left: number;
  /** Tables standing beside this one in the PDF (same height on the page), left to right. */
  beside?: TableItem[];
  /** Styled text of each cell, when it could be taken from the page (else its plain text). */
  cells?: (CellStyle | null)[][];
  /** Space between the cell edge and its text, left and right, in points. */
  pad?: number;
}

export interface CellStyle {
  lines: Run[][];
  align: 'left' | 'center' | 'right';
  vAlign: 'top' | 'center' | 'bottom';
  /** Distance of the text from the cell's left edge (right edge for right-aligned text), when large. */
  indent: number;
}

export interface Para {
  runs: Run[];
  align: 'left' | 'center' | 'right' | 'both';
  /** Indents from the margins; `first` is the first line's extra indent (negative = hanging). */
  left: number;
  right: number;
  first: number;
  /** Space above the paragraph and the exact height of each line. */
  before: number;
  line: number;
  /** Distance between the lines of the paragraph in the PDF (0 when it has one line). */
  pitch?: number;
  tabs?: Tab[];
  /** 1–3 for headings, which Word lists in its navigation pane. */
  heading?: 1 | 2 | 3;
  /** Biggest text size in the paragraph, for choosing headings. */
  size: number;
  /** A bulleted list item (the bullet character itself was removed; Word draws it). */
  bullet?: boolean;
  /** Right-to-left paragraph (Urdu, Sindhi, Kashmiri…). */
  rtl?: boolean;
  /** Starts the second column of a two-column page. */
  colBreak?: boolean;
  /** This item is a table, not a paragraph. */
  table?: TableItem;
}

export interface PageOut {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  paras: Para[];
  images: PageImage[];
  /** Line heights exact (layout) or at least (editable text). */
  exact: boolean;
  /** Two-column part: from paragraph `start`, with these column widths and gap. */
  columns?: { start: number; widths: [number, number]; space: number };
  /** A frame drawn round the page: distances from the page edges, line width and colour. */
  border?: { top: number; left: number; bottom: number; right: number; width: number; color: string };
  /** Distance of the header from the top edge and of the footer from the bottom edge. */
  headerAt?: number;
  footerAt?: number;
}

export interface LayoutOptions {
  tables?: Table[];
  /** Flowing, easily edited text instead of exact line positions. */
  editable?: boolean;
  /** The page's frame (a page border), when it has one. */
  frame?: { x0: number; y0: number; x1: number; y1: number };
}

interface Seg {
  x: number;
  right: number;
  runs: Run[];
}

interface Line {
  y: number;
  x: number;
  right: number;
  size: number;
  segs: Seg[];
  rtl: boolean;
}

const BULLET = /^\s*([•●▪◦○■□►‣➢✓✔–—\-*]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|\(?[ivxIVX]{1,4}[.)])\s/;
const BULLET_CHAR = /^\s*([•●▪◦○■□►‣➢✓✔])\s+/;
const NUMERIC = /^[\s(₹$€£+\-]*[\d.,]+[\s)%]*(Cr|Dr|CR|DR)?\.?$/;

const sameStyle = (a: Run, b: Run) =>
  !a.tab && !b.tab && a.font === b.font && a.bold === b.bold && a.italic === b.italic && a.color === b.color && a.link === b.link && !!a.underline === !!b.underline && !!a.low === !!b.low && Math.abs(a.size - b.size) < 0.3;

function pushRun(runs: Run[], r: Run) {
  const last = runs[runs.length - 1];
  if (last && sameStyle(last, r)) last.text += r.text;
  else runs.push({ ...r });
}

const runText = (runs: Run[]) => runs.map((r) => (r.tab ? '\t' : r.text)).join('');
const runOf = (s: Span, text = s.str): Run => ({ text, size: s.size, font: s.font, bold: s.bold, italic: s.italic, color: s.color, link: s.link, underline: s.underline, low: s.low });

/**
 * Rebuilds lines: pieces sharing a baseline, in reading order (left to right, or right to left
 * for Arabic-script lines), split into segments at wide gaps.
 */
export function buildLines(spans: Span[]): Line[] {
  // pdf.js fills gaps with space-only pieces as wide as the gap; spaces are rebuilt from the real gaps.
  const items = spans.filter((s) => s.str.trim().length > 0 && s.size > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  // ...but a space piece between two words is a space, however tight the line is set.
  const blanks = spans.filter((s) => !s.str.trim() && s.str.length > 0);
  const spaceBetween = (a: Span, b: Span) => blanks.some((sp) => Math.abs(sp.y - a.y) < a.size * 0.35 && sp.x >= Math.min(a.x + a.w, b.x) - 1.5 && sp.x <= Math.max(a.x + a.w, b.x) + 0.5);
  const groups: Span[][] = [];
  for (const s of items) {
    const g = groups[groups.length - 1];
    // Same line if the baselines are within a third of the text size (allows sub/superscripts).
    if (g && Math.abs(s.y - g[0].y) < Math.min(s.size, g[0].size) * 0.35) g.push(s);
    else groups.push([s]);
  }

  const lines: Line[] = [];
  for (const g of groups) {
    const rtl = isRtl(g.map((s) => s.str).join(' '));
    g.sort((a, b) => (rtl ? b.x - a.x : a.x - b.x));
    const segs: Seg[] = [];
    let seg: Seg | null = null;
    let prev: Span | null = null;
    for (const s of g) {
      const gap = prev ? (rtl ? prev.x - (s.x + s.w) : s.x - (prev.x + prev.w)) : 0;
      const em = Math.max(s.size, prev?.size ?? 0);
      if (!seg || (gap > em * 1.5 && gap > 9 && prev!.str.trim() && s.str.trim())) {
        seg = { x: s.x, right: s.x + s.w, runs: [] };
        segs.push(seg);
      } else if (gap > em * 0.18 || (prev && !rtl && spaceBetween(prev, s))) {
        const text = runText(seg.runs);
        if (!/\s$/.test(text) && !/^\s/.test(s.str)) pushRun(seg.runs, { ...runOf(s, ' '), link: s.link === prev?.link ? s.link : undefined, underline: s.underline && prev?.underline });
      }
      pushRun(seg.runs, runOf(s));
      seg.x = Math.min(seg.x, s.x);
      seg.right = Math.max(seg.right, s.x + s.w);
      prev = s;
    }
    for (const sg of segs) {
      // Trim the outer spaces of each segment; drop segments that are only spaces.
      const first = sg.runs[0];
      const last = sg.runs[sg.runs.length - 1];
      first.text = first.text.replace(/^\s+/, '');
      last.text = last.text.replace(/\s+$/, '');
      sg.runs = sg.runs.filter((r) => r.text);
    }
    const kept = segs.filter((sg) => sg.runs.length);
    if (!kept.length) continue;
    // Segments in page order (left to right) for tab stops, whatever the reading direction.
    if (rtl) kept.reverse();
    lines.push({
      y: g.reduce((n, s) => n + s.y * s.str.length, 0) / g.reduce((n, s) => n + s.str.length, 0),
      x: Math.min(...kept.map((k) => k.x)),
      right: Math.max(...kept.map((k) => k.right)),
      size: Math.max(...g.filter((s) => s.str.trim()).map((s) => s.size), g[0].size),
      segs: kept,
      rtl,
    });
  }
  return lines;
}

interface Block {
  lines: Line[];
  tabbed: boolean;
}

/** The text size used for most characters, which decides what counts as a heading. */
export function bodySize(pages: PageIn[]): number {
  const count = new Map<number, number>();
  for (const p of pages) for (const s of p.spans) count.set(Math.round(s.size * 2) / 2, (count.get(Math.round(s.size * 2) / 2) ?? 0) + s.str.length);
  let best = 11;
  let n = 0;
  for (const [size, c] of count) if (c > n) [best, n] = [size, c];
  return best;
}

const MIN_MARGIN = 14;

/**
 * A page set in two columns: a vertical strip of white space in the middle third that most
 * lines on both sides respect. Returns the strip, or null.
 */
export function findGutter(spans: Span[], width: number): { x0: number; x1: number; below: number } | null {
  const lines = buildLines(spans);
  if (lines.length < 12) return null;
  const lo = Math.floor(width * 0.3);
  const hi = Math.ceil(width * 0.7);
  const cover = new Int32Array(hi - lo);
  for (const s of spans) if (s.str.trim()) for (let x = Math.max(lo, Math.floor(s.x)); x < Math.min(hi, Math.ceil(s.x + s.w)); x++) cover[x - lo]++;
  // The widest empty strip, at least 8 points.
  let best: [number, number] | null = null;
  let start = -1;
  for (let i = 0; i <= cover.length; i++) {
    const empty = i < cover.length && cover[i] === 0;
    if (empty && start < 0) start = i;
    if (!empty && start >= 0) {
      if (i - start >= 8 && (!best || i - start > best[1] - best[0])) best = [start, i];
      start = -1;
    }
  }
  if (!best) {
    // Titles across the full width at the top cross the gutter: try again below them.
    return null;
  }
  const x0 = lo + best[0];
  const x1 = lo + best[1];
  const left = lines.filter((l) => l.right <= x0 + 1).length;
  const right = lines.filter((l) => l.x >= x1 - 1).length;
  if (left < 6 || right < 6) return null;
  return { x0, x1, below: 0 };
}

/** Lays out one page. `body` is the document's usual text size. */
export function layoutPage(page: PageIn, body = 11, opts: LayoutOptions = {}): PageOut {
  const tables = (opts.tables ?? []).filter((t) => t.rows.length);
  const inTable = (s: Span) => tables.some((t) => s.x + s.w / 2 >= t.box.x0 - 1 && s.x + s.w / 2 <= t.box.x1 + 1 && s.y - s.size * 0.3 >= t.box.y0 - 1 && s.y - s.size * 0.3 <= t.box.y1 + 1);
  const spans = tables.length ? page.spans.filter((s) => !inTable(s)) : page.spans;
  const lines = buildLines(spans);
  const imgTop = page.images.length ? Math.min(...page.images.map((i) => i.y)) : Infinity;
  const tableTop = tables.length ? Math.min(...tables.map((t) => t.box.y0)) : Infinity;

  const xs = [...lines.map((l) => l.x), ...tables.map((t) => t.box.x0)];
  const rs = [...lines.map((l) => l.right), ...tables.map((t) => t.box.x1)];
  const textLeft = xs.length ? Math.min(...xs) : 72;
  const textRight = rs.length ? Math.max(...rs) : page.width - 72;
  const left = Math.max(MIN_MARGIN, Math.min(textLeft, page.width / 3));
  // Word sets the same words a little wider than most PDFs (other font versions, no kerning):
  // with no room past the PDF's last character, lines would wrap a word early and paragraphs
  // grow. About 2% of the text width more keeps the PDF's line breaks.
  const slack = Math.max(2, (textRight - textLeft) * 0.02);
  // Inside a page border, the text stays a little inside it.
  const borderRight = opts.frame ? page.width - opts.frame.x1 + 4 : 0;
  const right = Math.max(MIN_MARGIN * 0.5, borderRight, Math.min(page.width - textRight - slack, page.width / 3));
  // Layout decisions (justified, right-aligned, full lines) go by where the PDF's text ends.
  const pdfR = Math.min(page.width - right, Math.max(textRight, left + 1));
  const firstTop = Math.min(lines.length ? lines[0].y - lines[0].size * 1.05 : Infinity, tableTop, imgTop === Infinity && !lines.length && !tables.length ? 72 : Infinity);
  const top = Math.max(MIN_MARGIN, Math.min(firstTop, 72));
  const margin = { top, right, bottom: MIN_MARGIN, left };

  // Two columns: lines entirely left of the gutter, entirely right of it, and full-width ones (titles).
  const gutter = !tables.length ? findGutter(spans, page.width) : null;
  const flows: { lines: Line[]; colL: number; colR: number }[] = [];
  let columns: PageOut['columns'];
  let full: Line[] = lines;
  if (gutter) {
    const leftL = lines.filter((l) => l.right <= gutter.x0 + 1);
    const rightL = lines.filter((l) => l.x >= gutter.x1 - 1);
    const firstCol = Math.min(...[...leftL, ...rightL].map((l) => l.y));
    full = lines.filter((l) => !leftL.includes(l) && !rightL.includes(l));
    // Full-width lines below the columns start belong to them after all (rare); keep them in the left flow.
    const late = full.filter((l) => l.y > firstCol);
    full = full.filter((l) => l.y <= firstCol);
    leftL.push(...late);
    leftL.sort((a, b) => a.y - b.y);
    flows.push({ lines: full, colL: left, colR: pdfR });
    flows.push({ lines: leftL, colL: left, colR: gutter.x0 });
    flows.push({ lines: rightL, colL: gutter.x1, colR: pdfR });
  } else flows.push({ lines, colL: left, colR: pdfR });

  const editable = !!opts.editable;
  const head = layoutFlow(flows[0].lines, flows[0].colL, flows[0].colR, tables, top, body, editable, page);
  const paras: Para[] = [...head.paras];
  if (gutter) {
    // Both columns start where the full-width part (titles) ended.
    columns = { start: paras.length, widths: [gutter.x0 - left, page.width - right - gutter.x1], space: gutter.x1 - gutter.x0 };
    const l = layoutFlow(flows[1].lines, flows[1].colL, flows[1].colR, [], head.cursor, body, editable, page);
    const r = layoutFlow(flows[2].lines, flows[2].colL, flows[2].colR, [], head.cursor, body, editable, page);
    if (r.paras.length) r.paras[0].colBreak = true;
    paras.push(...l.paras, ...r.paras);
  }

  // Right-aligned lines keep the PDF's right edge, inside Word's slightly wider margin (centred ones keep the room).
  const extra = page.width - right - pdfR;
  if (extra > 0) for (const p of paras) if (!p.table && p.align === 'right') p.right += extra;
  const f = opts.frame;
  const border = f ? { top: f.y0, left: f.x0, bottom: page.height - f.y1, right: page.width - f.x1, width: 0.75, color: '000000' } : undefined;
  return { width: page.width, height: page.height, margin, paras, images: page.images, exact: !editable, columns: columns && paras.length > columns.start ? columns : undefined, border };
}

/** Paragraphs (and tables) of one flow of lines between two edges. */
function layoutFlow(lines: Line[], colL: number, colR: number, tables: Table[], start: number, body: number, editable: boolean, page: PageIn): { paras: Para[]; cursor: number } {
  const colW = colR - colL;
  // Lines into blocks (future paragraphs).
  const blocks: Block[] = [];
  for (const line of lines) {
    const tabbed = line.segs.length > 1;
    const cur = blocks[blocks.length - 1];
    const tableBetween = cur && tables.some((t) => t.box.y0 > cur.lines[cur.lines.length - 1].y && t.box.y0 < line.y);
    if (cur && !tabbed && !cur.tabbed && !tableBetween && cur.lines[0].rtl === line.rtl && continues(cur.lines, line, colL, colR)) cur.lines.push(line);
    else blocks.push({ lines: [line], tabbed });
  }

  // Paragraphs and tables in reading order, by where they start on the page.
  type Item = { y: number; block?: Block; table?: Table; beside?: Table[]; image?: PageImage };
  // Tables side by side (overlapping in height) stay side by side: they go out as one item.
  const groups: Table[][] = [];
  for (const t of [...tables].sort((a, b) => a.box.y0 - b.box.y0)) {
    const g = groups.find((gr) => gr.some((o) => Math.min(o.box.y1, t.box.y1) - Math.max(o.box.y0, t.box.y0) > 0.4 * Math.min(o.box.y1 - o.box.y0, t.box.y1 - t.box.y0) && (t.box.x0 >= o.box.x1 - 2 || t.box.x1 <= o.box.x0 + 2)));
    if (g) g.push(t);
    else groups.push([t]);
  }
  const tableItems: Item[] = groups.map((g) => {
    const byX = [...g].sort((a, b) => a.box.x0 - b.box.x0);
    return { y: Math.min(...g.map((t) => t.box.y0)), table: byX[0], beside: byX.slice(1) };
  });
  // Wide pictures in editable text: Word moves the text below them, so the spacing after them counts from their bottom.
  const pictures: Item[] = editable ? page.images.filter((img) => !img.graphics && img.w > colW * 0.5 && img.x < colR && img.x + img.w > colL).map((img) => ({ y: img.y, image: img })) : [];
  const items: Item[] = [...blocks.map((b) => ({ y: b.lines[0].y - b.lines[0].size, block: b })), ...tableItems, ...pictures].sort((a, b) => a.y - b.y);

  const paras: Para[] = [];
  let cursor = start;
  for (const it of items) {
    if (it.image) {
      cursor = Math.max(cursor, it.image.y + it.image.h);
      continue;
    }
    if (it.table) {
      const all = [it.table, ...(it.beside ?? [])];
      const before = Math.max(0, it.y - cursor);
      const item = tableItem(it.table, colL, page);
      if (it.beside?.length) item.beside = it.beside.map((t) => tableItem(t, colL, page));
      paras.push({ runs: [], align: 'left', left: 0, right: 0, first: 0, before, line: 0, size: body, table: item });
      cursor = Math.max(cursor, ...all.map((t) => t.box.y1));
      continue;
    }
    const b = it.block!;
    const first = b.lines[0];
    const n = b.lines.length;
    const size = Math.max(...b.lines.map((l) => l.size));
    const pitch = n > 1 ? (b.lines[n - 1].y - first.y) / (n - 1) : 0;
    const line = Math.max(size * 1.0, n > 1 ? pitch : size * 1.2);
    // Word puts the baseline about 80% down an exact-height line.
    const paraTop = first.y - line * 0.8;
    const before = Math.max(0, paraTop - cursor);
    cursor = Math.max(cursor, paraTop) + n * line;

    // Editable text keeps Word's own line spacing, set to the PDF's line pitch where it shows (two lines or more).
    const para: Para = { runs: [], align: 'left', left: 0, right: 0, first: 0, before, line: editable ? 0 : line, size, pitch: n > 1 ? pitch : 0 };
    if (first.rtl) para.rtl = true;
    if (b.tabbed) {
      const segs = first.segs;
      para.left = Math.max(0, segs[0].x - colL);
      para.tabs = [];
      let last = para.left;
      for (const [i, sg] of segs.entries()) {
        if (i > 0) {
          const text = runText(sg.runs);
          const nextX = segs[i + 1]?.x ?? Infinity;
          // Amounts line up on their right edge, like a statement or invoice column.
          const rightTab = NUMERIC.test(text) && sg.right - colL > last + 4 && sg.right < nextX;
          const pos = Math.min(colW, rightTab ? sg.right - colL : sg.x - colL);
          if (pos > last + 1) {
            para.tabs.push({ pos, align: rightTab ? 'right' : 'left' });
            last = pos;
          }
          para.runs.push({ text: '', size: sg.runs[0].size, font: sg.runs[0].font, bold: false, italic: false, tab: true });
        }
        for (const r of sg.runs) pushRun(para.runs, r);
      }
    } else {
      for (const [i, l] of b.lines.entries()) {
        const runs = l.segs[0].runs;
        if (i > 0 && runs.length) {
          const prevText = runText(para.runs);
          // A hyphen at the end of a line usually splits a word; otherwise lines join with a space.
          if (!/[A-Za-z]-$/.test(prevText) || !/^[a-z]/.test(runs[0].text)) pushRun(para.runs, { ...runs[0], text: ' ', link: undefined, underline: false });
        }
        for (const r of runs) pushRun(para.runs, r);
      }
      const rest = b.lines.slice(1);
      const tol = Math.max(size, colW * 0.015);
      const leftOff = b.lines.map((l) => l.x - colL);
      const rightOff = b.lines.map((l) => colR - l.right);
      const centred = b.lines.every((l, i) => Math.abs(leftOff[i] - rightOff[i]) < Math.max(6, colW * 0.03) && leftOff[i] > size * 2);
      const flushRight = b.lines.every((l, i) => rightOff[i] < tol && leftOff[i] > colW * 0.3);
      const bodyLines = b.lines.slice(0, -1);
      // One full line proves nothing (it may be what set the right edge); two or more do.
      const justified = bodyLines.length > 1 && bodyLines.every((l) => colR - l.right < size * 0.6) && rest.every((l) => Math.abs(l.x - rest[0].x) < 2);
      if (centred) para.align = 'center';
      else if (flushRight && !para.rtl) para.align = 'right';
      else if (!para.rtl) {
        para.align = justified ? 'both' : 'left';
        const bodyX = rest.length ? Math.min(...rest.map((l) => l.x)) : first.x;
        para.left = Math.max(0, bodyX - colL);
        para.first = first.x - bodyX;
        if (para.left + para.first < 0) para.first = -para.left;
        // A paragraph set narrower than the page keeps its own right edge, so it wraps the same.
        if (n > 1) {
          const maxRight = Math.max(...b.lines.map((l) => l.right));
          if (colR - maxRight > size * 3) para.right = colR - maxRight;
        }
      } else if (justified) para.align = 'both';
      // Bullets become Word bullets: the character goes, Word draws the bullet and the hanging indent.
      const m = BULLET_CHAR.exec(para.runs[0]?.text ?? '');
      if (m && !para.rtl && para.align !== 'center') {
        para.runs[0].text = para.runs[0].text.slice(m[0].length);
        para.bullet = true;
        const hang = Math.max(para.first < 0 ? -para.first : 0, size * 1.3);
        para.left = Math.max(para.left, (para.first < 0 ? 0 : para.left + para.first) + hang);
        para.first = -hang;
        para.runs = para.runs.filter((r) => r.text);
      }
    }
    paras.push(para);
  }

  // Headings: short single lines clearly bigger than the body text.
  for (const p of paras) {
    if (p.table) continue;
    const text = runText(p.runs).trim();
    if (p.tabs || p.bullet || text.length > 120 || !/\p{L}/u.test(text)) continue;
    const ratio = p.size / body;
    if (ratio >= 1.75) p.heading = 1;
    else if (ratio >= 1.4) p.heading = 2;
    else if (ratio >= 1.18 && p.runs.every((r) => r.bold || !r.text.trim())) p.heading = 3;
  }
  return { paras, cursor };
}

/** Column widths, row heights and text style of a table, for the Word table. */
function tableItem(t: Table, colL: number, page: PageIn): TableItem {
  const nc = t.rows[0]?.length ?? 1;
  const width = t.box.x1 - t.box.x0;
  const widths = t.colX && t.colX.length === nc + 1 ? t.colX.slice(1).map((x, i) => Math.max(12, x - t.colX![i])) : Array.from({ length: nc }, () => width / nc);
  // Columns found from the text end where their text ends: each is widened to its widest
  // entry plus Word's cell padding (about 3pt a side) so values such as "25,000.00 Cr" keep
  // to one line, then the table is kept inside the page, with the margin it has on the left.
  for (const row of t.rows)
    row.forEach((c, i) => {
      if (!c.hidden && c.colSpan === 1 && c.box && !c.text.includes('\n')) widths[i] = Math.max(widths[i], c.box.x1 - c.box.x0 + 8);
    });
  const room = page.width - t.box.x0 - Math.max(18, colL);
  const total = widths.reduce((a, b) => a + b, 0);
  if (total > room && total > width) {
    const f = Math.max(width, room) / total;
    for (let i = 0; i < nc; i++) widths[i] *= f;
  }
  const heights = t.rows.map((row) => {
    const hs = row.filter((c) => !c.hidden && c.box && c.rowSpan === 1).map((c) => c.box!.y1 - c.box!.y0);
    return hs.length ? Math.max(...hs) : 0;
  });
  // Text style: the most common size and font of the words inside the table.
  const inside = page.spans.filter((s) => s.x >= t.box.x0 - 1 && s.x <= t.box.x1 && s.y >= t.box.y0 && s.y <= t.box.y1 + 4);
  const sizes = inside.map((s) => Math.round(s.size * 2) / 2).sort((a, b) => a - b);
  const size = sizes.length ? sizes[Math.floor(sizes.length / 2)] : 10;
  const fonts = new Map<string, number>();
  for (const s of inside) fonts.set(s.font, (fonts.get(s.font) ?? 0) + s.str.length);
  const font = [...fonts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'Arial';
  const ruled = t.method === 'ruled' || t.method === 'ruled-partial' || t.method === 'scan-ruled';
  // Each cell's text as the PDF styled it (colour, bold, links, size), placed as it was placed.
  const gaps: number[] = [];
  const cells = t.rows.map((row) =>
    row.map((c): CellStyle | null => {
      if (c.hidden || !c.box || !c.text.trim()) return null;
      const b = c.box;
      const sp = page.spans.filter((s) => {
        const cx = s.x + s.w / 2;
        const cy = s.y - s.size * 0.3;
        return s.str.trim() && cx > b.x0 && cx < b.x1 && cy > b.y0 && cy < b.y1;
      });
      if (!sp.length) return null;
      const lines = buildLines(sp);
      const lineRuns = lines.map((l) => l.segs.flatMap((sg, i) => (i ? [{ ...sg.runs[0], text: ' ', link: undefined, underline: false }, ...sg.runs] : sg.runs)));
      // Lines the PDF wrapped (one ends near the cell's right edge) become one paragraph that Word
      // wraps itself; short lines of their own stay separate.
      const runs: Run[][] = [];
      lineRuns.forEach((lr, k) => {
        const prev = lines[k - 1];
        if (prev && b.x1 - prev.right < Math.max(lines[k].size * 3, (b.x1 - b.x0) * 0.2) && !ITEM_START.test(runText(lr))) runs[runs.length - 1].push({ ...lr[0], text: ' ', link: undefined, underline: false }, ...lr);
        else runs.push([...lr]);
      });
      // Only when the pieces add up to the cell's text (a piece crossing two cells would not).
      const flat = (s: string) => s.replace(/\s+/g, '');
      if (flat(runs.flat().map((r) => r.text).join('')) !== flat(c.text)) return null;
      const x0 = Math.min(...lines.map((l) => l.x));
      const x1 = Math.max(...lines.map((l) => l.right));
      const top = lines[0].y - lines[0].size * 0.8;
      const bottom = lines[lines.length - 1].y + lines[lines.length - 1].size * 0.2;
      const left = x0 - b.x0;
      const right = b.x1 - x1;
      if (ruled) gaps.push(left);
      // Centred: every line sits midway, and the text is clearly set in from the edges or its
      // lines differ in length (lines that fill the cell are wrapped text, not centred text).
      const cw = b.x1 - b.x0;
      const eachCentred = lines.every((l) => Math.abs(l.x - b.x0 - (b.x1 - l.right)) < Math.max(3, cw * 0.06));
      const ragged = lines.length > 1 && Math.max(...lines.map((l) => l.x)) - Math.min(...lines.map((l) => l.x)) > 3;
      const align: CellStyle['align'] = eachCentred && (left > Math.max(6, cw * 0.12) || ragged) ? 'center' : left > 8 && right < left * 0.4 ? 'right' : 'left';
      const above = top - b.y0;
      const below = b.y1 - bottom;
      const vAlign: CellStyle['vAlign'] = b.y1 - b.y0 < (bottom - top) * 1.6 ? 'top' : Math.abs(above - below) < (b.y1 - b.y0) * 0.2 ? 'center' : below < above * 0.5 ? 'bottom' : 'top';
      // Text set well inside its cell (beside a logo, say) keeps its distance from the cell edge.
      return { lines: runs, align, vAlign, indent: align === 'left' && left > 12 ? left : align === 'right' && right > 12 ? right : 0 };
    }),
  );
  // Cell padding as the PDF has it (Word's own is wider and makes text wrap sooner).
  const pad = ruled && gaps.length ? Math.max(0.5, Math.min(5, median(gaps))) : 2.85;
  return { table: t, widths, heights, ruled, size, font, left: Math.max(0, t.box.x0 - colL), cells, pad };
}

/** Whether `line` carries on the paragraph made of `prev` lines. */
/** The start of a numbered or lettered item: "2.5.3)", "3.1 ", "a)", "(iv)", "ii.". */
const ITEM_START = /^\(?(\d{1,2}(\.\d{1,2}){0,3}[.)]|\d{1,2}(\.\d{1,2}){1,3}\s|[a-z][.)]|[ivx]{1,5}[.)])\s*\S/;

function continues(prev: Line[], line: Line, colL: number, colR: number): boolean {
  const last = prev[prev.length - 1];
  const size = last.size;
  if (Math.abs(line.size - size) > size * 0.15) return false;
  // A numbered or lettered item ("2.5.3)", "a)", "iv.") starts a paragraph of its own.
  if (ITEM_START.test(runText(line.segs[0].runs))) return false;
  const pitch = line.y - last.y;
  if (pitch <= 0 || pitch > size * 1.75) return false;
  if (prev.length > 1) {
    const before = last.y - prev[prev.length - 2].y;
    if (Math.abs(pitch - before) > size * 0.3) return false;
  }
  const text = runText(line.segs[0].runs);
  if (BULLET.test(text)) return false;
  const colW = colR - colL;
  // Right-to-left paragraphs are full on their left side instead.
  const lastFull = last.rtl ? last.x - colL < Math.max(size * 4, colW * 0.15) : colR - last.right < Math.max(size * 4, colW * 0.15);
  const centredPair =
    Math.abs(last.x - colL - (colR - last.right)) < Math.max(6, colW * 0.03) &&
    Math.abs(line.x - colL - (colR - line.right)) < Math.max(6, colW * 0.03) &&
    last.x - colL > size * 2;
  if (centredPair) return true;
  if (!lastFull) return false;
  if (last.rtl) return Math.abs(line.right - last.right) < size * 0.6 || Math.abs(line.right - prev[0].right) < size * 6;
  // Same left edge, or the paragraph's first line was indented, or a hanging indent (lists).
  const firstX = prev[0].x;
  const bodyX = prev.length > 1 ? prev[1].x : null;
  if (bodyX !== null) return Math.abs(line.x - bodyX) < size * 0.6;
  return Math.abs(line.x - firstX) < size * 0.6 || (firstX - line.x > 0 && firstX - line.x < size * 6) || (line.x - firstX > 0 && line.x - firstX < size * 3 && BULLET.test(runText(prev[0].segs[0].runs)));
}

const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** One piece of a header or footer line, placed at the left, centre or right. */
export interface HeadPart {
  text: string;
  align: 'left' | 'center' | 'right';
  bold: boolean;
}

/**
 * A header or footer repeated on a run of pages. `{PAGE}` in a part's text is Word's page
 * number; `start` is the number of the run's first page when the PDF numbers its pages.
 */
export interface RunningHead {
  from: number;
  to: number;
  lines: HeadPart[][];
  size: number;
  start?: number;
  /** Distance from the page edge (top for a header, bottom for a footer), in points. */
  edge: number;
}

/**
 * Takes the lines repeated at the top and bottom of pages (running headers and footers) off the
 * pages. A document can change them part-way (a cover page without footer, then numbered
 * pages): each run of pages with the same lines gets its own. A number that goes up by one
 * from page to page becomes Word's page number, starting where the PDF's numbering starts.
 */
export function takeRunningHeads(pages: PageIn[]): { headers: RunningHead[]; footers: RunningHead[] } {
  const out = { headers: [] as RunningHead[], footers: [] as RunningHead[] };
  if (pages.length < 2) return out;
  const norm = (t: string) => t.toLowerCase().replace(/\d+/g, '#').replace(/[^\p{L}#]+/gu, '');
  type L = { key: string; line: Line; spans: Span[]; text: string };
  for (const where of ['header', 'footer'] as const) {
    const per: L[][] = pages.map((p) => {
      const found: L[] = [];
      for (const l of buildLines(p.spans)) {
        if (!(where === 'header' ? l.y < p.height * 0.09 : l.y > p.height * 0.92)) continue;
        const text = l.segs.map((sg) => runText(sg.runs)).join('    ').trim();
        if (!text || text.length > 260) continue;
        found.push({ key: norm(text), line: l, spans: p.spans.filter((sp) => Math.abs(sp.y - l.y) < sp.size * 0.35), text });
      }
      return found;
    });
    const count = new Map<string, number>();
    for (const ls of per) for (const k of new Set(ls.map((l) => l.key))) count.set(k, (count.get(k) ?? 0) + 1);
    const rep = per.map((ls) => ls.filter((l) => l.key && (count.get(l.key) ?? 0) >= 2));
    const sig = rep.map((ls) => ls.map((l) => l.key).sort().join('|'));
    for (let i = 0; i < pages.length; ) {
      if (!sig[i]) {
        i++;
        continue;
      }
      let j = i;
      while (j + 1 < pages.length && sig[j + 1] === sig[i]) j++;
      const first = [...rep[i]].sort((a, b) => a.line.y - b.line.y);
      const W = pages[i].width;
      const lines: HeadPart[][] = first.map((l) =>
        l.line.segs.map((sg) => {
          const mid = (sg.x + sg.right) / 2;
          // A piece starting near the left edge is left-aligned however long it is.
          const align: HeadPart['align'] = sg.x < W * 0.2 ? 'left' : sg.right > W * 0.75 && sg.x > W * 0.5 ? 'right' : Math.abs(mid - W / 2) < W * 0.12 ? 'center' : 'left';
          return { text: runText(sg.runs).trim(), align, bold: sg.runs.every((r) => r.bold || !r.text.trim()) };
        }),
      );
      // Page numbering: the first number, in any of the lines, that goes up by one a page.
      let start: number | undefined;
      if (j > i)
        for (const [li, l] of first.entries()) {
          const nums = (k: number) => (rep[k].find((x) => x.key === l.key)?.text.match(/\d+/g) ?? []).map(Number);
          const base = nums(i);
          const t = base.findIndex((v, ti) => {
            for (let k = i + 1; k <= j; k++) if (nums(k)[ti] !== v + (k - i)) return false;
            return true;
          });
          if (t < 0) continue;
          start = base[t];
          // Replace the t-th number of the line, counting through its parts in order.
          let n = 0;
          for (const part of lines[li])
            part.text = part.text.replace(/\d+/g, (m) => (n++ === t ? '{PAGE}' : m));
          break;
        }
      const size = median(first.flatMap((l) => l.spans.map((sp) => sp.size))) || 9;
      for (let k = i; k <= j; k++) {
        const drop = new Set(rep[k].flatMap((l) => l.spans));
        pages[k].spans = pages[k].spans.filter((sp) => !drop.has(sp));
      }
      const edge = where === 'header' ? Math.max(0, first[0].line.y - size) : Math.max(0, pages[i].height - first[first.length - 1].line.y - size * 0.3);
      out[where === 'header' ? 'headers' : 'footers'].push({ from: i, to: j, lines, size, start, edge });
      i = j + 1;
    }
  }
  return out;
}

/** Font name as Word knows it, from a PDF font name such as "ABCDEF+TimesNewRomanPS-BoldMT". */
export function wordFont(raw: string, fallback: 'serif' | 'sans-serif' | 'monospace' = 'sans-serif'): { family: string; bold: boolean; italic: boolean } {
  const name = raw.replace(/^[A-Z]{6}\+/, '');
  const bold = /bold|black|heavy|semibold|demi/i.test(name);
  const italic = /italic|oblique|-it$|-ital/i.test(name);
  let family = name
    .split(/[-,]/)[0]
    .replace(/(PS)?MT$/, '')
    .replace(/PS$/, '')
    .replace(/(Bold|Italic|Oblique|Regular|Roman|Light|Medium|Semibold|SemiBold|Black|Book|Heavy)+$/, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .trim();
  const known: Record<string, string> = {
    Helvetica: 'Arial',
    Arial: 'Arial',
    Times: 'Times New Roman',
    'Times New': 'Times New Roman',
    'Times New Roman': 'Times New Roman',
    Courier: 'Courier New',
    'Courier New': 'Courier New',
    'Segoe UI': 'Segoe UI',
    'Trebuchet MS': 'Trebuchet MS',
    'Arial Unicode MS': 'Arial Unicode MS',
    Symbol: 'Symbol',
  };
  family = known[family] ?? family;
  const generic = { serif: 'Times New Roman', 'sans-serif': 'Arial', monospace: 'Courier New' }[fallback];
  if (family.length < 3 || /^[A-Z]{1,3}\s?\d+(_\d+)?$/i.test(family) || /^(F|T|TT|C|R)\d/i.test(family) || !/^[\p{L}\d .&]+$/u.test(family)) family = generic;
  return { family, bold, italic };
}
