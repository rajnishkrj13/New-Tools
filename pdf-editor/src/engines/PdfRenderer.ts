import * as pdfjs from 'pdfjs-dist';
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { DocumentInfo, PageInfo, Rect } from '../types/pdf';
import { makePageInfo } from './CoordinateMapper';
import { analyzeOperatorList, type TextOpInfo } from './TextRemover';

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
