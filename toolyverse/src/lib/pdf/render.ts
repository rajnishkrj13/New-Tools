/** Drawing PDF pages with pdf.js, loaded only when a PDF tool needs it. */

type PdfJs = typeof import('pdfjs-dist');
let lib: Promise<PdfJs> | null = null;

function pdfjs(): Promise<PdfJs> {
  if (!lib) {
    lib = import('pdfjs-dist').then((m) => {
      // Served from /public by scripts/copy-assets.mjs, same version as the package.
      m.GlobalWorkerOptions.workerSrc = '/pdfjs/pdf.worker.min.mjs';
      return m;
    });
  }
  return lib;
}

export async function openPdf(bytes: Uint8Array, password?: string) {
  const m = await pdfjs();
  return m.getDocument({ data: bytes.slice(), password, isEvalSupported: false, verbosity: 0 }).promise;
}

export type PdfDoc = Awaited<ReturnType<typeof openPdf>>;

/** One page drawn at `scale` (1 = 72 dpi), on white, with any extra rotation applied. */
export async function renderPage(doc: PdfDoc, index: number, scale: number, rotation = 0): Promise<HTMLCanvasElement> {
  const page = await doc.getPage(index + 1);
  const viewport = page.getViewport({ scale, rotation: (page.rotate + rotation) % 360 });
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  page.cleanup();
  return canvas;
}

export async function isPasswordError(e: unknown) {
  return (e as { name?: string })?.name === 'PasswordException';
}
