/**
 * Text recognition (OCR) in the browser with Tesseract compiled to WebAssembly. The engine and
 * the English and Hindi language data are served by this site from /ocr (the same files the
 * PDF editor uses), so images are read on the visitor's device and never uploaded.
 */

export type OcrLang = 'eng' | 'hin' | 'eng+hin';
export const OCR_LANGS: { value: OcrLang; label: string }[] = [
  { value: 'eng', label: 'English' },
  { value: 'hin', label: 'Hindi' },
  { value: 'eng+hin', label: 'English + Hindi' },
];
export const isOcrLang = (v: unknown): v is OcrLang => OCR_LANGS.some((l) => l.value === v);

export interface OcrWord {
  text: string;
  confidence: number;
  /** Position in the picture that was read (the prepared canvas), in pixels. */
  box: { x0: number; y0: number; x1: number; y1: number };
}
export interface OcrResult {
  text: string;
  /** 0–100, Tesseract's average certainty for the page. */
  confidence: number;
  words: OcrWord[];
  width: number;
  height: number;
}

type Worker = {
  recognize: (image: unknown, options?: unknown, output?: unknown) => Promise<{ data: any }>; // eslint-disable-line @typescript-eslint/no-explicit-any
  setParameters: (p: Record<string, string>) => Promise<unknown>;
  terminate: () => Promise<unknown>;
};

let active: { lang: OcrLang; worker: Promise<Worker> } | null = null;
let progress: ((f: number) => void) | null = null;

function workerFor(lang: OcrLang): Promise<Worker> {
  if (active && active.lang !== lang) {
    const old = active;
    active = null;
    old.worker.then((w) => w.terminate()).catch(() => undefined);
  }
  if (!active) {
    const worker = import('tesseract.js').then(async ({ createWorker }) => {
      const w = (await createWorker(lang.split('+'), 1, {
        workerPath: '/ocr/worker.min.js',
        corePath: '/ocr/core',
        langPath: '/ocr/lang',
        gzip: true,
        workerBlobURL: false,
        logger: (m: { status: string; progress: number }) => {
          if (m.status === 'recognizing text') progress?.(m.progress);
        },
      })) as unknown as Worker;
      // Keep runs of spaces, so columns and tables keep their shape in the text.
      await w.setParameters({ preserve_interword_spaces: '1' });
      return w;
    });
    active = { lang, worker };
    worker.catch(() => {
      if (active?.worker === worker) active = null;
    });
  }
  return active.worker;
}

/** Frees the engine's memory (about 100 MB while loaded). */
export function stopOcr() {
  const old = active;
  active = null;
  old?.worker.then((w) => w.terminate()).catch(() => undefined);
}

/**
 * Draws the image so Tesseract reads it well: small pictures (screenshots, phone crops) are
 * enlarged, very large ones reduced; with `enhance`, colours become greys with the contrast
 * stretched, which helps faint, coloured or low-contrast text.
 */
export async function prepareImage(file: Blob, enhance: boolean): Promise<HTMLCanvasElement> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new Error('This file could not be read as an image. Use JPG, PNG, WebP, BMP or GIF.');
  }
  const longest = Math.max(bitmap.width, bitmap.height);
  // Tesseract is most accurate when capital letters are about 30 pixels or more tall.
  const scale = longest < 1200 ? Math.min(3, 2000 / longest) : longest > 4200 ? 4200 / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  if (enhance) {
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = img.data;
    const hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) {
      const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000;
      d[i] = g;
      hist[g | 0]++;
    }
    // Stretch between the 1st and 99th percentile of brightness.
    const total = d.length / 4;
    let lo = 0;
    let hi = 255;
    for (let acc = 0; lo < 255 && (acc += hist[lo]) < total * 0.01; ) lo++;
    for (let acc = 0; hi > 0 && (acc += hist[hi]) < total * 0.01; ) hi--;
    const range = Math.max(1, hi - lo);
    for (let i = 0; i < d.length; i += 4) {
      const v = Math.max(0, Math.min(255, ((d[i] - lo) * 255) / range));
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(img, 0, 0);
  }
  return canvas;
}

/** Reads the text of one prepared image. `onProgress` gets 0–1 while the text is read. */
export async function recognize(canvas: HTMLCanvasElement, lang: OcrLang, onProgress?: (f: number) => void): Promise<OcrResult> {
  const worker = await workerFor(lang);
  progress = onProgress ?? null;
  try {
    const { data } = await worker.recognize(canvas, {}, { text: true, blocks: true });
    const words: OcrWord[] = [];
    for (const b of data.blocks ?? [])
      for (const p of b.paragraphs ?? [])
        for (const l of p.lines ?? []) for (const w of l.words ?? []) if (w.text?.trim()) words.push({ text: w.text, confidence: w.confidence, box: w.bbox });
    return { text: tidyText(data.text ?? ''), confidence: Math.round(data.confidence ?? 0), words, width: canvas.width, height: canvas.height };
  } finally {
    progress = null;
  }
}

/** Trailing spaces off each line, at most one blank line between paragraphs, no stray edges. */
export function tidyText(text: string): string {
  return text
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
