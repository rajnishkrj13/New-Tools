/**
 * Turns positioned pieces of text from a PDF page into Word paragraphs: lines are rebuilt from
 * baselines, lines become flowing paragraphs when they read as one, columns of a table become
 * tab stops, and alignment, indents and spacing are measured from the page. Pure functions,
 * no browser APIs, so the rules are unit-tested.
 *
 * Units are PDF points (1/72 inch); y grows downwards from the top of the page.
 */

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
  /** A tab character instead of text (columns of a table). */
  tab?: boolean;
}

export interface Tab {
  /** From the left margin. */
  pos: number;
  align: 'left' | 'right';
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
  tabs?: Tab[];
  /** 1–3 for headings, which Word lists in its navigation pane. */
  heading?: 1 | 2 | 3;
  /** Biggest text size in the paragraph, for choosing headings. */
  size: number;
}

export interface PageOut {
  width: number;
  height: number;
  margin: { top: number; right: number; bottom: number; left: number };
  paras: Para[];
  images: PageImage[];
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
}

const BULLET = /^\s*([•●▪◦○■□►‣➢✓✔–—\-*]|\(?\d{1,3}[.)]|\(?[a-zA-Z][.)]|\(?[ivxIVX]{1,4}[.)])\s/;
const NUMERIC = /^[\s(₹$€£+\-]*[\d.,]+[\s)%]*(Cr|Dr|CR|DR)?\.?$/;

const sameStyle = (a: Run, b: Run) => !a.tab && !b.tab && a.font === b.font && a.bold === b.bold && a.italic === b.italic && a.color === b.color && Math.abs(a.size - b.size) < 0.3;

function pushRun(runs: Run[], r: Run) {
  const last = runs[runs.length - 1];
  if (last && sameStyle(last, r)) last.text += r.text;
  else runs.push({ ...r });
}

const runText = (runs: Run[]) => runs.map((r) => (r.tab ? '\t' : r.text)).join('');

/** Rebuilds lines: pieces sharing a baseline, left to right, split into segments at wide gaps. */
export function buildLines(spans: Span[]): Line[] {
  // pdf.js fills gaps with space-only pieces as wide as the gap; spaces are rebuilt from the real gaps.
  const items = spans.filter((s) => s.str.trim().length > 0 && s.size > 0).sort((a, b) => a.y - b.y || a.x - b.x);
  const groups: Span[][] = [];
  for (const s of items) {
    const g = groups[groups.length - 1];
    // Same line if the baselines are within a third of the text size (allows sub/superscripts).
    if (g && Math.abs(s.y - g[0].y) < Math.min(s.size, g[0].size) * 0.35) g.push(s);
    else groups.push([s]);
  }

  const lines: Line[] = [];
  for (const g of groups) {
    g.sort((a, b) => a.x - b.x);
    const segs: Seg[] = [];
    let seg: Seg | null = null;
    let prev: Span | null = null;
    for (const s of g) {
      const gap = prev ? s.x - (prev.x + prev.w) : 0;
      const em = Math.max(s.size, prev?.size ?? 0);
      if (!seg || (gap > em * 1.5 && gap > 9 && prev!.str.trim() && s.str.trim())) {
        seg = { x: s.x, right: s.x + s.w, runs: [] };
        segs.push(seg);
      } else if (gap > em * 0.18) {
        const text = runText(seg.runs);
        if (!/\s$/.test(text) && !/^\s/.test(s.str)) pushRun(seg.runs, { text: ' ', size: s.size, font: s.font, bold: s.bold, italic: s.italic, color: s.color });
      }
      pushRun(seg.runs, { text: s.str, size: s.size, font: s.font, bold: s.bold, italic: s.italic, color: s.color });
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
    lines.push({
      y: g.reduce((n, s) => n + s.y * s.str.length, 0) / g.reduce((n, s) => n + s.str.length, 0),
      x: kept[0].x,
      right: kept[kept.length - 1].right,
      size: Math.max(...g.filter((s) => s.str.trim()).map((s) => s.size), g[0].size),
      segs: kept,
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

/** Lays out one page. `body` is the document's usual text size. */
export function layoutPage(page: PageIn, body = 11): PageOut {
  const lines = buildLines(page.spans);
  const imgTop = page.images.length ? Math.min(...page.images.map((i) => i.y)) : Infinity;

  const textLeft = lines.length ? Math.min(...lines.map((l) => l.x)) : 72;
  const textRight = lines.length ? Math.max(...lines.map((l) => l.right)) : page.width - 72;
  const left = Math.max(MIN_MARGIN, Math.min(textLeft, page.width / 3));
  // Text right of the last character would only wrap earlier than the PDF did; leave a hair of room.
  const right = Math.max(MIN_MARGIN, Math.min(page.width - textRight - 1, page.width / 3));
  const firstTop = lines.length ? lines[0].y - lines[0].size * 1.05 : Math.min(imgTop, 72);
  const top = Math.max(MIN_MARGIN, Math.min(firstTop, 72));
  const margin = { top, right, bottom: MIN_MARGIN, left };
  const colL = left;
  const colR = page.width - right;
  const colW = colR - colL;

  // Lines into blocks (future paragraphs).
  const blocks: Block[] = [];
  for (const line of lines) {
    const tabbed = line.segs.length > 1;
    const cur = blocks[blocks.length - 1];
    if (cur && !tabbed && !cur.tabbed && continues(cur.lines, line, colL, colR)) cur.lines.push(line);
    else blocks.push({ lines: [line], tabbed });
  }

  const paras: Para[] = [];
  let cursor = top;
  for (const b of blocks) {
    const first = b.lines[0];
    const n = b.lines.length;
    const size = Math.max(...b.lines.map((l) => l.size));
    const pitch = n > 1 ? (b.lines[n - 1].y - first.y) / (n - 1) : 0;
    const line = Math.max(size * 1.0, n > 1 ? pitch : size * 1.2);
    // Word puts the baseline about 80% down an exact-height line.
    const paraTop = first.y - line * 0.8;
    const before = Math.max(0, paraTop - cursor);
    cursor = Math.max(cursor, paraTop) + n * line;

    const para: Para = { runs: [], align: 'left', left: 0, right: 0, first: 0, before, line, size };
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
          if (!/[A-Za-z]-$/.test(prevText) || !/^[a-z]/.test(runs[0].text)) pushRun(para.runs, { ...runs[0], text: ' ' });
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
      else if (flushRight) para.align = 'right';
      else {
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
      }
    }
    paras.push(para);
  }

  // Headings: short single lines clearly bigger than the body text.
  for (const p of paras) {
    const text = runText(p.runs).trim();
    if (p.tabs || text.length > 120 || !/\p{L}/u.test(text)) continue;
    const ratio = p.size / body;
    if (ratio >= 1.75) p.heading = 1;
    else if (ratio >= 1.4) p.heading = 2;
    else if (ratio >= 1.18 && p.runs.every((r) => r.bold || !r.text.trim())) p.heading = 3;
  }

  return { width: page.width, height: page.height, margin, paras, images: page.images };
}

/** Whether `line` carries on the paragraph made of `prev` lines. */
function continues(prev: Line[], line: Line, colL: number, colR: number): boolean {
  const last = prev[prev.length - 1];
  const size = last.size;
  if (Math.abs(line.size - size) > size * 0.15) return false;
  const pitch = line.y - last.y;
  if (pitch <= 0 || pitch > size * 1.75) return false;
  if (prev.length > 1) {
    const before = last.y - prev[prev.length - 2].y;
    if (Math.abs(pitch - before) > size * 0.3) return false;
  }
  const text = runText(line.segs[0].runs);
  if (BULLET.test(text)) return false;
  const colW = colR - colL;
  const lastFull = colR - last.right < Math.max(size * 4, colW * 0.15);
  const centredPair =
    Math.abs(last.x - colL - (colR - last.right)) < Math.max(6, colW * 0.03) &&
    Math.abs(line.x - colL - (colR - line.right)) < Math.max(6, colW * 0.03) &&
    last.x - colL > size * 2;
  if (centredPair) return true;
  if (!lastFull) return false;
  // Same left edge, or the paragraph's first line was indented, or a hanging indent (lists).
  const firstX = prev[0].x;
  const bodyX = prev.length > 1 ? prev[1].x : null;
  if (bodyX !== null) return Math.abs(line.x - bodyX) < size * 0.6;
  return Math.abs(line.x - firstX) < size * 0.6 || (firstX - line.x > 0 && firstX - line.x < size * 6) || (line.x - firstX > 0 && line.x - firstX < size * 3 && BULLET.test(runText(prev[0].segs[0].runs)));
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
