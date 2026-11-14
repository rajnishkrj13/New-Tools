import type { PageInfo } from '../types/pdf';
import type { RawTextItem } from '../types/text';
import { getPdfPage, release, renderPage } from './PdfRenderer';

/**
 * Text recognition (OCR) for scanned pages, with Tesseract compiled to WebAssembly.
 * The engine and the language data are served by the app itself (public/ocr), so pages
 * are recognised on this device and nothing is sent anywhere.
 */

export type OcrLanguage = 'eng' | 'hin' | 'eng+hin';
export const OCR_LANGUAGES: { id: OcrLanguage; label: string }[] = [
  { id: 'eng', label: 'English' },
  { id: 'hin', label: 'Hindi' },
  { id: 'eng+hin', label: 'English and Hindi' },
];

type Worker = { recognize: (image: unknown, options?: unknown, output?: unknown) => Promise<{ data: any }>; terminate: () => Promise<unknown> };
let active: { lang: OcrLanguage; worker: Promise<Worker> } | null = null;
let onProgress: ((fraction: number) => void) | null = null;

async function workerFor(lang: OcrLanguage): Promise<Worker> {
  if (active && active.lang !== lang) {
    const old = active;
    active = null;
    old.worker.then((w) => w.terminate()).catch(() => undefined);
  }
  if (!active) {
    const base = `${import.meta.env.BASE_URL}ocr/`;
    const worker = import('tesseract.js').then(
      ({ createWorker }) =>
        createWorker(lang.split('+'), 1, {
          workerPath: `${base}worker.min.js`,
          corePath: `${base}core`,
          langPath: `${base}lang`,
          gzip: true,
          // The worker script is loaded from this app, not wrapped in a blob that fetches it.
          workerBlobURL: false,
          logger: (m: { status: string; progress: number }) => {
            if (m.status === 'recognizing text') onProgress?.(m.progress);
          },
        }) as unknown as Promise<Worker>,
    );
    active = { lang, worker };
    worker.catch(() => {
      if (active?.worker === worker) active = null;
    });
  }
  return active.worker;
}

/** Frees the OCR engine's memory (about 100 MB while loaded). */
export function shutdownOcr() {
  const old = active;
  active = null;
  old?.worker.then((w) => w.terminate()).catch(() => undefined);
}

/**
 * Recognises the text of one page and returns it word by word in view space, in the same
 * shape as text read from a PDF, so the rest of the editor can treat it the same way.
 */
export async function recognizePage(info: PageInfo, lang: OcrLanguage, progress?: (fraction: number) => void): Promise<RawTextItem[]> {
  const page = await getPdfPage(info);
  // About 200 dpi: enough for print-sized text without making huge pictures.
  const canvas = await renderPage(page, info, 200 / 72, 1).promise;
  if (!canvas) throw new Error('The page could not be drawn for recognition.');
  const k = canvas.width / info.width;
  try {
    const worker = await workerFor(lang);
    onProgress = progress ?? null;
    const { data } = await worker.recognize(canvas, {}, { blocks: true });
    const items: RawTextItem[] = [];
    for (const block of data.blocks ?? []) {
      for (const para of block.paragraphs ?? []) {
        for (const line of para.lines ?? []) {
          const lb = line.bbox;
          const base = line.baseline ?? { x0: lb.x0, y0: lb.y1, x1: lb.x1, y1: lb.y1 };
          // The line box is tight around the ink: from the tallest letter to the lowest descender,
          // which is close to one font size for ordinary mixed-case text.
          const fontSize = Math.max(4, (lb.y1 - lb.y0) / k / 0.95);
          for (const word of line.words ?? []) {
            const text = String(word.text ?? '').trim();
            if (!text || (word.confidence ?? 100) < 25) continue;
            const b = word.bbox;
            const t = base.x1 === base.x0 ? 0 : ((b.x0 + b.x1) / 2 - base.x0) / (base.x1 - base.x0);
            const baseline = base.y0 + (base.y1 - base.y0) * t;
            items.push({
              str: text,
              x: b.x0 / k,
              width: Math.max(1, (b.x1 - b.x0) / k),
              baseline: baseline / k,
              fontSize,
              fontName: 'ocr',
              generic: 'sans-serif',
              // The real extent of the line's ink plus a margin, so a cover hides every stroke.
              ascent: Math.max(0.8, (baseline - lb.y0) / k / fontSize + 0.1),
              descent: -Math.max(0.25, (lb.y1 - baseline) / k / fontSize + 0.1),
              angle: 0,
            });
          }
        }
      }
    }
    return items;
  } finally {
    onProgress = null;
    release(canvas);
  }
}
