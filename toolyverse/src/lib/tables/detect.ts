/**
 * Finds tables on a page from where the text is and which lines are drawn.
 *
 * Ruled tables: the horizontal and vertical lines give the grid; a missing line between two grid
 * cells means they are one merged cell. When only column lines are drawn, rows come from the text
 * lines inside them. Unruled tables: columns are the vertical strips of white space that run
 * through every row ("rivers"), rows are the text lines, and lines that only continue a
 * description are joined to the row above. Every confidence figure comes from a measured signal:
 * how cleanly the white space separates the columns, how complete the drawn grid is, and OCR
 * scores.
 */
import { isRtl } from '../lang';
import { cell, unionBox, type Box, type Cell, type Method, type Segment, type Table, type Word } from './types';

export interface PageInput {
  page: number;
  width: number;
  height: number;
  words: Word[];
  segments: Segment[];
  scanned?: boolean;
}

export interface DetectOptions {
  /** 'ruled' looks only for drawn grids, 'aligned' only for unruled tables. */
  mode?: 'auto' | 'ruled' | 'aligned';
}

interface Line {
  words: Word[];
  top: number;
  bottom: number;
  size: number;
}

interface Chunk {
  words: Word[];
  box: Box;
  text: string;
}

// ---- Small helpers ----------------------------------------------------------------------------

const center = (b: Box) => ({ x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 });
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

class Unions {
  p: number[];
  constructor(n: number) {
    this.p = Array.from({ length: n }, (_, i) => i);
  }
  find(i: number): number {
    while (this.p[i] !== i) i = this.p[i] = this.p[this.p[i]];
    return i;
  }
  join(a: number, b: number) {
    this.p[this.find(a)] = this.find(b);
  }
}

/** Values within `tol` of each other become one (their mean). */
function cluster(values: number[], tol: number): number[] {
  const s = [...values].sort((a, b) => a - b);
  const out: number[][] = [];
  for (const v of s) {
    const last = out[out.length - 1];
    if (last && v - last[last.length - 1] <= tol) last.push(v);
    else out.push([v]);
  }
  return out.map((g) => g.reduce((a, b) => a + b, 0) / g.length);
}

/** Joins words of one text line, adding a space only where there is a gap. */
function joinWords(words: Word[]): string {
  let s = '';
  let prev: Word | null = null;
  // Urdu and other Arabic-script text reads from right to left.
  const rtl = isRtl(words.map((w) => w.text).join(' '));
  for (const w of [...words].sort((a, b) => (rtl ? b.box.x0 - a.box.x0 : a.box.x0 - b.box.x0))) {
    if (prev) {
      const gap = rtl ? prev.box.x0 - w.box.x1 : w.box.x0 - prev.box.x1;
      if (gap > Math.min(w.size, prev.size) * 0.12 && !/\s$/.test(s) && !/^\s/.test(w.text)) s += ' ';
    }
    s += w.text;
    prev = w;
  }
  return s.trim();
}

/** Words to text lines: words whose vertical middles fall within each other's height. */
export function textLines(words: Word[]): Line[] {
  const sorted = [...words].filter((w) => w.text.trim()).sort((a, b) => center(a.box).y - center(b.box).y || a.box.x0 - b.box.x0);
  const lines: Line[] = [];
  for (const w of sorted) {
    const cy = center(w.box).y;
    const h = w.box.y1 - w.box.y0;
    const line = lines.find((l) => cy >= l.top - h * 0.1 && cy <= l.bottom + h * 0.1 && Math.abs(cy - (l.top + l.bottom) / 2) < Math.max(h, l.size) * 0.5);
    if (line) {
      line.words.push(w);
      line.top = Math.min(line.top, w.box.y0);
      line.bottom = Math.max(line.bottom, w.box.y1);
      line.size = Math.max(line.size, w.size);
    } else lines.push({ words: [w], top: w.box.y0, bottom: w.box.y1, size: w.size });
  }
  for (const l of lines) l.words.sort((a, b) => a.box.x0 - b.box.x0);
  return lines.sort((a, b) => a.top - b.top);
}

/** Words of a line grouped into phrases: a gap wider than about two spaces separates them. */
function chunksOf(line: Line): Chunk[] {
  const out: Chunk[] = [];
  for (const w of line.words) {
    const last = out[out.length - 1];
    const gap = last ? w.box.x0 - last.box.x1 : Infinity;
    if (last && gap < Math.max(w.size, 4) * 0.65) {
      last.words.push(w);
      last.box = unionBox([last.box, w.box]);
    } else out.push({ words: [w], box: { ...w.box }, text: '' });
  }
  for (const c of out) c.text = joinWords(c.words);
  return out;
}

const minConf = (words: Word[]) => {
  const c = words.map((w) => w.conf).filter((x): x is number => typeof x === 'number');
  return c.length ? Math.round(Math.min(...c)) : 100;
};

const cellText = (words: Word[]) =>
  textLines(words)
    .map((l) => joinWords(l.words))
    .join('\n');

// ---- Ruled tables -------------------------------------------------------------------------------

interface HV {
  h: { y: number; x0: number; x1: number }[];
  v: { x: number; y0: number; y1: number }[];
}

/** Straight lines sorted into horizontal and vertical, with touching pieces of one line joined. */
export function rulings(segments: Segment[]): HV {
  const h: HV['h'] = [];
  const v: HV['v'] = [];
  for (const s of segments) {
    const dx = Math.abs(s.x1 - s.x0);
    const dy = Math.abs(s.y1 - s.y0);
    if (dy <= 1.2 && dx >= 3) h.push({ y: (s.y0 + s.y1) / 2, x0: Math.min(s.x0, s.x1), x1: Math.max(s.x0, s.x1) });
    else if (dx <= 1.2 && dy >= 3) v.push({ x: (s.x0 + s.x1) / 2, y0: Math.min(s.y0, s.y1), y1: Math.max(s.y0, s.y1) });
  }
  const mergeH = () => {
    h.sort((a, b) => a.y - b.y || a.x0 - b.x0);
    const out: HV['h'] = [];
    for (const l of h) {
      const m = out.find((o) => Math.abs(o.y - l.y) <= 1.5 && l.x0 <= o.x1 + 2 && l.x1 >= o.x0 - 2);
      if (m) {
        m.x0 = Math.min(m.x0, l.x0);
        m.x1 = Math.max(m.x1, l.x1);
      } else out.push({ ...l });
    }
    return out;
  };
  const mergeV = () => {
    v.sort((a, b) => a.x - b.x || a.y0 - b.y0);
    const out: HV['v'] = [];
    for (const l of v) {
      const m = out.find((o) => Math.abs(o.x - l.x) <= 1.5 && l.y0 <= o.y1 + 2 && l.y1 >= o.y0 - 2);
      if (m) {
        m.y0 = Math.min(m.y0, l.y0);
        m.y1 = Math.max(m.y1, l.y1);
      } else out.push({ ...l });
    }
    return out;
  };
  // Twice: joining can make lines touch that did not before.
  let hh = mergeH();
  h.splice(0, h.length, ...hh);
  hh = mergeH();
  let vv = mergeV();
  v.splice(0, v.length, ...vv);
  vv = mergeV();
  return { h: hh, v: vv };
}

/** Length of [a, b] covered by the given intervals. */
function covered(a: number, b: number, parts: [number, number][]): number {
  const iv = parts
    .map(([p, q]) => [Math.max(a, p), Math.min(b, q)] as [number, number])
    .filter(([p, q]) => q > p)
    .sort((x, y) => x[0] - y[0]);
  let total = 0;
  let end = a;
  for (const [p, q] of iv) {
    if (q <= end) continue;
    total += q - Math.max(p, end);
    end = q;
  }
  return total;
}

function ruledTables(p: PageInput, rule: HV, used: Set<Word>): Table[] {
  const { h, v } = rule;
  const tol = 2.5;
  const n = h.length + v.length;
  const u = new Unions(n);
  for (let i = 0; i < h.length; i++)
    for (let j = 0; j < v.length; j++) {
      const a = h[i];
      const b = v[j];
      if (b.x >= a.x0 - tol && b.x <= a.x1 + tol && a.y >= b.y0 - tol && a.y <= b.y1 + tol) u.join(i, h.length + j);
    }
  const groups = new Map<number, { h: HV['h']; v: HV['v'] }>();
  h.forEach((l, i) => {
    const g = groups.get(u.find(i)) ?? { h: [], v: [] };
    g.h.push(l);
    groups.set(u.find(i), g);
  });
  v.forEach((l, j) => {
    const g = groups.get(u.find(h.length + j)) ?? { h: [], v: [] };
    g.v.push(l);
    groups.set(u.find(h.length + j), g);
  });

  const tables: Table[] = [];
  for (const g of groups.values()) {
    if (g.h.length < 2 || g.v.length < 2) continue;
    const xs = cluster(g.v.map((l) => l.x), 3);
    const ys = cluster(g.h.map((l) => l.y), 3);
    if (xs.length < 2 || ys.length < 2) continue;
    const nr = ys.length - 1;
    const nc = xs.length - 1;
    if (nr * nc < 2) continue;
    const box: Box = { x0: xs[0], y0: ys[0], x1: xs[nc], y1: ys[nr] };
    const inside = p.words.filter((w) => !used.has(w) && center(w.box).x > box.x0 && center(w.box).x < box.x1 && center(w.box).y > box.y0 && center(w.box).y < box.y1);
    if (!inside.length) continue;

    // Which interior grid edges are drawn. An edge counts when lines cover most of it.
    let clear = 0;
    let edges = 0;
    const vAt = (x: number) => g.v.filter((l) => Math.abs(l.x - x) <= 3).map((l) => [l.y0, l.y1] as [number, number]);
    const hAt = (y: number) => g.h.filter((l) => Math.abs(l.y - y) <= 3).map((l) => [l.x0, l.x1] as [number, number]);
    const hasV = (x: number, a: number, b: number) => {
      const f = covered(a, b, vAt(x)) / Math.max(1e-6, b - a);
      edges++;
      if (f > 0.9 || f < 0.1) clear++;
      return f >= 0.6;
    };
    const hasH = (y: number, a: number, b: number) => {
      const f = covered(a, b, hAt(y)) / Math.max(1e-6, b - a);
      edges++;
      if (f > 0.9 || f < 0.1) clear++;
      return f >= 0.6;
    };
    const idx = (r: number, c: number) => r * nc + c;
    const cu = new Unions(nr * nc);
    for (let r = 0; r < nr; r++)
      for (let c = 0; c < nc; c++) {
        if (c < nc - 1 && !hasV(xs[c + 1], ys[r], ys[r + 1])) cu.join(idx(r, c), idx(r, c + 1));
        if (r < nr - 1 && !hasH(ys[r + 1], xs[c], xs[c + 1])) cu.join(idx(r, c), idx(r + 1, c));
      }
    // Merged areas: kept only when they are rectangles, like real merged cells.
    const spans = new Map<number, { r0: number; r1: number; c0: number; c1: number; cells: number[] }>();
    for (let r = 0; r < nr; r++)
      for (let c = 0; c < nc; c++) {
        const k = cu.find(idx(r, c));
        const s = spans.get(k) ?? { r0: r, r1: r, c0: c, c1: c, cells: [] };
        s.r0 = Math.min(s.r0, r);
        s.r1 = Math.max(s.r1, r);
        s.c0 = Math.min(s.c0, c);
        s.c1 = Math.max(s.c1, c);
        s.cells.push(idx(r, c));
        spans.set(k, s);
      }
    const anchor = new Map<number, { r: number; c: number; rs: number; cs: number }>();
    let odd = 0;
    for (const s of spans.values()) {
      const rect = (s.r1 - s.r0 + 1) * (s.c1 - s.c0 + 1) === s.cells.length;
      if (rect) for (const i of s.cells) anchor.set(i, { r: s.r0, c: s.c0, rs: s.r1 - s.r0 + 1, cs: s.c1 - s.c0 + 1 });
      else {
        odd++;
        for (const i of s.cells) anchor.set(i, { r: Math.floor(i / nc), c: i % nc, rs: 1, cs: 1 });
      }
    }
    // Words into cells by their middle point.
    const bucket = new Map<number, Word[]>();
    for (const w of inside) {
      const { x, y } = center(w.box);
      const r = ys.findIndex((yy, i) => i < nr && y >= yy && y < ys[i + 1]);
      const c = xs.findIndex((xx, i) => i < nc && x >= xx && x < xs[i + 1]);
      if (r < 0 || c < 0) continue;
      const a = anchor.get(idx(r, c))!;
      const k = idx(a.r, a.c);
      bucket.set(k, [...(bucket.get(k) ?? []), w]);
      used.add(w);
    }
    let rows: Cell[][] = [];
    const rowBox: Box[] = [];
    for (let r = 0; r < nr; r++) {
      const row: Cell[] = [];
      for (let c = 0; c < nc; c++) {
        const a = anchor.get(idx(r, c))!;
        if (a.r !== r || a.c !== c) {
          row.push(cell('', { hidden: true }));
          continue;
        }
        const ws = bucket.get(idx(r, c)) ?? [];
        row.push(cell(cellText(ws), { rowSpan: a.rs, colSpan: a.cs, box: { x0: xs[c], y0: ys[r], x1: xs[c + a.cs], y1: ys[r + a.rs] }, conf: minConf(ws), bold: ws.length > 0 && ws.every((w) => w.bold) }));
      }
      rows.push(row);
      rowBox.push({ x0: xs[0], y0: ys[r], x1: xs[nc], y1: ys[r + 1] });
    }
    let method: Method = p.scanned ? 'scan-ruled' : 'ruled';
    const notes: string[] = [];
    // Only column lines drawn: a grid row holds several text lines that line up across columns.
    // A row is only split when it is far taller than a one-line row: a ruled row whose cells wrap
    // onto two lines (with a value centred between them) stays one row.
    const wordSize = median(inside.map((w) => w.size)) || 10;
    const unit = Math.min(...ys.slice(1).map((y, i) => y - ys[i]), wordSize * 1.8);
    // The first of several grid rows is the heading: its lines are one heading, however tall.
    const tall = ys.slice(1).map((y, i) => y - ys[i] >= unit * 2.8 && !(i === 0 && nr > 1));
    const split = splitTallRows(rows, bucket, nc, (r, c) => anchor.get(idx(r, c))!, idx, tall);
    if (split) {
      rows = split;
      method = p.scanned ? 'scan-ruled' : 'ruled-partial';
      notes.push('Rows were taken from the text lines, as the table draws no line between them.');
    }
    if (odd) notes.push(`${odd} irregular merged area${odd === 1 ? ' was' : 's were'} kept as separate cells.`);
    const grid = edges ? clear / edges : 1;
    const filled = rows.flat().filter((c) => !c.hidden && c.text).length / Math.max(1, rows.flat().filter((c) => !c.hidden).length);
    const cellsConf = Math.min(100, ...rows.flat().filter((c) => !c.hidden && c.text).map((c) => c.conf ?? 100));
    tables.push({
      id: '',
      name: '',
      pages: [p.page],
      box,
      rows,
      headerRows: headerCount(rows),
      method,
      confidence: { table: Math.round(70 + 30 * Math.min(1, filled * 1.5)), rows: Math.round(100 * grid), cols: Math.round(100 * grid), cells: cellsConf },
      notes,
      colX: xs,
    });
  }
  return tables;
}

/**
 * A ruled table that draws only column lines (or an outer box): each grid row holds many text
 * lines. When those lines line up across columns, each becomes a row of its own.
 */
function splitTallRows(rows: Cell[][], bucket: Map<number, Word[]>, nc: number, anchorOf: (r: number, c: number) => { r: number; c: number; rs: number; cs: number }, idx: (r: number, c: number) => number, tall: boolean[]): Cell[][] | null {
  let changed = false;
  const out: Cell[][] = [];
  rows.forEach((row, r) => {
    const all: { c: number; w: Word }[] = [];
    for (let c = 0; c < nc; c++) {
      const a = anchorOf(r, c);
      if (a.r !== r || a.c !== c || a.rs !== 1) continue;
      for (const w of bucket.get(idx(r, c)) ?? []) all.push({ c, w });
    }
    const lines = textLines(all.map((x) => x.w));
    const multi = lines.filter((l) => new Set(l.words.map((w) => all.find((x) => x.w === w)!.c)).size >= 2).length;
    if (!tall[r] || lines.length < 3 || multi < 2 || row.some((x) => x.rowSpan > 1)) {
      out.push(row);
      return;
    }
    changed = true;
    const sub = lines.map((l) => {
      const cells: Cell[] = row.map((x) => (x.hidden ? cell('', { hidden: true }) : cell('', { colSpan: x.colSpan, rowSpan: 1 })));
      for (let c = 0; c < nc; c++) {
        if (cells[c].hidden) continue;
        const ws = l.words.filter((w) => all.find((x) => x.w === w)!.c === c);
        if (ws.length) cells[c] = cell(joinWords(ws), { colSpan: row[c].colSpan, box: unionBox(ws.map((w) => w.box)), conf: minConf(ws), bold: ws.every((w) => w.bold) });
      }
      return cells;
    });
    out.push(...joinContinuations(sub));
  });
  return changed ? out : null;
}

// ---- Unruled tables ----------------------------------------------------------------------------

function alignedTables(p: PageInput, free: Word[], regionsToSkip: Box[]): Table[] {
  const lines = textLines(free).filter((l) => !regionsToSkip.some((b) => (l.top + l.bottom) / 2 > b.y0 && (l.top + l.bottom) / 2 < b.y1));
  if (lines.length < 2) return [];
  const chunks = lines.map(chunksOf);
  const multi = chunks.map((c) => c.length >= 2);
  const lh = median(lines.map((l) => l.bottom - l.top)) || 10;
  const tables: Table[] = [];

  let i = 0;
  while (i < lines.length) {
    if (!multi[i]) {
      i++;
      continue;
    }
    let last = i;
    let j = i;
    while (j + 1 < lines.length) {
      const next = j + 1;
      if (lines[next].top - lines[j].bottom > Math.max(lh * 2.2, 14)) break;
      if (multi[next]) {
        last = next;
        j = next;
      } else if ((multi[next + 1] || multi[next + 2]) && lines[next + 1] && lines[next + 1].top - lines[next].bottom <= Math.max(lh * 2.2, 14)) j = next;
      else break;
    }
    const regionLines = lines.slice(i, last + 1);
    const regionChunks = chunks.slice(i, last + 1);
    const t = buildAligned(p, regionLines, regionChunks);
    if (t) tables.push(t);
    i = last + 1;
  }
  return tables;
}

/** A list item's marker: "a)", "(iv)", "ii.", "3.", "2.1)", a bullet or a dash. */
const LIST_MARKER = /^(\(?([a-z]{1,2}|[ivxlc]{1,6}|\d{1,3}(\.\d{1,3})*)[.)]\)?|[•●▪■◦○➢►✓\-–*])$/i;

function buildAligned(p: PageInput, lines: Line[], chunks: Chunk[][]): Table | null {
  const multiIdx = chunks.map((c, k) => (c.length >= 2 ? k : -1)).filter((k) => k >= 0);
  // Two lines that happen to line up are not enough to call it a table.
  if (multiIdx.length < 3) return null;
  const all = chunks.flat();
  const x0 = Math.floor(Math.min(...all.map((c) => c.box.x0)));
  const x1 = Math.ceil(Math.max(...all.map((c) => c.box.x1)));
  const res = 0.5;
  const nb = Math.max(1, Math.ceil((x1 - x0) / res) + 1);
  const cover = new Int32Array(nb);
  for (const k of multiIdx)
    for (const c of chunks[k]) for (let b = Math.floor((c.box.x0 - x0) / res); b <= Math.ceil((c.box.x1 - x0) / res); b++) if (b >= 0 && b < nb) cover[b]++;
  // A few wide headings or long descriptions may cross a gap; ignore up to 8% of rows doing so.
  const allow = multiIdx.length >= 12 ? Math.floor(multiIdx.length * 0.08) : 0;
  const cols: [number, number][] = [];
  let start = -1;
  for (let b = 0; b <= nb; b++) {
    const on = b < nb && cover[b] > allow;
    if (on && start < 0) start = b;
    if (!on && start >= 0) {
      cols.push([x0 + start * res, x0 + (b - 1) * res]);
      start = -1;
    }
  }
  if (cols.length < 2) return null;

  // How cleanly each gap separates the columns: rows whose text crosses it count against it.
  let clarity = 1;
  for (let g = 0; g < cols.length - 1; g++) {
    const a = cols[g][1];
    const b = cols[g + 1][0];
    const crossing = multiIdx.filter((k) => chunks[k].some((c) => c.box.x0 < a && c.box.x1 > b)).length;
    clarity = Math.min(clarity, 1 - crossing / multiIdx.length);
  }

  // Two wide columns of running text are a page in two columns, not a table.
  const avgLen = (col: number) => {
    const texts = multiIdx.flatMap((k) => chunks[k].filter((c) => overlapCol(c.box, cols) === col).map((c) => c.text.length));
    return texts.reduce((a, b) => a + b, 0) / Math.max(1, texts.length);
  };
  if (cols.length === 2 && lines.length > 6 && avgLen(0) > 28 && avgLen(1) > 28) return null;
  // A column of list markers ("a)", "ii.", "3.", "•") beside running text is a list, not a table.
  const firstCol = multiIdx.flatMap((k) => chunks[k].filter((c) => overlapCol(c.box, cols) === 0).map((c) => c.text.trim()));
  const markers = firstCol.filter((t) => LIST_MARKER.test(t)).length;
  if (cols.length <= 3 && firstCol.length && markers / firstCol.length >= 0.8 && avgLen(cols.length - 1) > 25) return null;
  // Justified running text has narrow rivers of space that can line up for a few lines: narrow
  // gaps between pieces of ordinary words (not figures) are a paragraph, not columns.
  const size = median(lines.map((l) => l.size)) || 10;
  const gaps = cols.slice(1).map((c, g) => c[0] - cols[g][1]);
  const pieces = multiIdx.flatMap((k) => chunks[k].map((c) => c.text));
  const wordy = pieces.reduce((a, t) => a + t.length, 0) / Math.max(1, pieces.length) > 14 && pieces.filter((t) => /\d/.test(t)).length / Math.max(1, pieces.length) < 0.3;
  if (wordy && gaps.every((g) => g < size * 1.4)) return null;

  const nc = cols.length;
  const raw: { cells: Cell[]; line: Line; multi: boolean }[] = [];
  let lowered = false;
  lines.forEach((line, k) => {
    const cells: Cell[] = Array.from({ length: nc }, () => cell(''));
    for (const ch of chunks[k]) {
      const hit = cols.map(([a, b]) => Math.max(0, Math.min(b, ch.box.x1) - Math.max(a, ch.box.x0)));
      const width = Math.max(1, ch.box.x1 - ch.box.x0);
      const touched = hit.map((o, c) => (o > 0 && (o / width > 0.2 || o / Math.max(1, cols[c][1] - cols[c][0]) > 0.5) ? c : -1)).filter((c) => c >= 0);
      const first = touched.length ? touched[0] : hit.indexOf(Math.max(...hit));
      const lastC = touched.length ? touched[touched.length - 1] : first;
      const target = cells[first];
      const conf = minConf(ch.words);
      if (target.hidden) continue;
      if (target.text) {
        target.text = `${target.text} ${ch.text}`;
        target.conf = Math.min(target.conf ?? 100, 70, conf);
        target.box = unionBox([target.box!, ch.box]);
        lowered = true;
      } else {
        cells[first] = cell(ch.text, { box: ch.box, conf, bold: ch.words.every((w) => w.bold) });
      }
      if (lastC > first) {
        cells[first].colSpan = lastC - first + 1;
        for (let c = first + 1; c <= lastC; c++) cells[c] = cell('', { hidden: true });
      }
    }
    raw.push({ cells, line, multi: chunks[k].length >= 2 });
  });

  let rows = raw.map((r) => r.cells);
  const headerRows = headerCount(rows);
  // Spans in data rows are uncertain (text that crosses a column gap); in headings they are normal.
  rows.forEach((row, r) => {
    if (r < headerRows) return;
    for (const c of row) if (c.colSpan > 1) c.conf = Math.min(c.conf ?? 100, 60);
  });
  const head = joinHeaderLines(rows.slice(0, headerRows));
  rows = [...head, ...joinContinuations(rows.slice(headerRows), raw.slice(headerRows).map((r) => r.line))];
  const filledRows = rows.filter((row) => row.filter((c) => !c.hidden && c.text).length >= 2).length / Math.max(1, rows.length);
  const cellsConf = Math.min(100, ...rows.flat().filter((c) => !c.hidden && c.text).map((c) => c.conf ?? 100));
  const box = unionBox(lines.map((l) => ({ x0: Math.min(...l.words.map((w) => w.box.x0)), y0: l.top, x1: Math.max(...l.words.map((w) => w.box.x1)), y1: l.bottom })));
  const notes: string[] = [];
  if (lowered) notes.push('Some cells held text from two places; check them.');
  return {
    id: '',
    name: '',
    pages: [p.page],
    box,
    rows,
    headerRows: head.length,
    method: p.scanned ? 'scan-aligned' : 'aligned',
    confidence: {
      table: Math.round(100 * Math.min(1, (multiIdx.length / lines.length) * 0.5 + clarity * 0.5)),
      rows: Math.round(100 * filledRows),
      cols: Math.round(100 * clarity),
      cells: cellsConf,
    },
    notes,
    colX: [...cols.map((c) => c[0]), cols[cols.length - 1][1]],
  } as Table & { colX: number[] };
}

const overlapCol = (b: Box, cols: [number, number][]) => {
  const hit = cols.map(([a, c]) => Math.max(0, Math.min(c, b.x1) - Math.max(a, b.x0)));
  return hit.indexOf(Math.max(...hit));
};

// ---- Rows: headings and continuation lines -----------------------------------------------------

const NUMERIC = /^[-+(]?\s*(₹|rs\.?|inr|\$|€|£)?\s*[\d,]*\d(\.\d+)?\s*\)?\s*(%|cr\.?|dr\.?|-)?$/i;
const DATE = /^(\d{1,2}[-/. ](\d{1,2}|[a-z]{3,9})[-/. ]\d{2,4}|\d{4}-\d{2}-\d{2})$/i;
export const looksNumeric = (s: string) => NUMERIC.test(s.trim()) || DATE.test(s.trim());

/** Leading rows that are headings: rows before the first one holding numbers where the column usually does. */
export function headerCount(rows: Cell[][]): number {
  if (rows.length < 2) return 0;
  const nc = rows[0].length;
  const numericCol = Array.from({ length: nc }, (_, c) => {
    const vals = rows.map((r) => r[c]).filter((x) => !x.hidden && x.text);
    return vals.length > 0 && vals.filter((x) => looksNumeric(x.text)).length / vals.length >= 0.5;
  });
  let first = rows.findIndex((r) => r.some((x, c) => numericCol[c] && !x.hidden && x.text && looksNumeric(x.text)));
  // No numbers anywhere (an all-text table): the first row is taken as the heading.
  if (first < 0) first = 1;
  return Math.min(first, 4);
}

/** Heading lines that only continue the label above (a two-line heading) become one heading row. */
function joinHeaderLines(head: Cell[][]): Cell[][] {
  const out: Cell[][] = [];
  for (const row of head) {
    const prev = out[out.length - 1];
    const spans = (r: Cell[]) => r.some((c) => c.colSpan > 1);
    if (prev && !spans(prev) && !spans(row) && row.every((c, i) => !c.text || prev[i].text)) {
      row.forEach((c, i) => {
        if (c.text) {
          prev[i].text = `${prev[i].text}\n${c.text}`;
          prev[i].box = prev[i].box && c.box ? unionBox([prev[i].box!, c.box]) : prev[i].box ?? c.box;
        }
      });
    } else out.push(row);
  }
  return out;
}

/**
 * A line with nothing in the columns almost every row fills (date, amounts) continues the row
 * above it: a description wrapped onto a second line.
 */
function joinContinuations(rows: Cell[][], lines?: Line[]): Cell[][] {
  if (rows.length < 3) return rows;
  const nc = rows[0].length;
  // Key columns: filled in most rows and holding dates or amounts (a description column is not one).
  const fill = Array.from({ length: nc }, (_, c) => rows.filter((r) => !r[c].hidden && r[c].text).length / rows.length);
  const numericShare = (c: number) => {
    const vals = rows.map((r) => r[c]).filter((x) => !x.hidden && x.text);
    return vals.length ? vals.filter((x) => looksNumeric(x.text)).length / vals.length : 0;
  };
  let anchors = fill.map((f, c) => (f >= 0.7 && numericShare(c) >= 0.6 ? c : -1)).filter((c) => c >= 0);
  if (!anchors.length && fill[0] >= 0.7) anchors = [0];
  if (!anchors.length) return rows;
  const out: Cell[][] = [];
  rows.forEach((row, r) => {
    const prev = out[out.length - 1];
    const filled = row.filter((c) => !c.hidden && c.text).length;
    const near = !lines || r === 0 || lines[r].top - lines[r - 1].bottom < (lines[r].bottom - lines[r].top) * 1.6;
    const isCont = prev && near && filled > 0 && filled <= 2 && anchors.every((c) => row[c].hidden || !row[c].text) && row.every((c) => c.colSpan === 1);
    if (isCont) {
      row.forEach((c, i) => {
        if (!c.text) return;
        const t = prev[i];
        t.text = t.text ? `${t.text}\n${c.text}` : c.text;
        t.box = t.box && c.box ? unionBox([t.box, c.box]) : t.box ?? c.box;
        t.conf = Math.min(t.conf ?? 100, c.conf ?? 100, 90);
      });
    } else out.push(row);
  });
  return out;
}

// ---- Page ------------------------------------------------------------------------------------

/**
 * The colour painted under a box (a cell): the colour whose areas together cover most of it,
 * at least 60% (shading is often painted in several pieces: per cell, per line of text). Very
 * dark colours are left out: those are lines or black bars, not shading.
 */
export function fillUnder(b: Box, fills: { box: Box; color: string }[]): string | null {
  const area = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
  const cover = new Map<string, number>();
  for (const f of fills) {
    const w = Math.min(f.box.x1, b.x1) - Math.max(f.box.x0, b.x0);
    const h = Math.min(f.box.y1, b.y1) - Math.max(f.box.y0, b.y0);
    if (w <= 0 || h <= 0) continue;
    const [r, g, bl] = [0, 2, 4].map((i) => parseInt(f.color.slice(i, i + 2), 16));
    if (0.299 * r + 0.587 * g + 0.114 * bl <= 90) continue;
    // A later colour painted over the same area replaces the one under it.
    for (const k of cover.keys()) if (k !== f.color) cover.set(k, Math.max(0, cover.get(k)! - w * h));
    cover.set(f.color, Math.min(area, (cover.get(f.color) ?? 0) + w * h));
  }
  const best = [...cover].sort((x, y) => y[1] - x[1])[0];
  return best && best[1] / area >= 0.6 ? best[0] : null;
}

/** Cell shading from the colours painted on the page. */
export function shadeCells(tables: Table[], fills: { box: Box; color: string }[]): void {
  if (!fills.length) return;
  for (const t of tables)
    for (const row of t.rows)
      for (const c of row) {
        if (c.hidden || !c.box) continue;
        const color = fillUnder(c.box, fills);
        if (color) c.fill = color;
      }
}

/**
 * Boxes drawn round text (a letterhead, a note): closed rectangles of drawn lines with text
 * inside, that are neither a table (`skip`) nor the frame round the page.
 */
export function textBoxes(p: PageInput, skip: Box[]): Box[] {
  const frame = pageFrame(p);
  const { h, v } = rulings((frame?.segments ?? p.segments).filter((s) => !s.soft));
  const side = (x: number, a: number, b: number) => covered(a, b, v.filter((l) => Math.abs(l.x - x) <= 2).map((l) => [l.y0, l.y1] as [number, number])) >= (b - a) * 0.9;
  const out: Box[] = [];
  for (const top of h) {
    if (top.x1 - top.x0 < 30) continue;
    for (const bottom of h) {
      if (bottom.y - top.y < 8 || Math.abs(bottom.x0 - top.x0) > 3 || Math.abs(bottom.x1 - top.x1) > 3) continue;
      const b = { x0: Math.min(top.x0, bottom.x0), y0: top.y, x1: Math.max(top.x1, bottom.x1), y1: bottom.y };
      if (!side(b.x0, b.y0, b.y1) || !side(b.x1, b.y0, b.y1)) continue;
      // A line across the inside makes rows: that is a table (or a stack of boxes), not one box.
      if (h.some((l) => l.y > b.y0 + 2 && l.y < b.y1 - 2 && l.x0 <= b.x0 + 3 && l.x1 >= b.x1 - 3)) continue;
      if (skip.some((t) => Math.min(t.x1, b.x1) > Math.max(t.x0, b.x0) && Math.min(t.y1, b.y1) > Math.max(t.y0, b.y0))) continue;
      if (!p.words.some((w) => center(w.box).x > b.x0 && center(w.box).x < b.x1 && center(w.box).y > b.y0 && center(w.box).y < b.y1)) continue;
      out.push(b);
      break;
    }
  }
  return out;
}

/**
 * A frame drawn round the whole page (a page border): four lines near the page edges, each
 * running along most of its side. It is decoration, not a table.
 */
export function pageFrame(p: Pick<PageInput, 'segments' | 'width' | 'height'>): { box: Box; segments: Segment[] } | null {
  const { width: W, height: H } = p;
  const near = 0.12;
  const hs = p.segments.filter((s) => Math.abs(s.y1 - s.y0) < 1.5 && Math.abs(s.x1 - s.x0) > W * 0.8);
  const vs = p.segments.filter((s) => Math.abs(s.x1 - s.x0) < 1.5 && Math.abs(s.y1 - s.y0) > H * 0.8);
  const top = hs.filter((s) => s.y0 < H * near).sort((a, b) => a.y0 - b.y0)[0];
  const bottom = hs.filter((s) => s.y0 > H * (1 - near)).sort((a, b) => b.y0 - a.y0)[0];
  const left = vs.filter((s) => s.x0 < W * near).sort((a, b) => a.x0 - b.x0)[0];
  const right = vs.filter((s) => s.x0 > W * (1 - near)).sort((a, b) => b.x0 - a.x0)[0];
  if (!top || !bottom || !left || !right) return null;
  const box = { x0: left.x0, y0: top.y0, x1: right.x0, y1: bottom.y0 };
  // Lines of the frame, including doubled ones drawn a point or two apart.
  const onFrame = (s: Segment) =>
    (Math.abs(s.y1 - s.y0) < 1.5 && Math.abs(s.x1 - s.x0) > W * 0.8 && (Math.abs(s.y0 - box.y0) < 6 || Math.abs(s.y0 - box.y1) < 6)) ||
    (Math.abs(s.x1 - s.x0) < 1.5 && Math.abs(s.y1 - s.y0) > H * 0.8 && (Math.abs(s.x0 - box.x0) < 6 || Math.abs(s.x0 - box.x1) < 6));
  return { box, segments: p.segments.filter((s) => !onFrame(s)) };
}

export function detectTables(p: PageInput, opts: DetectOptions = {}): { tables: Table[]; free: Word[] } {
  const mode = opts.mode ?? 'auto';
  const used = new Set<Word>();
  const frame = pageFrame(p);
  if (frame) p = { ...p, segments: frame.segments };
  // Drawn lines first; edges of shading only make tables where no drawn lines do (a table
  // marked out by shaded rows), never extra rows inside a ruled one.
  const hard = p.segments.filter((s) => !s.soft);
  let ruled = mode === 'aligned' ? [] : ruledTables({ ...p, segments: hard }, rulings(hard), used);
  if (mode !== 'aligned' && hard.length !== p.segments.length) {
    const inside = (s: Segment) => ruled.some((t) => Math.min(s.x0, s.x1) >= t.box.x0 - 3 && Math.max(s.x0, s.x1) <= t.box.x1 + 3 && Math.min(s.y0, s.y1) >= t.box.y0 - 3 && Math.max(s.y0, s.y1) <= t.box.y1 + 3);
    const rest = p.segments.filter((s) => s.soft && !inside(s)).concat(hard.filter((s) => !inside(s)));
    if (rest.some((s) => s.soft)) ruled = [...ruled, ...ruledTables({ ...p, segments: rest }, rulings(rest), used)];
  }
  const free = p.words.filter((w) => !used.has(w));
  const aligned = mode === 'ruled' ? [] : alignedTables(p, free, ruled.map((t) => t.box));
  for (const t of aligned) for (const w of free) if (center(w.box).y >= t.box.y0 && center(w.box).y <= t.box.y1 && center(w.box).x >= t.box.x0 - 1 && center(w.box).x <= t.box.x1 + 1) used.add(w);
  const tables = [...ruled, ...aligned].sort((a, b) => a.box.y0 - b.box.y0 || a.box.x0 - b.box.x0).map((t) => (isRtl(t.rows.flat().map((c) => c.text).join(' ')) ? toReadingOrder(t) : t));
  tables.forEach((t, k) => {
    t.id = `p${p.page + 1}-t${k + 1}`;
    t.name = `Page ${p.page + 1} table ${k + 1}`;
    t.rowPages = t.rows.map(() => p.page);
  });
  return { tables, free: p.words.filter((w) => !used.has(w)) };
}

/**
 * A right-to-left table (Urdu, Sindhi, Kashmiri) in reading order: its first column is the one
 * on the right of the page. Merged cells and column edges are mirrored with it.
 */
export function toReadingOrder(t: Table): Table {
  const nc = t.rows[0]?.length ?? 0;
  const rows = t.rows.map((row) => {
    const out: Cell[] = Array.from({ length: nc }, () => cell('', { hidden: true }));
    row.forEach((c, k) => {
      if (c.hidden) return;
      const at = nc - 1 - (k + c.colSpan - 1);
      out[at] = c;
    });
    // Cells under a merge that is now anchored further left are hidden; the rest stay as they were.
    return out.map((c, k) => (c.hidden && !out.some((a, j) => !a.hidden && j < k && j + a.colSpan > k) ? cell('') : c));
  });
  let colX = t.colX;
  if (colX && colX.length === nc + 1) {
    const widths = colX.slice(1).map((x, i) => x - colX![i]).reverse();
    const start = colX[0];
    colX = [start];
    for (const w of widths) colX.push(colX[colX.length - 1] + w);
  }
  return { ...t, rows, colX, rtl: true, notes: [...t.notes, 'Right-to-left table: its first column is the rightmost one on the page.'] };
}
