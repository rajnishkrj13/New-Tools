import type { PDFPageProxy } from 'pdfjs-dist';
import type { PageInfo } from '../types/pdf';
import type { PageTextModel, RawTextItem, TextLine, TextSegment } from '../types/text';
import { mul } from './CoordinateMapper';
import { resolvePdfFont } from './FontManager';
import { groupParagraphs } from './TextReflowEngine';
import { measureText } from '../utils/fontUtils';

/**
 * Turns PDF.js text items into lines and paragraphs in view space.
 * A PDF text item is not a word or a line - it can be a single glyph run or several
 * words - so lines are rebuilt from geometry (shared baseline, horizontal gaps).
 */

const models = new Map<number, PageTextModel>();
const pending = new Map<number, Promise<PageTextModel>>();

export const clearTextCache = () => {
  models.clear();
  pending.clear();
};
export const getCachedTextModel = (pageIndex: number) => models.get(pageIndex);

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export async function readRawItems(page: PDFPageProxy, info: PageInfo): Promise<{ items: RawTextItem[]; skipped: number }> {
  const content = await page.getTextContent();
  // Font objects (real names, bold/italic flags) only exist once the page's operator list was built.
  try {
    await page.getOperatorList();
  } catch {
    /* fonts stay unknown; generic families are used instead */
  }
  const items: RawTextItem[] = [];
  let skipped = 0;
  for (const it of content.items as any[]) {
    if (typeof it.str !== 'string' || !it.str.trim()) continue;
    const style = content.styles[it.fontName] as any;
    const m = mul(info.viewTransform, it.transform);
    const angle = (Math.atan2(m[1], m[0]) * 180) / Math.PI;
    const fontSize = Math.hypot(m[2], m[3]);
    if (style?.vertical || Math.abs(angle) > 1 || fontSize < 1 || !(it.width > 0)) {
      skipped++;
      continue;
    }
    let realFontName: string | undefined;
    try {
      const objs = (page as any).commonObjs;
      if (objs?.has(it.fontName)) realFontName = objs.get(it.fontName)?.name;
    } catch {
      /* not resolved */
    }
    const asc = Number.isFinite(style?.ascent) && style.ascent > 0 ? style.ascent : 0.9;
    const desc = Number.isFinite(style?.descent) && style.descent < 0 ? style.descent : -0.25;
    items.push({
      str: it.str,
      x: m[4],
      baseline: m[5],
      width: it.width,
      fontSize,
      fontName: it.fontName,
      realFontName,
      generic: style?.fontFamily ?? 'sans-serif',
      ascent: clamp(asc, 0.6, 1.1),
      descent: clamp(desc, -0.4, -0.1),
      angle,
    });
  }
  return { items, skipped };
}

/** Rebuilds visual lines from raw items. Pure, so it can be unit-tested. */
export function buildLines(items: RawTextItem[], pageIndex: number, key = String(pageIndex)): TextLine[] {
  const sorted = [...items].sort((a, b) => a.baseline - b.baseline || a.x - b.x);
  const rows: RawTextItem[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(it.baseline - row[0].baseline) <= Math.min(it.fontSize, row[0].fontSize) * 0.3) row.push(it);
    else rows.push([it]);
  }
  const lines: TextLine[] = [];
  const flush = (group: RawTextItem[]) => {
    if (!group.length) return;
    let text = '';
    const segments: TextSegment[] = [];
    let prev: RawTextItem | undefined;
    for (const it of group) {
      if (prev) {
        const gap = it.x - (prev.x + prev.width);
        if (gap > prev.fontSize * 0.18 && !/\s$/.test(text) && !/^\s/.test(it.str)) text += ' ';
      }
      segments.push({ str: it.str, x: it.x, width: it.width, start: text.length });
      text += it.str;
      prev = it;
    }
    // The dominant item (most characters) decides the line's font and size.
    const main = group.reduce((a, b) => (b.str.length > a.str.length ? b : a));
    const first = group[0];
    const last = group[group.length - 1];
    lines.push({
      id: `l${key}_${lines.length}`,
      pageIndex,
      text,
      x: first.x,
      right: last.x + last.width,
      baseline: main.baseline,
      top: main.baseline - main.ascent * main.fontSize,
      bottom: main.baseline - main.descent * main.fontSize,
      fontSize: main.fontSize,
      fontName: main.fontName,
      realFontName: main.realFontName,
      generic: main.generic,
      segments,
      reliableChars: group.every((g) => g.width > 0 && g.str.length > 0),
    });
  };
  for (const row of rows) {
    row.sort((a, b) => a.x - b.x);
    let group: RawTextItem[] = [];
    for (const it of row) {
      const prev = group[group.length - 1];
      // A gap wider than one em means another column / table cell.
      if (prev && it.x - (prev.x + prev.width) > Math.max(prev.fontSize, it.fontSize)) {
        flush(group);
        group = [];
      }
      group.push(it);
    }
    flush(group);
  }
  return lines;
}

/**
 * x position of every character boundary in a line. PDF.js only reports the width of a
 * whole item, so positions inside an item are interpolated with the metrics of the
 * closest available font. Good enough to pick words and letters.
 */
export function ensureCharX(line: TextLine): number[] {
  if (line.charX) return line.charX;
  const font = resolvePdfFont(line.realFontName, line.generic);
  const spec = { fontFamily: font.family, fontSize: 100, bold: font.bold, italic: font.italic };
  const xs = new Array<number>(line.text.length + 1).fill(NaN);
  for (const seg of line.segments) {
    const total = measureText(seg.str, spec) || 1;
    for (let k = 0; k <= seg.str.length; k++) {
      xs[seg.start + k] = seg.x + (seg.width * measureText(seg.str.slice(0, k), spec)) / total;
    }
  }
  for (let k = 0; k < xs.length; k++) if (Number.isNaN(xs[k])) xs[k] = k ? xs[k - 1] : line.x;
  line.charX = xs;
  return xs;
}

/**
 * Text model of a page. Cached by page position; the cache is cleared whenever pages are
 * moved, rotated, added or deleted. Line and paragraph ids are built from the page's stable
 * id, so an edit keeps pointing at its paragraph after the page moves.
 */
export function loadTextModel(page: PDFPageProxy | null, info: PageInfo): Promise<PageTextModel> {
  const cached = models.get(info.index);
  if (cached) return Promise.resolve(cached);
  let p = pending.get(info.index);
  if (!p) {
    const raw = page ? readRawItems(page, info) : Promise.resolve({ items: [], skipped: 0 });
    p = raw.then(({ items, skipped }) => {
      const key = `${info.id}r${info.rotation}`;
      const lines = buildLines(items, info.index, key);
      const model: PageTextModel = {
        pageIndex: info.index,
        lines,
        paragraphs: groupParagraphs(lines, info.index, info.height, key),
        skipped,
      };
      // Pages changed while the text was being read: the result belongs to an old layout.
      if (pending.get(info.index) !== p) return model;
      models.set(info.index, model);
      return model;
    });
    pending.set(info.index, p);
  }
  return p;
}
