/**
 * Reads what a PDF page holds with pdf.js: each piece of text with its position, size and font,
 * and each picture with its place on the page. Scanned pages (a picture of text) can be read
 * with OCR instead. Browser only.
 */
import { openPdf, renderPage, type PdfDoc } from '../render';
import type { PageImage, PageIn, Span } from './layout';
import { wordFont } from './layout';

type PdfPage = Awaited<ReturnType<PdfDoc['getPage']>>;
type M = [number, number, number, number, number, number];

const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export { openPdf };

/** Characters of real text on each page, to find scanned pages before converting. */
export async function textPerPage(doc: PdfDoc): Promise<number[]> {
  const counts: number[] = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const tc = await page.getTextContent();
    counts.push(tc.items.reduce((n, it) => n + ('str' in it ? it.str.replace(/\s/g, '').length : 0), 0));
    page.cleanup();
  }
  return counts;
}

/** A page with so little text is treated as a scan. */
export const SCANNED_BELOW = 12;

interface Raw {
  data?: Uint8ClampedArray | Uint8Array;
  bitmap?: ImageBitmap;
  width: number;
  height: number;
  kind?: number;
}

function objectOf(page: PdfPage, id: string): Promise<Raw | null> {
  const store = id.startsWith('g_') ? page.commonObjs : page.objs;
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), 4000);
    store.get(id, (d: unknown) => {
      clearTimeout(timer);
      resolve((d as Raw) ?? null);
    });
  });
}

/** Draws a pdf.js image object, reduced to what its size on the page needs at 200 dpi. */
async function encodeImage(raw: Raw, boxW: number, boxH: number): Promise<{ bytes: Uint8Array; type: 'png' | 'jpeg' } | null> {
  const { width, height } = raw;
  if (!width || !height) return null;
  const src = document.createElement('canvas');
  src.width = width;
  src.height = height;
  const sctx = src.getContext('2d', { willReadFrequently: true })!;
  if (raw.bitmap) sctx.drawImage(raw.bitmap, 0, 0);
  else if (raw.data) {
    const img = sctx.createImageData(width, height);
    const d = img.data;
    const s = raw.data;
    if (raw.kind === 3) d.set(s.subarray(0, d.length));
    else if (raw.kind === 2) for (let i = 0, j = 0; j < d.length; i += 3, j += 4) [d[j], d[j + 1], d[j + 2], d[j + 3]] = [s[i], s[i + 1], s[i + 2], 255];
    else if (raw.kind === 1) {
      const row = (width + 7) >> 3;
      for (let y = 0; y < height; y++)
        for (let x = 0; x < width; x++) {
          const v = (s[y * row + (x >> 3)] >> (7 - (x & 7))) & 1 ? 255 : 0;
          const j = (y * width + x) * 4;
          d[j] = d[j + 1] = d[j + 2] = v;
          d[j + 3] = 255;
        }
    } else return null;
    sctx.putImageData(img, 0, 0);
  } else return null;

  const scale = Math.min(1, Math.max((boxW * 200) / 72 / width, (boxH * 200) / 72 / height));
  const out = document.createElement('canvas');
  out.width = Math.max(1, Math.round(width * scale));
  out.height = Math.max(1, Math.round(height * scale));
  const octx = out.getContext('2d', { willReadFrequently: true })!;
  octx.imageSmoothingQuality = 'high';
  octx.drawImage(src, 0, 0, out.width, out.height);
  src.width = 0;
  const px = octx.getImageData(0, 0, out.width, out.height).data;
  let clear = false;
  for (let i = 3; i < px.length; i += 4)
    if (px[i] < 250) {
      clear = true;
      break;
    }
  // Photos as JPG keep the document small; anything with transparency or few pixels stays PNG.
  const type = !clear && out.width * out.height > 40000 ? 'jpeg' : 'png';
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, type === 'jpeg' ? 'image/jpeg' : 'image/png', 0.88));
  out.width = 0;
  return blob ? { bytes: new Uint8Array(await blob.arrayBuffer()), type } : null;
}

export interface ReadPage extends PageIn {
  /** True when every piece of text is invisible: a scan with a hidden OCR layer. */
  hiddenText: boolean;
}

/** Text and pictures of one page (index from 0). */
export async function readPage(doc: PdfDoc, index: number): Promise<ReadPage> {
  const { OPS, Util } = await import('pdfjs-dist');
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  const base = vp.transform as M;
  const ops = await page.getOperatorList();
  const tc = await page.getTextContent();

  const spans: Span[] = [];
  /** Where each span's first character sits among all drawn characters, to look up its colour. */
  const starts: number[] = [];
  let chars = 0;
  const fonts = new Map<string, { family: string; bold: boolean; italic: boolean }>();
  for (const it of tc.items) {
    if (!('str' in it) || !it.str) continue;
    const start = chars;
    chars += it.str.replace(/\s/g, '').length;
    const m = Util.transform(base, it.transform) as M;
    const size = Math.hypot(m[2], m[3]);
    // Rotated text (stamps, watermarks, vertical labels) is left out of the flowing text.
    if (size < 1 || Math.abs(m[1]) > Math.abs(m[0]) * 0.18) continue;
    let f = fonts.get(it.fontName);
    if (!f) {
      const style = tc.styles[it.fontName];
      const generic = /serif/i.test(style?.fontFamily ?? '') && !/sans/i.test(style?.fontFamily ?? '') ? 'serif' : /mono/i.test(style?.fontFamily ?? '') ? 'monospace' : 'sans-serif';
      let obj: { name?: string; bold?: boolean; black?: boolean; italic?: boolean } | null = null;
      try {
        if (page.commonObjs.has(it.fontName)) obj = page.commonObjs.get(it.fontName);
      } catch {
        obj = null;
      }
      const w = wordFont(obj?.name ?? '', generic);
      f = { family: w.family, bold: w.bold || !!obj?.bold || !!obj?.black, italic: w.italic || !!obj?.italic };
      fonts.set(it.fontName, f);
    }
    spans.push({ str: it.str, x: m[4], y: m[5], w: it.width * (Math.hypot(m[0], m[1]) / Math.max(1e-6, Math.hypot(it.transform[0], it.transform[1]))) || it.width, size, font: f.family, bold: f.bold, italic: f.italic });
    starts.push(start);
  }

  // Walk the drawing instructions for pictures, text colours and whether the text is visible.
  const images: PageImage[] = [];
  const stack: { ctm: M; mode: number; fill: string }[] = [];
  let ctm: M = [1, 0, 0, 1, 0, 0];
  let mode = 0;
  let fill = '000000';
  let visibleText = 0;
  let hidden = 0;
  /** Colour of each drawn character (spaces left out), in drawing order. */
  const charColours: string[] = [];
  const pending: { raw: Promise<Raw | null> | Raw; box: { x: number; y: number; w: number; h: number } }[] = [];
  for (let i = 0; i < ops.fnArray.length; i++) {
    const fn = ops.fnArray[i];
    const args = ops.argsArray[i];
    if (fn === OPS.save) stack.push({ ctm, mode, fill });
    else if (fn === OPS.restore) ({ ctm, mode, fill } = stack.pop() ?? { ctm, mode, fill });
    else if (fn === OPS.transform) ctm = mul(ctm, args as M);
    else if (fn === OPS.paintFormXObjectBegin) {
      stack.push({ ctm, mode, fill });
      if (Array.isArray(args[0]) && args[0].length === 6) ctm = mul(ctm, args[0] as M);
    } else if (fn === OPS.paintFormXObjectEnd) ({ ctm, mode, fill } = stack.pop() ?? { ctm, mode, fill });
    else if (fn === OPS.setTextRenderingMode) mode = args[0] as number;
    else if (fn === OPS.setFillRGBColor) fill = (Array.from(args).slice(0, 3) as number[]).map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase();
    else if (fn === OPS.showText || fn === OPS.showSpacedText || fn === OPS.nextLineShowText || fn === OPS.nextLineSetSpacingShowText) {
      if (mode === 3 || mode === 7) hidden++;
      else visibleText++;
      const glyphs = (args.find((a: unknown) => Array.isArray(a)) ?? []) as ({ unicode?: string } | number | null)[];
      // Counted in UTF-16 units, the same way the text pieces are counted.
      for (const g of glyphs) if (g && typeof g === 'object' && g.unicode) for (let k = g.unicode.replace(/\s/g, '').length; k > 0; k--) charColours.push(fill);
    } else if (fn === OPS.paintImageXObject || fn === OPS.paintInlineImageXObject) {
      const m = mul(base, ctm);
      const xs = [m[4], m[0] + m[4], m[2] + m[4], m[0] + m[2] + m[4]];
      const ys = [m[5], m[1] + m[5], m[3] + m[5], m[1] + m[3] + m[5]];
      const box = { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) };
      // Skip specks and anything off the page.
      if (box.w < 4 || box.h < 4 || box.x > vp.width || box.y > vp.height || box.x + box.w < 0 || box.y + box.h < 0) continue;
      const raw = fn === OPS.paintImageXObject ? objectOf(page, args[0] as string) : (args[0] as Raw);
      pending.push({ raw, box });
    }
  }
  for (const p of pending.slice(0, 200)) {
    const raw = await p.raw;
    if (!raw) continue;
    try {
      const enc = await encodeImage(raw, p.box.w, p.box.h);
      if (enc) images.push({ ...p.box, ...enc });
    } catch {
      // A picture that cannot be read is left out; the text still converts.
    }
  }
  // Lines, boxes, table borders and coloured bands: one picture behind the text.
  try {
    const layer = await graphicsLayer(page, vp.width);
    if (layer) images.unshift(layer);
  } catch {
    // Without it the text and pictures still convert.
  }

  // Text colour: the fill colour when the span's first character was drawn (black is the default).
  spans.forEach((s, i) => {
    const c = charColours[starts[i]];
    if (c && c !== '000000') s.color = c;
  });
  page.cleanup();
  return { width: vp.width, height: vp.height, spans, images, hiddenText: hidden > 0 && visibleText === 0 };
}

/**
 * Draws the page with text and pictures switched off, leaving what is drawn with lines and fills.
 * Returns that as a picture cropped to where something was drawn, or null for a blank result.
 */
async function graphicsLayer(page: PdfPage, pageWidth: number): Promise<PageImage | null> {
  if (typeof document === 'undefined') return null;
  const scale = Math.min(2, 2400 / pageWidth);
  const vp = page.getViewport({ scale });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(vp.width);
  canvas.height = Math.ceil(vp.height);
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Text is written separately and pictures are extracted at full quality, so neither is drawn here.
  ctx.fillText = () => undefined;
  ctx.strokeText = () => undefined;
  ctx.drawImage = () => undefined;
  await page.render({ canvasContext: ctx, viewport: vp }).promise;

  const { width: w, height: h } = canvas;
  const px = ctx.getImageData(0, 0, w, h).data;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < h; y++) {
    const row = y * w * 4;
    for (let x = 0; x < w; x++) {
      const i = row + x * 4;
      if (px[i] < 245 || px[i + 1] < 245 || px[i + 2] < 245) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        y1 = y;
      }
    }
  }
  if (x1 < 0 || (x1 - x0 < 2 && y1 - y0 < 2)) {
    canvas.width = 0;
    return null;
  }
  const out = document.createElement('canvas');
  out.width = x1 - x0 + 1;
  out.height = y1 - y0 + 1;
  out.getContext('2d')!.putImageData(ctx.getImageData(x0, y0, out.width, out.height), 0, 0);
  canvas.width = 0;
  const blob = await new Promise<Blob | null>((r) => out.toBlob(r, 'image/png'));
  out.width = 0;
  if (!blob) return null;
  return { x: x0 / scale, y: y0 / scale, w: (x1 - x0 + 1) / scale, h: (y1 - y0 + 1) / scale, bytes: new Uint8Array(await blob.arrayBuffer()), type: 'png', graphics: true };
}

/** Reads a scanned page with OCR into the same positioned pieces of text. */
export async function ocrPage(doc: PdfDoc, index: number, lang: import('@/lib/ocr').OcrLang, onProgress?: (f: number) => void): Promise<PageIn> {
  const { recognize } = await import('@/lib/ocr');
  const page = await doc.getPage(index + 1);
  const vp = page.getViewport({ scale: 1 });
  // About 220 dpi, which Tesseract reads well, without huge canvases for poster-sized pages.
  const scale = Math.min(3, 3200 / Math.max(vp.width, vp.height));
  const canvas = await renderPage(doc, index, scale);
  const res = await recognize(canvas, lang, onProgress);
  canvas.width = 0;
  const spans: Span[] = res.words.map((w) => {
    const base = w.line?.baseline ?? w.box.y1;
    const size = (w.line?.height ?? (w.box.y1 - w.box.y0) * 0.8) / scale;
    // Each OCR word is a word: the trailing space keeps "of April" apart even when the ink nearly touches.
    return { str: `${w.text} `, x: w.box.x0 / scale, y: base / scale, w: (w.box.x1 - w.box.x0) / scale, size: Math.max(4, Math.round(size * 2) / 2), font: 'Arial', bold: false, italic: false };
  });
  return { width: vp.width, height: vp.height, spans, images: [] };
}
