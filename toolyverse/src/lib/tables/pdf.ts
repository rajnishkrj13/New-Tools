/**
 * Reads a PDF page for table extraction: text with positions, sizes and boldness, and the lines
 * and boxes drawn on the page (table rules). Scanned pages are read with OCR instead, and their
 * ruling lines are found in the page picture. Browser only (pdf.js and canvas).
 */
import { renderPage, type PdfDoc } from '../pdf/render';
import { LEGACY_FONT, OSD_SCRIPT, SCRIPT_MODEL, brokenIndicShare, hasBrokenIndic, indicAgreement, joinMarkPieces, mainScripts, type Script } from '../lang';
import type { PageInput } from './detect';
import type { Box, Segment, Word } from './types';
import type { OcrResult, OcrWord } from '../ocr';

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1], m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3], m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5]];
const apply = (m: M, x: number, y: number) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });

export interface PageRead extends PageInput {
  /** Characters of real text (not counting spaces). */
  chars: number;
  scripts: Script[];
  /** Fonts that look like old non-Unicode Indian-language fonts. */
  legacyFonts: string[];
  /** Share of Indian-script words whose letters come out of the PDF in an impossible order (0–1). */
  brokenIndic: number;
  /** For OCR pages: models used and how sure the reading was. */
  ocr?: { models: string[]; confidence: number; script?: string; rotated: number };
}

/** Text and drawn lines of a page with real text. */
export async function readDigitalPage(doc: PdfDoc, index: number): Promise<PageRead> {
  const { OPS, Util } = await import('pdfjs-dist');
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform as M;
  const ops = await page.getOperatorList();
  const tc = await page.getTextContent();

  const fontInfo = new Map<string, { bold: boolean; name: string }>();
  const words: Word[] = [];
  let chars = 0;
  let allText = '';
  for (const it of tc.items) {
    if (!('str' in it) || !it.str.trim()) continue;
    const m = Util.transform(base, it.transform) as M;
    const size = Math.hypot(m[2], m[3]);
    if (size < 1 || Math.abs(m[1]) > Math.abs(m[0]) * 0.18) continue;
    let f = fontInfo.get(it.fontName);
    if (!f) {
      let obj: { name?: string; bold?: boolean; black?: boolean } | null = null;
      try {
        if (page.commonObjs.has(it.fontName)) obj = page.commonObjs.get(it.fontName);
      } catch {
        obj = null;
      }
      const name = (obj?.name ?? '').replace(/^[A-Z]{6}\+/, '');
      f = { bold: /bold|black|heavy|semibold/i.test(name) || !!obj?.bold || !!obj?.black, name };
      fontInfo.set(it.fontName, f);
    }
    const width = it.width * (Math.hypot(m[0], m[1]) / Math.max(1e-6, Math.hypot(it.transform[0], it.transform[1]))) || it.width;
    chars += it.str.replace(/\s/g, '').length;
    allText += `${it.str} `;
    // A run of spaces inside one piece of text usually separates columns: split it there.
    const parts = it.str.split(/(\s{2,})/);
    const perChar = width / Math.max(1, it.str.length);
    let offset = 0;
    for (const part of parts) {
      if (part.trim() && !/^\s+$/.test(part)) {
        const lead = part.length - part.trimStart().length;
        const text = part.trim();
        const x0 = m[4] + (offset + lead) * perChar;
        words.push({ text, box: { x0, y0: m[5] - size * 0.82, x1: x0 + text.length * perChar, y1: m[5] + size * 0.22 }, size, bold: f.bold });
      }
      offset += part.length;
    }
  }

  // Lines and boxes drawn on the page.
  const segments: Segment[] = [];
  // Lines painted in white (or nearly) over earlier lines: PDF makers hide part of a ruling
  // that way, for instance under a heading cell that spans two rows.
  const erasers: { seg: Segment; after: number }[] = [];
  const stack: { ctm: M; stroke: number; fill: number }[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  // Brightness (0 black – 1 white) of the stroke and fill colours in force.
  let stroke = 0;
  let fill = 0;
  const bright = (a: unknown[]) => {
    const [r, g, b] = a.map(Number);
    return [r, g, b].every((v) => Number.isFinite(v)) ? (0.299 * r + 0.587 * g + 0.114 * b) / 255 : 0;
  };
  const STROKE = new Set([OPS.stroke, OPS.closeStroke, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  let path: { x: number; y: number }[][] = [];
  let rects: { x0: number; y0: number; x1: number; y1: number }[] = [];
  const PAINT = new Set([OPS.stroke, OPS.closeStroke, OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]);
  const area = vp.width * vp.height;
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push({ ctm, stroke, fill });
    else if (fn === OPS.restore) {
      const st = stack.pop();
      if (st) ({ ctm, stroke, fill } = st);
    } else if (fn === OPS.setStrokeRGBColor) stroke = bright(args);
    else if (fn === OPS.setFillRGBColor) fill = bright(args);
    else if (fn === OPS.transform) ctm = mul(ctm, args as M);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, stroke, fill });
      if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as M);
    } else if (fn === OPS.paintFormXObjectEnd) {
      const st = stack.pop();
      if (st) ({ ctm, stroke, fill } = st);
    }
    else if (fn === OPS.constructPath) {
      const [kinds, coords] = args as [number[], number[]];
      const m = mul(base, ctm);
      let j = 0;
      let sub: { x: number; y: number }[] = [];
      for (const k of kinds) {
        if (k === OPS.rectangle) {
          const [x, y, w, h] = coords.slice(j, j + 4);
          j += 4;
          const a = apply(m, x, y);
          const b = apply(m, x + w, y + h);
          rects.push({ x0: Math.min(a.x, b.x), y0: Math.min(a.y, b.y), x1: Math.max(a.x, b.x), y1: Math.max(a.y, b.y) });
        } else if (k === OPS.moveTo) {
          if (sub.length > 1) path.push(sub);
          sub = [apply(m, coords[j], coords[j + 1])];
          j += 2;
        } else if (k === OPS.lineTo) {
          sub.push(apply(m, coords[j], coords[j + 1]));
          j += 2;
        } else if (k === OPS.curveTo) j += 6;
        else if (k === OPS.curveTo2 || k === OPS.curveTo3) j += 4;
        else if (k === OPS.closePath && sub.length > 1) sub.push(sub[0]);
      }
      if (sub.length > 1) path.push(sub);
    } else if (PAINT.has(fn)) {
      const white = (STROKE.has(fn) ? stroke : fill) > 0.92;
      const out: Segment[] = white ? [] : segments;
      for (const r of rects) {
        const w = r.x1 - r.x0;
        const h = r.y1 - r.y0;
        if (w * h > area * 0.8) continue;
        if (h <= 3 && w > 3) out.push({ x0: r.x0, y0: (r.y0 + r.y1) / 2, x1: r.x1, y1: (r.y0 + r.y1) / 2 });
        else if (w <= 3 && h > 3) out.push({ x0: (r.x0 + r.x1) / 2, y0: r.y0, x1: (r.x0 + r.x1) / 2, y1: r.y1 });
        // A white box is a background, not a frame.
        else if (w > 3 && h > 3 && !white) {
          // A stroked box is drawn lines; a filled one is shading, whose edges may not be cell edges.
          const soft = !STROKE.has(fn) || undefined;
          out.push({ x0: r.x0, y0: r.y0, x1: r.x1, y1: r.y0, soft }, { x0: r.x0, y0: r.y1, x1: r.x1, y1: r.y1, soft }, { x0: r.x0, y0: r.y0, x1: r.x0, y1: r.y1, soft }, { x0: r.x1, y0: r.y0, x1: r.x1, y1: r.y1, soft });
        }
      }
      for (const sub of path)
        for (let k = 1; k < sub.length; k++) {
          const a = sub[k - 1];
          const b = sub[k];
          if (Math.abs(a.y - b.y) < 1 || Math.abs(a.x - b.x) < 1) out.push({ x0: a.x, y0: a.y, x1: b.x, y1: b.y });
        }
      if (white) for (const seg of out) erasers.push({ seg, after: segments.length });
      rects = [];
      path = [];
    } else if (fn === OPS.endPath) {
      rects = [];
      path = [];
    }
  }
  page.cleanup();
  const lines = eraseHidden(segments, erasers);
  const legacyFonts = [...new Set([...fontInfo.values()].map((f) => f.name).filter((n) => LEGACY_FONT.test(n)))];
  // Words some PDFs store in two pieces are joined first, so they are not taken for garbled text.
  joinMarkPieces(words, (w) => ({ x: w.box.x0, y: w.box.y1, size: w.size, text: w.text }), (into, w) => {
    into.text += w.text;
    into.box.x1 = Math.max(into.box.x1, w.box.x1);
  });
  return { page: index, width: vp.width, height: vp.height, words, segments: lines, chars, scripts: mainScripts(allText), legacyFonts, brokenIndic: brokenIndicShare(words.map((w) => w.text).join(' ')) };
}

/** Cuts the parts of lines painted over in white (by a later drawing) out of them. */
function eraseHidden(segments: Segment[], erasers: { seg: Segment; after: number }[]): Segment[] {
  if (!erasers.length) return segments;
  const out: Segment[] = [];
  segments.forEach((s, i) => {
    const horiz = Math.abs(s.y0 - s.y1) < 1;
    const lo = horiz ? Math.min(s.x0, s.x1) : Math.min(s.y0, s.y1);
    const hi = horiz ? Math.max(s.x0, s.x1) : Math.max(s.y0, s.y1);
    // Pieces of [lo, hi] still visible.
    let pieces: [number, number][] = [[lo, hi]];
    for (const { seg: e, after } of erasers) {
      if (after <= i) continue;
      const eh = Math.abs(e.y0 - e.y1) < 1;
      if (eh !== horiz) continue;
      if (horiz ? Math.abs(e.y0 - s.y0) > 1.5 : Math.abs(e.x0 - s.x0) > 1.5) continue;
      const a = (horiz ? Math.min(e.x0, e.x1) : Math.min(e.y0, e.y1)) - 0.6;
      const b = (horiz ? Math.max(e.x0, e.x1) : Math.max(e.y0, e.y1)) + 0.6;
      pieces = pieces.flatMap(([p, q]): [number, number][] => (b <= p || a >= q ? [[p, q]] : ([[p, Math.max(p, a)], [Math.min(q, b), q]] as [number, number][]).filter(([u, v]) => v - u > 1)));
    }
    for (const [p, q] of pieces) out.push(horiz ? { ...s, x0: p, x1: q } : { ...s, y0: p, y1: q });
  });
  return out;
}

/**
 * Straight dark lines in a page picture (table rules of a scan), in page points. With `erase`,
 * the lines are also painted out of the picture: Tesseract's layout step reads a ruled grid as
 * pictures and skips most of the text inside its boxes, while with the lines gone it reads all of it.
 */
export function findRules(canvas: HTMLCanvasElement, scale: number, erase = false): Segment[] {
  const { width: w, height: h } = canvas;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, w, h);
  const px = img.data;
  const dark = new Uint8Array(w * h);
  for (let i = 0, p = 0; i < dark.length; i++, p += 4) dark[i] = px[p] * 0.299 + px[p + 1] * 0.587 + px[p + 2] * 0.114 < 150 ? 1 : 0;
  const minH = Math.max(40, w * 0.04);
  const minV = Math.max(30, h * 0.02);
  const out: Segment[] = [];
  // Horizontal runs, row by row; runs on neighbouring rows are one thick line.
  const hRuns: { y: number; x0: number; x1: number }[] = [];
  for (let y = 0; y < h; y++) {
    let start = -1;
    let gap = 0;
    for (let x = 0; x <= w; x++) {
      const on = x < w && dark[y * w + x] === 1;
      if (on) {
        if (start < 0) start = x;
        gap = 0;
      } else if (start >= 0 && ++gap > 2) {
        const end = x - gap;
        if (end - start >= minH) hRuns.push({ y, x0: start, x1: end });
        start = -1;
        gap = 0;
      }
    }
  }
  const vRuns: { x: number; y0: number; y1: number }[] = [];
  for (let x = 0; x < w; x++) {
    let start = -1;
    let gap = 0;
    for (let y = 0; y <= h; y++) {
      const on = y < h && dark[y * w + x] === 1;
      if (on) {
        if (start < 0) start = y;
        gap = 0;
      } else if (start >= 0 && ++gap > 2) {
        const end = y - gap;
        if (end - start >= minV) vRuns.push({ x, y0: start, y1: end });
        start = -1;
        gap = 0;
      }
    }
  }
  // Runs on neighbouring rows that overlap are one thick line (a band).
  const bands: { y0: number; y1: number; x0: number; x1: number }[] = [];
  let open: typeof bands = [];
  let row = -1;
  let next: typeof bands = [];
  for (const r of hRuns) {
    if (r.y !== row) {
      open = r.y === row + 1 ? next : [];
      next = [];
      row = r.y;
    }
    const b = open.find((o) => Math.min(o.x1, r.x1) - Math.max(o.x0, r.x0) > 0.5 * Math.min(o.x1 - o.x0, r.x1 - r.x0));
    if (b) {
      b.y1 = r.y;
      b.x0 = Math.min(b.x0, r.x0);
      b.x1 = Math.max(b.x1, r.x1);
      next.push(b);
    } else {
      const nb = { y0: r.y, y1: r.y, x0: r.x0, x1: r.x1 };
      bands.push(nb);
      next.push(nb);
    }
  }
  // Bengali, Devanagari and Gurmukhi letters hang from a line drawn along the top of each word,
  // which can be as long as a short rule and touch a cell border. A rule has white space under
  // it (or a second rule, for double borders); a word's top line has letter stems under it.
  const darkShare = (b: (typeof bands)[number], y: number) => {
    if (y < 0 || y >= h) return 0;
    let n = 0;
    for (let x = b.x0; x <= b.x1; x++) n += dark[y * w + x];
    return n / (b.x1 - b.x0 + 1);
  };
  const isRule = (b: (typeof bands)[number]) => {
    let any = 0;
    let cols = 0;
    for (let y = b.y1 + 3; y <= b.y1 + 8; y++) if (darkShare(b, y) > 0.85) return true;
    for (let x = b.x0; x <= b.x1; x++) {
      cols++;
      for (let y = b.y1 + 3; y <= Math.min(h - 1, b.y1 + 8); y++)
        if (dark[y * w + x]) {
          any++;
          break;
        }
    }
    return any / Math.max(1, cols) < 0.3;
  };
  const rules = bands.filter(isRule);
  for (const b of rules) out.push({ x0: b.x0 / scale, y0: (b.y0 + b.y1) / 2 / scale, x1: b.x1 / scale, y1: (b.y0 + b.y1) / 2 / scale });
  for (const r of vRuns) out.push({ x0: r.x / scale, y0: r.y0 / scale, x1: r.x / scale, y1: r.y1 / scale });
  if (erase && (rules.length || vRuns.length)) {
    // White over each line and a pixel either side, which covers its blurred edges.
    const white = (x: number, y: number) => {
      if (x < 0 || y < 0 || x >= w || y >= h) return;
      const p = (y * w + x) * 4;
      px[p] = px[p + 1] = px[p + 2] = 255;
    };
    for (const b of rules) for (let x = b.x0 - 1; x <= b.x1 + 1; x++) for (let y = b.y0 - 1; y <= b.y1 + 1; y++) white(x, y);
    for (const r of vRuns) for (let y = r.y0 - 1; y <= r.y1 + 1; y++) for (let d = -1; d <= 1; d++) white(r.x + d, y);
    ctx.putImageData(img, 0, 0);
  }
  return out;
}

/** Turns a canvas a multiple of 90 degrees (clockwise). */
function rotateCanvas(src: HTMLCanvasElement, deg: number): HTMLCanvasElement {
  if (!deg) return src;
  const out = document.createElement('canvas');
  const quarter = deg % 180 !== 0;
  out.width = quarter ? src.height : src.width;
  out.height = quarter ? src.width : src.height;
  const ctx = out.getContext('2d')!;
  ctx.translate(out.width / 2, out.height / 2);
  ctx.rotate((deg * Math.PI) / 180);
  ctx.drawImage(src, -src.width / 2, -src.height / 2);
  src.width = 0;
  return out;
}

/** Greys with the contrast stretched, which helps OCR on faint or coloured scans. */
function enhance(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
    d[i] = g;
    hist[g | 0]++;
  }
  const total = d.length / 4;
  let lo = 0;
  let hi = 255;
  for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; ) lo++;
  for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; ) hi--;
  // On a page with little text, under 1% of the picture is ink and the darkest 1% is paper:
  // stretching from there would crush the letters into blots. Ink stays at or below 100.
  lo = Math.min(lo, 100);
  const range = Math.max(1, hi - lo);
  for (let i = 0; i < d.length; i += 4) d[i] = d[i + 1] = d[i + 2] = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
  ctx.putImageData(img, 0, 0);
}

export interface OcrChoice {
  /** Tesseract models to use, or 'auto' to detect the script of each page. */
  models: string[] | 'auto';
  onProgress?: (f: number) => void;
}

/** Average certainty of the words with letters: figures read well with any model. */
function letterScore(words: OcrWord[]): number {
  const ws = words.filter((w) => /\p{L}/u.test(w.text));
  return ws.length ? ws.reduce((a, w) => a + w.confidence, 0) / ws.length : 0;
}

/** Indian-script models tried, most used first, when the script of a scan could not be detected. */
const PROBE: [string, Script][] = [
  ['hin', 'Devanagari'],
  ['ben', 'Bengali'],
  ['tam', 'Tamil'],
  ['tel', 'Telugu'],
  ['guj', 'Gujarati'],
  ['kan', 'Kannada'],
  ['mal', 'Malayalam'],
  ['pan', 'Gurmukhi'],
  ['ori', 'Oriya'],
  ['urd', 'Arabic'],
];

/**
 * Finds the model that reads a scan best when its script was not detected: the first lines
 * English could not read are cut out and read with each Indian-script model in turn; the model
 * with the highest certainty wins, if it is clearly sure.
 */
async function probeModel(canvas: HTMLCanvasElement, words: OcrWord[], recognize: (c: HTMLCanvasElement, lang: string) => Promise<OcrResult>): Promise<{ model: string; script: Script } | null> {
  const unread = words.filter((w) => w.confidence < 60 && /\p{L}/u.test(w.text)).sort((a, b) => a.box.y0 - b.box.y0);
  if (unread.length < 2) return null;
  const top = unread[0].box.y0;
  const lineH = Math.max(20, unread[0].box.y1 - unread[0].box.y0);
  const band = unread.filter((w) => w.box.y0 < top + lineH * 5);
  const y0 = Math.max(0, Math.min(...band.map((w) => w.box.y0)) - lineH);
  const y1 = Math.min(canvas.height, Math.max(...band.map((w) => w.box.y1)) + lineH);
  const x0 = Math.max(0, Math.min(...band.map((w) => w.box.x0)) - lineH);
  const x1 = Math.min(canvas.width, Math.max(...band.map((w) => w.box.x1)) + lineH);
  const crop = document.createElement('canvas');
  crop.width = Math.max(1, Math.round(x1 - x0));
  crop.height = Math.max(1, Math.round(y1 - y0));
  crop.getContext('2d')!.drawImage(canvas, x0, y0, crop.width, crop.height, 0, 0, crop.width, crop.height);
  // A model is scored by how many letters it reads and how sure it is of them: a wrong model may
  // be sure of the two or three marks it makes out, but reads few letters.
  const scores: { model: string; script: Script; conf: number; read: number }[] = [];
  for (const [model, script] of PROBE) {
    const ws = (await recognize(crop, model)).words.filter((w) => /\p{L}/u.test(w.text));
    const letters = ws.reduce((a, w) => a + (w.text.match(/\p{L}|\p{M}/gu)?.length ?? 0), 0);
    const read = ws.reduce((a, w) => a + ((w.text.match(/\p{L}|\p{M}/gu)?.length ?? 0) * w.confidence) / 100, 0);
    const conf = letterScore(ws);
    scores.push({ model, script, conf, read });
    if (conf >= 85 && letters >= 10) break;
  }
  crop.width = 0;
  scores.sort((a, b) => b.read - a.read);
  // The right model reads far more letters surely than every other one; a near tie means none fits.
  const [best, second] = scores;
  return best && best.conf >= 50 && (!second || best.read >= 1.5 * second.read) ? best : null;
}

/** A scanned page read with OCR: words with their certainty, and ruling lines from the picture. */
export async function readScannedPage(doc: PdfDoc, index: number, choice: OcrChoice): Promise<PageRead> {
  const { recognize, detectScript } = await import('../ocr');
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  page.cleanup();
  // About 220–300 dpi: what Tesseract reads best, without huge canvases.
  const scale = Math.min(4, 3300 / Math.max(vp.width, vp.height));
  let canvas = await renderPage(doc, index, scale);
  let models = choice.models === 'auto' ? ['eng'] : choice.models;
  let script: string | undefined;
  let rotated = 0;
  // Tesseract's script detection often answers "Common" for Devanagari tables full of figures,
  // and "Latin" for a page in English with some Indian-language words.
  let unsure = false;
  if (choice.models === 'auto') {
    const osd = await detectScript(canvas);
    unsure = !osd || !OSD_SCRIPT[osd.script] || osd.script === 'Latin';
    if (osd) {
      script = osd.script;
      const s = OSD_SCRIPT[osd.script];
      const model = s ? SCRIPT_MODEL[s] : null;
      if (model) models = [...new Set(['eng', model])];
      // Pages scanned sideways or upside down are turned before reading.
      if (osd.rotate && osd.rotateConfidence > 2) {
        rotated = osd.rotate;
        canvas = rotateCanvas(canvas, osd.rotate);
      }
    }
  }
  enhance(canvas);
  const segments = findRules(canvas, scale, true);
  let res = await recognize(canvas, models.join('+'), choice.onProgress);
  if (unsure && letterScore(res.words) < 75) {
    const found = await probeModel(canvas, res.words, recognize);
    if (found) {
      models = ['eng', found.model];
      script = script === 'Latin' ? `Latin and ${found.script}` : found.script;
      res = await recognize(canvas, models.join('+'), choice.onProgress);
    } else if (script !== 'Latin') script = undefined;
  }
  const width = canvas.width / scale;
  const height = canvas.height / scale;
  canvas.width = 0;
  const words: Word[] = res.words.flatMap((w) => {
    // A bit of a table line left at a word's edge is read as "|". Tesseract also ends some
    // Indian-language words with an invisible joiner (Tamil "எண்" + U+200C), which is dropped.
    // The Devanagari models read the rupee sign as "र"; a lone "र" in brackets or before a
    // figure is never a word.
    const raw = w.text
      .replace(/[‌‍]+$/, '')
      .replace(/^\(र\)$/, '(₹)')
      .replace(/^र(?=[\d,.]+$)/, '₹');
    const text = segments.length ? raw.replace(/^[|[\]]+|[|[\]]+$/g, '') : raw;
    if (!text) return [];
    const size = (w.line?.height ?? (w.box.y1 - w.box.y0) * 0.8) / scale;
    return { text, box: { x0: w.box.x0 / scale, y0: w.box.y0 / scale, x1: w.box.x1 / scale, y1: w.box.y1 / scale }, size: Math.max(4, size), conf: Math.round(w.confidence) };
  });
  return {
    page: index,
    width,
    height,
    words,
    segments,
    scanned: true,
    chars: words.reduce((n, w) => n + w.text.length, 0),
    scripts: mainScripts(words.map((w) => w.text).join(' ')),
    legacyFonts: [],
    brokenIndic: 0,
    ocr: { models, confidence: res.confidence, script, rotated },
  };
}

const INDIC: Script[] = ['Devanagari', 'Bengali', 'Gurmukhi', 'Gujarati', 'Oriya', 'Tamil', 'Telugu', 'Kannada', 'Malayalam'];

/** What has been learnt about a document's Indian-language text layer, page after page. */
export interface IndicCheck {
  checked: number;
  trust?: boolean;
  distrust?: boolean;
}

/** Indian-script letters. */
const INDIC_CHAR = /[ऀ-෿]/;

/**
 * Indian-language text the PDF stored wrongly, put right from OCR of the same page: each piece
 * of such text (a word, or a span of the page's text) takes the OCR words printed in its place.
 * Everything else stays as the PDF has it: English text, figures, fonts, colours and lines.
 */
export function patchIndic<T>(items: T[], ocr: Word[], get: (t: T) => { text: string; box: Box }, set: (t: T, text: string) => void): number {
  const free = new Set(ocr.filter((w) => w.text.trim()));
  // Where OCR text went in (its boxes, and the boxes of the pieces it replaced).
  const placed: Box[] = [];
  const replaced: Box[] = [];
  const missed: T[] = [];
  let patched = 0;
  for (const it of items) {
    const { text, box } = get(it);
    if (!INDIC_CHAR.test(text)) continue;
    const h = box.y1 - box.y0;
    const inside = [...free].filter((w) => {
      const cx = (w.box.x0 + w.box.x1) / 2;
      const cy = (w.box.y0 + w.box.y1) / 2;
      // English words are never taken from OCR: the PDF's own English text is right.
      const latinOnly = /[A-Za-z]/.test(w.text) && !INDIC_CHAR.test(w.text);
      return !latinOnly && cx >= box.x0 - 1.5 && cx <= box.x1 + 1.5 && cy >= box.y0 - h * 0.15 && cy <= box.y1 + h * 0.15;
    });
    if (!inside.length) {
      missed.push(it);
      continue;
    }
    inside.sort((a, b) => a.box.x0 - b.box.x0);
    for (const w of inside) free.delete(w);
    // OCR replaces a piece only where it reads with confidence (it misreads large or decorative
    // letters too), and then when the piece's letters come in an impossible order or differ
    // from what OCR reads there.
    const own = text.trim();
    // Stray figures or marks OCR reads beside a word without any are noise.
    const read = /[\d\p{P}]/u.test(own) ? inside : inside.filter((w) => INDIC_CHAR.test(w.text));
    if (!read.length) continue;
    const sure = read.reduce((a, w) => a + (w.conf ?? 100), 0) / read.length >= 70;
    // OCR that read much less than the piece holds missed part of it.
    const letters = (s: string) => s.replace(/[\s\p{P}]/gu, '').length;
    const partial = letters(read.map((w) => w.text).join('')) < letters(own) * 0.6;
    if (!sure || partial || (!hasBrokenIndic(own) && indicAgreement(own, read.map((w) => w.text).join(' ')) >= 0.95)) continue;
    const lead = /^\s/.test(text) ? ' ' : '';
    const tail = /\s$/.test(text) ? ' ' : '';
    set(it, lead + read.map((w) => w.text).join(' ') + tail);
    placed.push(...read.map((w) => w.box));
    replaced.push(box);
    patched++;
  }
  // A word the PDF split into pieces went to the piece holding its middle; its other pieces
  // (under the OCR word, or touching the replaced piece on the same line) would repeat bits of
  // it, so they are emptied.
  for (const it of missed) {
    const { text, box } = get(it);
    const w = Math.max(0.1, box.x1 - box.x0);
    const h = Math.max(0.1, box.y1 - box.y0);
    const sameLine = (p: Box) => Math.min(p.y1, box.y1) - Math.max(p.y0, box.y0) > h * 0.4;
    const under = placed.some((p) => Math.min(p.x1, box.x1) - Math.max(p.x0, box.x0) > w * 0.5 && sameLine(p));
    const touching = !/\s/.test(text.trim()) && replaced.some((p) => sameLine(p) && box.x0 <= p.x1 + h * 0.25 && box.x1 >= p.x0 - h * 0.25);
    if (under || touching) set(it, '');
  }
  return patched;
}

/**
 * Reads a page that has real text: its own text, unless that text is Indian-language text the
 * program that made the PDF stored wrongly. Some programs store shaped letters in an order or
 * mapping that does not give the original words back ("बिजली" comes out as "किजली"). Such text is
 * found by impossible letter sequences, or by comparing the first few pages with OCR of the same
 * pages; when it is unreliable, the page is read with OCR and its Indian-language words are taken
 * from there (`ocr` holds the OCR words, for callers that have text of their own to put right).
 */
export async function readTextPage(doc: PdfDoc, index: number, digital: PageRead, state: IndicCheck, choice: OcrChoice): Promise<{ read: PageRead; reason?: string; ocr?: Word[] }> {
  const indic = digital.scripts.filter((s) => INDIC.includes(s));
  if (!indic.length) return { read: digital };
  const models = choice.models === 'auto' ? [...new Set(['eng', ...indic.map((s) => SCRIPT_MODEL[s]).filter((m): m is string => !!m)])] : choice.models;
  const ocr = () => readScannedPage(doc, index, { models, onProgress: choice.onProgress });
  const names = indic.join(', ');
  // The page as the PDF has it, with its Indian-language words read from the print instead.
  const fixed = (scanned: PageRead) => {
    const words = digital.words.map((w) => ({ ...w }));
    patchIndic(words, scanned.words, (w) => ({ text: w.text, box: w.box }), (w, t) => (w.text = t));
    return { read: { ...digital, words, brokenIndic: 0 }, ocr: scanned.words };
  };
  if (digital.brokenIndic > 0.05) {
    state.distrust = true;
    return { ...fixed(await ocr()), reason: `Page ${index + 1}: the PDF stores its ${names} text with letters out of order (${Math.round(digital.brokenIndic * 100)}% of words), so that text was read from the page with OCR.` };
  }
  if (state.distrust) return { ...fixed(await ocr()), reason: `Page ${index + 1}: its ${names} text was read with OCR, as this PDF's own proved unreliable on an earlier page.` };
  if (state.trust || state.checked >= 3) return { read: digital };
  // Check the PDF's own text against OCR of the same page.
  const scanned = await ocr();
  state.checked++;
  const agree = indicAgreement(digital.words.map((w) => w.text).join(' '), scanned.words.map((w) => w.text).join(' '));
  // Measured: correct text layers agree with OCR at 0.89–1.0, misstored ones at 0.69–0.80.
  if (agree < 0.85) {
    state.distrust = true;
    return { ...fixed(scanned), reason: `Page ${index + 1}: the PDF's own ${names} text does not match what is printed (only ${Math.round(agree * 100)}% agreement with OCR), so that text was read with OCR.` };
  }
  if (agree >= 0.95) state.trust = true;
  return { read: digital };
}
