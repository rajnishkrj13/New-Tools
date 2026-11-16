import { renderPdfToImages } from '../engines/PdfRenderer';
import { getState } from '../store/documentStore';
import { buildPdf } from './useExport';

/**
 * Prints the document as it will be downloaded, with every edit. The pages are drawn as
 * pictures and printed from a hidden frame, so it works the same in every browser and never
 * depends on a PDF plug-in. The browser's print dialog chooses printer, pages and copies.
 */

let frame: HTMLIFrameElement | null = null;
let urls: string[] = [];

function cleanUp() {
  frame?.remove();
  frame = null;
  urls.forEach((u) => URL.revokeObjectURL(u));
  urls = [];
}

/** Width and height in pixels, read from a PNG's header. */
export function pngSize(png: Uint8Array): { width: number; height: number } {
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  return { width: view.getUint32(16), height: view.getUint32(20) };
}

/** The page's printed size in points, from its picture and the resolution it was drawn at. */
export function printPageCss(sizes: { width: number; height: number }[], dpi: number): { css: string; classes: string[] } {
  const named = new Map<string, string>();
  let css = '@page { margin: 0; }\n';
  const classes = sizes.map(({ width, height }) => {
    const w = +((width / dpi) * 72).toFixed(2);
    const h = +((height / dpi) * 72).toFixed(2);
    const key = `${w}x${h}`;
    if (!named.has(key)) {
      const name = `s${named.size}`;
      named.set(key, name);
      // Each size gets its own named page, so landscape pages print landscape. The box is a
      // hair shorter than the page so rounding never pushes it onto an extra blank sheet.
      css += `@page ${name} { size: ${w}pt ${h}pt; margin: 0; }\n.${name} { page: ${name}; width: ${w}pt; height: ${(h - 0.5).toFixed(2)}pt; }\n`;
    }
    return named.get(key)!;
  });
  return { css, classes };
}

export async function printDocument() {
  const s = getState();
  if (!s.doc) return;
  // The password and limits you set apply to the downloaded file, not to printing it here.
  const bytes = await buildPdf(false, { unlocked: true });
  if (!bytes) return;
  cleanUp();
  const dpi = s.pages.length > 60 ? 150 : 200;
  getState().setLoading('Preparing pages for printing…');
  try {
    const pictures = await renderPdfToImages(bytes, 'image/png', dpi, (done, total) => getState().setLoading(`Preparing page ${done + 1} of ${total} for printing…`));
    const { css, classes } = printPageCss(pictures.map(pngSize), dpi);
    urls = pictures.map((p) => URL.createObjectURL(new Blob([p.slice().buffer], { type: 'image/png' })));
    frame = document.createElement('iframe');
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;visibility:hidden';
    document.body.appendChild(frame);
    const doc = frame.contentDocument!;
    doc.open();
    doc.write(
      `<!doctype html><html><head><meta charset="utf-8"><title>${(s.doc.fileName ?? 'document').replace(/[<&]/g, '')}</title><style>
html, body { margin: 0; padding: 0; background: #fff; }
.p { overflow: hidden; break-after: page; page-break-after: always; }
.p:last-child { break-after: auto; page-break-after: auto; }
.p img { display: block; width: 100%; height: 100%; object-fit: contain; }
${css}</style></head><body>${urls.map((u, i) => `<div class="p ${classes[i]}"><img src="${u}" alt=""></div>`).join('')}</body></html>`,
    );
    doc.close();
    await Promise.all(Array.from(doc.images).map((img) => img.decode().catch(() => undefined)));
    getState().setLoading(null);
    const win = frame.contentWindow!;
    win.addEventListener('afterprint', () => setTimeout(cleanUp, 500));
    win.focus();
    win.print();
  } catch (e: any) {
    getState().setLoading(null);
    cleanUp();
    getState().toast(`The document could not be prepared for printing: ${e?.message ?? 'unknown error'}`, 'error');
  }
}
