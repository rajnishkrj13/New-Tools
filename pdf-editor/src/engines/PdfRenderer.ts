import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentInfo, PageInfo, Rect } from '../types/pdf';
import { applyMatrix, makePageInfo } from './CoordinateMapper';
import { analyzeOperatorList, type TextOpInfo } from './TextRemover';
import { analyzeImageOps, type PageImage } from './PdfImages';
import type { ImageAsset } from '../types/objects';
import { canvasToAsset } from '../utils/imageUtils';

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

/**
 * Open PDF.js documents by source id: "main" is the document being edited, other ids are
 * PDFs whose pages were added to it. Kept outside React state (not serialisable).
 */
const docs = new Map<string, PDFDocumentProxy>();

/** Canvases of the pages currently on screen (by page id), used to sample text / background colours. */
export const pageCanvases = new Map<string, HTMLCanvasElement>();

export class PdfLoadError extends Error {}

async function parse(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  try {
    // PDF.js transfers the buffer to its worker, so it gets a private copy.
    return await pdfjs.getDocument({
      data: bytes.slice(),
      cMapUrl: `${import.meta.env.BASE_URL}pdfjs/cmaps/`,
      cMapPacked: true,
      standardFontDataUrl: `${import.meta.env.BASE_URL}pdfjs/standard_fonts/`,
      isEvalSupported: false,
    }).promise;
  } catch (e: any) {
    const name = e?.name ?? '';
    if (name === 'PasswordException') {
      throw new PdfLoadError('This PDF is password-protected. Remove the password in the application that created it, then open it again.');
    }
    if (name === 'InvalidPDFException' || name === 'FormatError') {
      throw new PdfLoadError('This file is not a valid PDF or it is corrupted and cannot be read.');
    }
    if (name === 'MissingPDFException') throw new PdfLoadError('The PDF file is empty or could not be read.');
    throw new PdfLoadError(`The PDF could not be opened: ${e?.message ?? 'unknown error'}`);
  }
}

export async function closeAllPdfs() {
  const all = [...docs.values()];
  docs.clear();
  pageImages.clear();
  pageCanvases.clear();
  await Promise.all(all.map((d) => d.destroy().catch(() => undefined)));
}

/** Opens the document to edit. The one that is open now is only replaced once the new one has loaded. */
export async function loadPdf(bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const next = await parse(bytes);
  await closeAllPdfs();
  docs.set('main', next);
  return next;
}

/** Opens another PDF whose pages can be added to the document. */
export async function openSource(id: string, bytes: Uint8Array): Promise<PDFDocumentProxy> {
  const doc = await parse(bytes);
  docs.set(id, doc);
  return doc;
}

/** Geometry of every page of a loaded source. */
export async function readPages(doc: PDFDocumentProxy, source: string): Promise<PageInfo[]> {
  const pages: PageInfo[] = [];
  for (let i = 0; i < doc.numPages; i++) {
    const page: any = await doc.getPage(i + 1);
    pages.push(
      makePageInfo(
        { id: `${source}:${i}`, source, srcIndex: i, viewBox: [...page.view] as PageInfo['viewBox'], userUnit: page.userUnit || 1, baseRotation: page.rotate || 0 },
        i,
      ),
    );
  }
  return pages;
}

export async function readDocument(doc: PDFDocumentProxy, fileName: string, fileSize: number) {
  const pages = await readPages(doc, 'main');
  const meta: any = await doc.getMetadata().catch(() => null);
  const info: DocumentInfo = {
    fileName,
    fileSize,
    numPages: doc.numPages,
    title: meta?.info?.Title || undefined,
    author: meta?.info?.Author || undefined,
    producer: meta?.info?.Producer || undefined,
    pdfVersion: meta?.info?.PDFFormatVersion || undefined,
    exportable: true,
  };
  return { info, pages };
}

/** The PDF.js page behind an editor page, or null for a blank page. */
export async function getPdfPage(info: PageInfo): Promise<PDFPageProxy | null> {
  if (info.source === 'blank') return null;
  const doc = docs.get(info.source);
  if (!doc) throw new Error('The source document of this page is no longer open.');
  return doc.getPage(info.srcIndex + 1);
}

/** Where every glyph of a page's own text operators is drawn; used to delete edited text for real. */
export async function analyzeTextOps(info: PageInfo): Promise<TextOpInfo[] | null> {
  const page: any = await getPdfPage(info);
  if (!page) return null;
  const list = await page.getOperatorList();
  return analyzeOperatorList(list, pdfjs.OPS as unknown as Record<string, number>, info.viewTransform, (name) => {
    for (const objs of [page.commonObjs, page.objs]) {
      try {
        if (objs?.has(name)) {
          const f = objs.get(name);
          return { fontMatrix0: f?.fontMatrix?.[0] ?? 0.001, vertical: !!f?.vertical };
        }
      } catch {
        /* not resolved */
      }
    }
    return null;
  });
}

const pageImages = new Map<string, Promise<PageImage[]>>();

/** The pictures a page paints itself, with their place on screen. Empty for blank pages. */
export function findPageImages(info: PageInfo): Promise<PageImage[]> {
  const key = `${info.id}r${info.rotation}`;
  let p = pageImages.get(key);
  if (!p) {
    p = getPdfPage(info)
      .then(async (page: any) => (page ? analyzeImageOps(await page.getOperatorList(), pdfjs.OPS as unknown as Record<string, number>, info.viewTransform) : []))
      .catch(() => {
        pageImages.delete(key);
        return [];
      });
    pageImages.set(key, p);
  }
  return p;
}

/** Draws a picture decoded by PDF.js (a bitmap or raw pixels) into a canvas; null when it is empty or unknown. */
function decodedToCanvas(img: any): HTMLCanvasElement | null {
  const width = img?.bitmap?.width ?? img?.width;
  const height = img?.bitmap?.height ?? img?.height;
  if (!width || !height || !(img.bitmap || img.data)) return null;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d')!;
  if (img.bitmap) {
    ctx.drawImage(img.bitmap, 0, 0);
    return canvas;
  }
  // Raw pixels: 1 = 1-bit gray, 2 = RGB, 3 = RGBA (PDF.js ImageKind).
  const out = ctx.createImageData(width, height);
  const src: Uint8Array | Uint8ClampedArray = img.data;
  if (img.kind === 3) out.data.set(src.subarray(0, out.data.length));
  else if (img.kind === 2) {
    for (let i = 0, j = 0; j < out.data.length; i += 3, j += 4) {
      out.data[j] = src[i];
      out.data[j + 1] = src[i + 1];
      out.data[j + 2] = src[i + 2];
      out.data[j + 3] = 255;
    }
  } else {
    const rowBytes = (width + 7) >> 3;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const v = src[y * rowBytes + (x >> 3)] & (0x80 >> (x & 7)) ? 255 : 0;
        const j = (y * width + x) * 4;
        out.data[j] = out.data[j + 1] = out.data[j + 2] = v;
        out.data[j + 3] = 255;
      }
    }
  }
  ctx.putImageData(out, 0, 0);
  return canvas;
}

/**
 * Copies a decoded picture of a page into an image asset.
 *
 * PDF.js gives a picture a new object id every time it reads the page, and throws the
 * decoded pictures of a page away after drawing it when they are large. So the picture is
 * looked up by its position (`key`) in an operator list that is current, it is copied the
 * moment PDF.js hands it over, and when its data is gone the page is read again.
 */
export async function extractPageImage(info: PageInfo, key: string, name: string): Promise<ImageAsset> {
  const page: any = await getPdfPage(info);
  if (!page) throw new Error('This page has no pictures.');
  let canvas: HTMLCanvasElement | null = null;
  for (let attempt = 0; attempt < 3 && !canvas; attempt++) {
    const list = await page.getOperatorList();
    const found = analyzeImageOps(list, pdfjs.OPS as unknown as Record<string, number>, info.viewTransform).find((i) => i.key === key);
    if (!found) throw new Error('This picture is no longer on the page.');
    const objs = found.objId.startsWith('g_') ? page.commonObjs : page.objs;
    canvas = await Promise.race([
      new Promise<HTMLCanvasElement | null>((resolve) => {
        try {
          objs.get(found.objId, (img: any) => {
            try {
              resolve(decodedToCanvas(img));
            } catch {
              resolve(null);
            }
          });
        } catch {
          resolve(null);
        }
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 4000)),
    ]);
    // Forget what PDF.js kept for this page, so the next round decodes the pictures again.
    if (!canvas) page.cleanup();
  }
  if (!canvas) throw new Error('The picture could not be read from the PDF.');
  try {
    return await canvasToAsset(canvas, name);
  } finally {
    release(canvas);
  }
}

const MAX_PIXELS = 16_000_000;

export interface RenderHandle {
  promise: Promise<HTMLCanvasElement | null>;
  cancel: () => void;
}

/**
 * Renders a page into an off-screen canvas at `scale` CSS px per point times the device
 * pixel ratio, with the rotation the editor shows. Resolves to null when cancelled, so a
 * stale zoom level never wins. A blank page (no PDF.js page) is a white canvas.
 */
export function renderPage(page: PDFPageProxy | null, info: PageInfo, scale: number, dpr = window.devicePixelRatio || 1): RenderHandle {
  let ratio = scale * dpr;
  const pixels = info.width * info.height * ratio * ratio;
  if (pixels > MAX_PIXELS) ratio *= Math.sqrt(MAX_PIXELS / pixels);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(info.width * ratio));
  canvas.height = Math.max(1, Math.floor(info.height * ratio));
  const ctx = canvas.getContext('2d', { alpha: false })!;
  if (!page) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    return { promise: Promise.resolve(canvas), cancel: () => undefined };
  }
  // PDF.js applies userUnit itself; info.width already includes it.
  const viewport = page.getViewport({ scale: ratio, rotation: info.rotation });
  const task = page.render({ canvasContext: ctx, viewport });
  let cancelled = false;
  const promise = task.promise.then(
    () => (cancelled ? release(canvas) : canvas),
    (e: any) => {
      release(canvas);
      if (cancelled || e?.name === 'RenderingCancelledException') return null;
      throw e;
    },
  );
  return {
    promise,
    cancel: () => {
      cancelled = true;
      task.cancel();
    },
  };
}

/** Frees the bitmap memory of a canvas immediately instead of waiting for GC. */
export function release(canvas: HTMLCanvasElement | null): null {
  if (canvas) {
    canvas.width = 0;
    canvas.height = 0;
  }
  return null;
}

/**
 * Renders a page to a PNG with black boxes burned in. Used for secure redaction: the
 * exported page is this image, so nothing under the boxes survives in the file.
 */
export async function rasterizePage(info: PageInfo, redactions: Rect[]): Promise<Uint8Array> {
  const page = await getPdfPage(info);
  const canvas = await renderPage(page, info, 200 / 72, 1).promise;
  if (!canvas) throw new Error('Page rendering was interrupted');
  const k = canvas.width / info.width;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#000000';
  for (const r of redactions) ctx.fillRect(r.x * k, r.y * k, r.width * k, r.height * k);
  const blob: Blob | null = await new Promise((res) => canvas.toBlob(res, 'image/png'));
  release(canvas);
  if (!blob) throw new Error('The page could not be converted to an image');
  return new Uint8Array(await blob.arrayBuffer());
}

/** Upright view-space box of an annotation rectangle given in PDF user space. */
function annotationBox(info: PageInfo, rect: number[]): Rect {
  const [ax, ay] = applyMatrix(info.viewTransform, rect[0], rect[1]);
  const [bx, by] = applyMatrix(info.viewTransform, rect[2], rect[3]);
  return { x: Math.min(ax, bx), y: Math.min(ay, by), width: Math.abs(bx - ax), height: Math.abs(by - ay) };
}

export interface PageLink extends Rect {
  /** Annotation reference in the source file, for example "12R". */
  ref: string;
  url: string;
}

/** Web links the original page already has. Only pages of the main document can have theirs edited. */
export async function findPageLinks(info: PageInfo): Promise<PageLink[]> {
  if (info.source !== 'main') return [];
  try {
    const page = await getPdfPage(info);
    const annots: any[] = page ? await page.getAnnotations() : [];
    return annots
      .filter((a) => a.subtype === 'Link' && (a.url || a.unsafeUrl) && Array.isArray(a.rect))
      .map((a) => ({ ...annotationBox(info, a.rect), ref: String(a.id), url: String(a.url || a.unsafeUrl) }));
  } catch {
    return [];
  }
}

export interface PageFormField extends Rect {
  /** Unique per widget (a radio group has one widget per choice). */
  key: string;
  name: string;
  kind: 'text' | 'checkbox' | 'radio' | 'choice';
  /** Value stored in the file. */
  value: string | boolean;
  /** For radio buttons and check boxes: the value this widget stands for. */
  exportValue: string;
  options: { value: string; label: string }[];
  multiline: boolean;
  readOnly: boolean;
}

/** Fillable fields the original page already has (main document only). */
export async function findFormFields(info: PageInfo): Promise<PageFormField[]> {
  if (info.source !== 'main') return [];
  try {
    const page = await getPdfPage(info);
    const annots: any[] = page ? await page.getAnnotations() : [];
    const out: PageFormField[] = [];
    for (const a of annots) {
      if (a.subtype !== 'Widget' || !a.fieldName || !Array.isArray(a.rect) || a.pushButton || a.hidden) continue;
      const base = { ...annotationBox(info, a.rect), key: String(a.id), name: String(a.fieldName), readOnly: !!a.readOnly, multiline: !!a.multiLine };
      const exportValue = String(a.exportValue ?? a.buttonValue ?? 'Yes');
      if (a.fieldType === 'Tx') out.push({ ...base, kind: 'text', value: String(a.fieldValue ?? ''), exportValue: '', options: [] });
      else if (a.fieldType === 'Btn' && a.checkBox) out.push({ ...base, kind: 'checkbox', value: !!a.fieldValue && a.fieldValue !== 'Off', exportValue, options: [] });
      else if (a.fieldType === 'Btn' && a.radioButton) out.push({ ...base, kind: 'radio', value: String(a.fieldValue ?? ''), exportValue, options: [] });
      else if (a.fieldType === 'Ch') {
        const value = Array.isArray(a.fieldValue) ? String(a.fieldValue[0] ?? '') : String(a.fieldValue ?? '');
        const options = (a.options ?? []).map((o: any) => ({ value: String(o.exportValue ?? o.displayValue), label: String(o.displayValue ?? o.exportValue) }));
        out.push({ ...base, kind: 'choice', value, exportValue: '', options });
      }
    }
    return out;
  } catch {
    return [];
  }
}
