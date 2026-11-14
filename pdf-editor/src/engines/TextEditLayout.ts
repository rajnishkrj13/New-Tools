import type { OrigLine, TextEditObject, TextObject, TextStyle } from '../types/objects';
import type { Rect } from '../types/pdf';
import type { Paragraph } from '../types/text';
import { ensureCharX } from './PdfTextExtractor';
import { resolvePdfFont } from './FontManager';
import { FIT_TOLERANCE, normalizeSpaces, reflowFrom, wrapText, type FlowLine } from './TextReflowEngine';
import { BASELINE_EM, LINE_HEIGHT_EM, measureText } from '../utils/fontUtils';

/**
 * Layout shared by the screen renderer, hit-testing and the PDF exporter, so what is
 * exported is exactly what was shown.
 */

export interface Slot {
  index: number;
  text: string;
  x: number;
  baseline: number;
  top: number;
  bottom: number;
  fontSize: number;
  charX: number[];
  changed: boolean;
  reliableChars: boolean;
}

/** A piece of text to draw: left end of the baseline plus the exact width it must occupy. */
export interface TextRun {
  text: string;
  x: number;
  baseline: number;
  width: number;
  fontSize: number;
  /** Set for runs of a formatted text box whose style differs from the box. */
  bold?: boolean;
  italic?: boolean;
}

export interface TextEditLayout {
  slots: Slot[];
  runs: TextRun[];
  masks: Rect[];
  /** Points by which the edited paragraph runs into the content below it (0 = fits). */
  overflow: number;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const median = (v: number[]) => {
  const s = [...v].sort((a, b) => a - b);
  return s.length ? s[s.length >> 1] : 1;
};

const calibFor = (o: TextEditObject, slot: number) => o.calibs[slot] ?? o.calib;
const slotMeasure = (o: TextEditObject) => (text: string, slot: number) => measureText(text, o.style) * calibFor(o, slot);

function slotGeometry(o: TextEditObject, i: number) {
  const n = o.orig.length;
  const first = o.orig[0];
  const ratio = o.style.fontSize / first.fontSize;
  const baseline =
    i < n
      ? first.baseline + (o.orig[i].baseline - first.baseline) * ratio
      : first.baseline + (o.orig[n - 1].baseline - first.baseline + (i - n + 1) * o.lineGap) * ratio;
  const src = o.orig[Math.min(i, n - 1)];
  const asc = (src.baseline - src.top) / src.fontSize;
  const desc = (src.bottom - src.baseline) / src.fontSize;
  return { x: src.x, baseline, top: baseline - asc * o.style.fontSize, bottom: baseline + desc * o.style.fontSize };
}

const widthFor = (o: TextEditObject) => (slot: number) => Math.max(10, o.maxRight - slotGeometry(o, slot).x);

function computeCalibs(orig: OrigLine[], style: TextStyle): { calibs: number[]; calib: number } {
  const raw = orig.map((l) => {
    const w = measureText(l.text, style);
    return w > 0 && l.text.trim().length >= 4 ? clamp((l.right - l.x) / w, 0.7, 1.4) : NaN;
  });
  const valid = raw.filter((v) => !Number.isNaN(v));
  const calib = valid.length ? median(valid) : 1;
  return { calibs: raw.map((v) => (Number.isNaN(v) ? calib : v)), calib };
}

/** Creates the edit object for a paragraph with its text still unchanged. */
export function createTextEdit(
  para: Paragraph,
  colors: { background: string; text: string },
  id: string,
): TextEditObject {
  const main = para.lines.reduce((a, b) => (b.text.length > a.text.length ? b : a));
  const font = resolvePdfFont(main.realFontName, main.generic);
  const style: TextStyle = {
    fontFamily: font.family,
    fontSize: para.fontSize,
    bold: font.bold,
    italic: font.italic,
    underline: false,
    color: colors.text,
    align: 'left',
    opacity: 1,
  };
  const orig: OrigLine[] = para.lines.map((l) => ({
    text: l.text,
    x: l.x,
    right: l.right,
    baseline: l.baseline,
    top: l.top,
    bottom: l.bottom,
    fontSize: l.fontSize,
    charX: [...ensureCharX(l)],
  }));
  return {
    id,
    type: 'textedit',
    pageIndex: para.pageIndex,
    paragraphId: para.id,
    orig,
    lines: para.lines.map((l) => l.text),
    soft: [...para.soft],
    maxRight: para.maxRight,
    lineGap: para.lineGap,
    spaceBelow: para.spaceBelow,
    style,
    styled: false,
    ...computeCalibs(orig, style),
    maskColor: colors.background,
    ocr: main.fontName === 'ocr' || undefined,
    origFontName: font.originalName,
    fontMatch: font.match,
  };
}

const toFlow = (o: TextEditObject): FlowLine[] => o.lines.map((text, i) => ({ text, soft: !!o.soft[i] }));
const fromFlow = (o: TextEditObject, flow: FlowLine[]): TextEditObject => ({
  ...o,
  lines: flow.map((f) => f.text),
  soft: flow.map((f) => f.soft),
});

/** Replaces characters [start, end) of one line and reflows the paragraph from that line. */
export function applyRangeEdit(o: TextEditObject, slot: number, start: number, end: number, replacement: string): TextEditObject {
  const flow = toFlow(o);
  const current = flow[slot]?.text ?? '';
  let next = current.slice(0, start) + replacement.replace(/[\r\n\t]+/g, ' ') + current.slice(end);
  if (!replacement) next = next.replace(/\s{2,}/g, ' ').replace(/\s+([,.;:!?])/g, '$1');
  flow[slot] = { text: next, soft: flow[slot]?.soft ?? false };
  return fromFlow(o, reflowFrom(flow, slot, widthFor(o), slotMeasure(o)));
}

/** Applies a style change to the whole paragraph and re-wraps it. */
export function restyleTextEdit(o: TextEditObject, patch: Partial<TextStyle>): TextEditObject {
  const style = { ...o.style, ...patch };
  let next: TextEditObject = { ...o, style, styled: true };
  if (patch.fontFamily !== undefined || patch.bold !== undefined || patch.italic !== undefined) {
    // Metrics of another face no longer relate to the original line widths.
    next = { ...next, calibs: [], calib: 1 };
    if (patch.fontFamily === undefined) next = { ...next, calib: o.calib, calibs: [] };
  }
  if (patch.fontFamily !== undefined || patch.fontSize !== undefined || patch.bold !== undefined || patch.italic !== undefined) {
    next = fromFlow(next, reflowFrom(toFlow(next), 0, widthFor(next), slotMeasure(next), true));
  }
  return next;
}

/** True when the object no longer differs from the original page. */
export function isNoopEdit(o: TextEditObject): boolean {
  return (
    !o.styled &&
    o.lines.length === o.orig.length &&
    o.lines.every((t, i) => normalizeSpaces(t) === normalizeSpaces(o.orig[i].text))
  );
}

let layoutCache = new WeakMap<TextEditObject, TextEditLayout>();
let boxCache = new WeakMap<TextObject, TextBoxLayout>();

/** Forgets cached layouts; call when a font finished loading and widths may have changed. */
export function invalidateLayouts() {
  layoutCache = new WeakMap();
  boxCache = new WeakMap();
}

export function layoutTextEdit(o: TextEditObject): TextEditLayout {
  const hit = layoutCache.get(o);
  if (hit) return hit;
  const n = o.orig.length;
  const slots: Slot[] = [];
  const runs: TextRun[] = [];
  const masks: Rect[] = [];
  const pad = 0.6;
  const count = Math.max(n, o.lines.length);
  for (let i = 0; i < count; i++) {
    const text = o.lines[i];
    const orig = i < n ? o.orig[i] : undefined;
    const exists = text !== undefined;
    const changed = o.styled || !orig || !exists || normalizeSpaces(text) !== normalizeSpaces(orig.text);
    if (!changed && orig) {
      slots.push({
        index: i, text: orig.text, x: orig.x, baseline: orig.baseline, top: orig.top, bottom: orig.bottom,
        fontSize: orig.fontSize, charX: orig.charX, changed: false, reliableChars: true,
      });
      continue;
    }
    const geo = slotGeometry(o, i);
    // Keep the unchanged beginning of the line as the original glyphs: only what
    // follows the first difference is covered and redrawn.
    let keep = 0;
    if (orig && exists && !o.styled) {
      const max = Math.min(orig.text.length, text.length);
      while (keep < max && orig.text[keep] === text[keep]) keep++;
      const atBoundary =
        (keep === orig.text.length && (keep === text.length || /\s/.test(text[keep]))) ||
        (keep === text.length && /\s/.test(orig.text[keep] ?? ' '));
      if (!atBoundary) {
        while (keep > 0 && !/\s/.test(text[keep - 1])) keep--;
      }
    }
    const startX = orig && keep > 0 ? orig.charX[keep] : geo.x;
    if (orig && !(keep >= orig.text.length)) {
      const mx = keep > 0 ? startX : orig.x - pad;
      masks.push({ x: mx, y: orig.top - pad, width: orig.right + pad - mx, height: orig.bottom - orig.top + pad * 2 });
    }
    if (!exists) continue;
    const drawn = text.slice(keep);
    let width = measureText(drawn, o.style) * calibFor(o, i);
    // Lines accepted slightly over the measure are squeezed back inside it.
    const room = o.maxRight - startX;
    if (width > room && width <= room * (FIT_TOLERANCE + 0.02)) width = room;
    let x = startX;
    if (o.styled && o.style.align !== 'left') {
      const avail = o.maxRight - geo.x - width;
      x = geo.x + (o.style.align === 'center' ? avail / 2 : avail);
    }
    if (drawn.trim()) runs.push({ text: drawn, x, baseline: geo.baseline, width, fontSize: o.style.fontSize });
    const charX = new Array<number>(text.length + 1);
    for (let k = 0; k <= text.length; k++) {
      charX[k] = k <= keep && orig && keep > 0 ? orig.charX[k] : x + measureText(text.slice(keep, k), o.style) * calibFor(o, i);
    }
    slots.push({
      index: i, text, x: keep > 0 && orig ? orig.x : x, baseline: geo.baseline, top: geo.top, bottom: geo.bottom,
      fontSize: o.style.fontSize, charX, changed: true, reliableChars: true,
    });
  }
  const origBottom = o.orig[n - 1].bottom;
  const newBottom = slots.length ? slots[slots.length - 1].bottom : origBottom;
  const layout = { slots, runs, masks, overflow: Math.max(0, newBottom - origBottom - o.spaceBelow) };
  layoutCache.set(o, layout);
  return layout;
}

/** Slots of a paragraph nobody has edited yet (character positions are computed on demand). */
export function paragraphSlots(para: Paragraph): Slot[] {
  return para.lines.map((l, i) => ({
    index: i, text: l.text, x: l.x, baseline: l.baseline, top: l.top, bottom: l.bottom, fontSize: l.fontSize,
    get charX() {
      return ensureCharX(l);
    },
    changed: false,
    reliableChars: l.reliableChars,
  }));
}

export interface TextBoxLayout {
  lines: TextRun[];
  height: number;
}

/** What {page}, {pages}, {date} and {file} stand for. Set by the editor whenever the document changes. */
let fieldContext = { pages: 1, fileName: '' };
export function setFieldContext(pages: number, fileName: string) {
  if (fieldContext.pages === pages && fieldContext.fileName === fileName) return;
  fieldContext = { pages, fileName };
  boxCache = new WeakMap();
}

/** Fills the placeholders of a header, footer or page-number text for one page. */
export function resolveFields(text: string, pageIndex: number): string {
  return text
    .replace(/\{page\}/g, String(pageIndex + 1))
    .replace(/\{pages\}/g, String(fieldContext.pages))
    .replace(/\{date\}/g, new Date().toLocaleDateString())
    .replace(/\{file\}/g, fieldContext.fileName.replace(/\.pdf$/i, ''));
}

/** Style of one run: a run of a formatted text box may be bold or italic on its own. */
export function runStyle<T extends { bold: boolean; italic: boolean }>(style: T, run: TextRun): T {
  if (run.bold === undefined && run.italic === undefined) return style;
  return { ...style, bold: run.bold ?? style.bold, italic: run.italic ?? style.italic };
}

interface Token {
  text: string;
  bold: boolean;
  italic: boolean;
}

/** Splits "plain **bold** *italic*" into styled words (each word keeps the space after it). */
function inlineTokens(text: string, o: TextObject): Token[] {
  const out: Token[] = [];
  const push = (t: string, bold: boolean, italic: boolean) => {
    for (const w of t.match(/\S+\s*|\s+/g) ?? []) out.push({ text: w, bold: o.bold || bold, italic: o.italic || italic });
  };
  const re = /\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_/g;
  let last = 0;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m.index > last) push(text.slice(last, m.index), false, false);
    if (m[1] !== undefined) push(m[1], true, false);
    else push(m[2] ?? m[3], false, true);
    last = m.index + m[0].length;
  }
  if (last < text.length) push(text.slice(last), false, false);
  return out;
}

/**
 * Text box with formatting marks: "- " / "1. " start list items (hanging indent),
 * **bold** and *italic* style parts of a line.
 */
function layoutRich(o: TextObject, source: string): TextBoxLayout {
  const lineHeight = o.fontSize * LINE_HEIGHT_EM;
  const measure = (t: string, tok: { bold: boolean; italic: boolean }) => measureText(t, { ...o, bold: tok.bold, italic: tok.italic });
  const lines: TextRun[] = [];
  let row = 0;
  const emit = (tokens: Token[], indent: number) => {
    // Merge neighbours of the same style into one run and place the row.
    const runs: { text: string; bold: boolean; italic: boolean }[] = [];
    for (const t of tokens) {
      const last = runs[runs.length - 1];
      if (last && last.bold === t.bold && last.italic === t.italic) last.text += t.text;
      else runs.push({ ...t });
    }
    if (runs.length) runs[runs.length - 1].text = runs[runs.length - 1].text.trimEnd();
    const widths = runs.map((r) => measure(r.text, r));
    const total = widths.reduce((a, b) => a + b, 0);
    const free = o.width - indent - total;
    let x = indent + (o.align === 'center' ? free / 2 : o.align === 'right' ? free : 0);
    runs.forEach((r, k) => {
      if (r.text) lines.push({ text: r.text, x, baseline: o.fontSize * BASELINE_EM + row * lineHeight, width: widths[k], fontSize: o.fontSize, bold: r.bold, italic: r.italic });
      x += widths[k];
    });
    row++;
  };
  for (const raw of source.replace(/\r/g, '').split('\n')) {
    const m = /^\s*(?:([-*\u2022])|(\d+)[.)])\s+(.*)$/.exec(raw);
    const marker = m ? (m[1] ? '\u2022' : `${m[2]}.`) : null;
    const indent = marker ? Math.max(o.fontSize * 1.3, measure(`${marker} `, o)) : 0;
    if (marker) {
      lines.push({ text: marker, x: 0, baseline: o.fontSize * BASELINE_EM + row * lineHeight, width: measure(marker, o), fontSize: o.fontSize, bold: o.bold, italic: o.italic });
    }
    const avail = Math.max(10, o.width - indent);
    let current: Token[] = [];
    let used = 0;
    for (const tok of inlineTokens(m ? m[3] : raw, o)) {
      const w = measure(tok.text, tok);
      if (current.length && used + measure(tok.text.trimEnd(), tok) > avail + 0.01) {
        emit(current, indent);
        current = [];
        used = 0;
        if (!tok.text.trim()) continue;
      }
      current.push(tok);
      used += w;
    }
    emit(current, indent);
  }
  return { lines, height: Math.max(1, row) * lineHeight };
}

/** Lays out a user-added text box. Coordinates are relative to the box's top-left corner. */
export function layoutTextObject(o: TextObject): TextBoxLayout {
  const hit = boxCache.get(o);
  if (hit) return hit;
  const source = o.fields ? resolveFields(o.text, o.pageIndex) : o.text;
  let layout: TextBoxLayout;
  if (o.rich) layout = layoutRich(o, source);
  else {
    const wrapped = wrapText(source, o.width, (t) => measureText(t, o));
    const lineHeight = o.fontSize * LINE_HEIGHT_EM;
    const lines: TextRun[] = wrapped.map((text, i) => {
      const width = measureText(text, o);
      const x = o.align === 'center' ? (o.width - width) / 2 : o.align === 'right' ? o.width - width : 0;
      return { text, x, baseline: o.fontSize * BASELINE_EM + i * lineHeight, width, fontSize: o.fontSize };
    });
    layout = { lines, height: Math.max(1, wrapped.length) * lineHeight };
  }
  boxCache.set(o, layout);
  return layout;
}
