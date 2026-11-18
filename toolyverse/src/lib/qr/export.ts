import { sizedSvg } from './render';

/** Turning the SVG into PNG, JPG, PDF, the clipboard or paper. Browser only. */

const svgUrl = (svg: string) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Could not draw the QR code.'));
    img.src = src;
  });
}

/** Draws the code onto a canvas of px × px; `fill` paints the background first (JPG has no transparency). */
export async function rasterize(svg: string, px: number, fill?: string): Promise<HTMLCanvasElement> {
  const img = await loadImage(svgUrl(sizedSvg(svg, px)));
  const canvas = document.createElement('canvas');
  canvas.width = px;
  canvas.height = px;
  const ctx = canvas.getContext('2d')!;
  if (fill) {
    ctx.fillStyle = fill;
    ctx.fillRect(0, 0, px, px);
  }
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(img, 0, 0, px, px);
  return canvas;
}

export function canvasBlob(canvas: HTMLCanvasElement, type: 'image/png' | 'image/jpeg', quality = 0.95): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not make the image.'))), type, quality));
}

export async function pngBlob(svg: string, px: number) {
  return canvasBlob(await rasterize(svg, px), 'image/png');
}

export async function jpgBlob(svg: string, px: number, bg: string) {
  return canvasBlob(await rasterize(svg, px, bg), 'image/jpeg', 0.95);
}

export const svgBlob = (svg: string, px: number) => new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${sizedSvg(svg, px)}`], { type: 'image/svg+xml' });

/**
 * A4 PDF ready to print. Each code is drawn from a 2048 px image so it stays sharp on paper,
 * with its label printed under it when there are several.
 */
export async function pdfBlob(codes: { svg: string; label?: string }[], opts: { perPage?: number } = {}): Promise<Blob> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const [W, H] = [595.28, 841.89];
  const per = opts.perPage ?? (codes.length > 1 ? 6 : 1);
  const cols = per === 1 ? 1 : 2;
  const rows = Math.ceil(per / cols);
  const cell = per === 1 ? 400 : Math.min((W - 80) / cols, (H - 80) / rows) - 30;
  const ascii = (s: string) => s.replace(/[^\x20-\x7e]/g, '?').slice(0, 60);
  for (let i = 0; i < codes.length; i += per) {
    const page = doc.addPage([W, H]);
    for (let j = 0; j < per && i + j < codes.length; j++) {
      const { svg, label } = codes[i + j];
      const png = await doc.embedPng(await (await pngBlob(svg, 2048)).arrayBuffer());
      const col = j % cols;
      const row = Math.floor(j / cols);
      const slotW = (W - 80) / cols;
      const slotH = (H - 80) / rows;
      const x = 40 + col * slotW + (slotW - cell) / 2;
      const y = per === 1 ? (H - cell) / 2 + 60 : H - 40 - row * slotH - cell - 6;
      page.drawImage(png, { x, y, width: cell, height: cell });
      if (label) {
        const text = ascii(label);
        const size = 9;
        page.drawText(text, { x: x + (cell - font.widthOfTextAtSize(text, size)) / 2, y: y - 16, size, font, color: rgb(0.2, 0.2, 0.2) });
      }
    }
  }
  const bytes = await doc.save();
  return new Blob([bytes.slice().buffer], { type: 'application/pdf' });
}

/** Copies the code as a picture. Returns false where the browser does not allow it. */
export async function copyImage(svg: string, px: number): Promise<boolean> {
  try {
    if (!('ClipboardItem' in window) || !navigator.clipboard?.write) return false;
    // Passing the promise keeps Safari happy: the clipboard call must start inside the click.
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob(svg, px) })]);
    return true;
  } catch {
    return false;
  }
}

/** Prints the code alone on the page, centred, about 8 cm wide (or a grid when there are several). */
export async function printCodes(codes: { svg: string; label?: string }[]): Promise<void> {
  const urls = await Promise.all(codes.map(async (c) => URL.createObjectURL(await pngBlob(c.svg, 1024))));
  const frame = document.createElement('iframe');
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
  document.body.appendChild(frame);
  const doc = frame.contentDocument!;
  const esc = (s: string) => s.replace(/[&<>"]/g, (ch) => `&#${ch.charCodeAt(0)};`);
  const one = codes.length === 1;
  doc.open();
  doc.write(
    `<!doctype html><html><head><title>QR code</title><style>@page{size:A4;margin:12mm}body{margin:0;font:11px sans-serif;color:#333}` +
      `.g{display:grid;grid-template-columns:${one ? '1fr' : '1fr 1fr'};gap:10mm;justify-items:center;${one ? 'padding-top:40mm' : ''}}` +
      `figure{margin:0;text-align:center;break-inside:avoid}img{width:${one ? '80mm' : '60mm'};height:auto;display:block}</style></head><body><div class="g">` +
      codes.map((c, i) => `<figure><img src="${urls[i]}" alt="">${c.label ? `<figcaption>${esc(c.label)}</figcaption>` : ''}</figure>`).join('') +
      `</div></body></html>`,
  );
  doc.close();
  await Promise.all(Array.from(doc.images).map((img) => (img.complete ? null : new Promise((r) => (img.onload = img.onerror = r)))));
  frame.contentWindow!.focus();
  frame.contentWindow!.print();
  setTimeout(() => {
    frame.remove();
    urls.forEach((u) => URL.revokeObjectURL(u));
  }, 60_000);
}

/**
 * Reads the code back the way a phone would. The phone's own reader is used where the browser
 * has it (BarcodeDetector); otherwise jsQR reads pictures of the code at several sizes, sharp
 * and slightly blurred. jsQR is fussier than phone cameras about round dots and round corners,
 * so one clean read at any size counts as a pass; a code damaged by a logo fails at all of them.
 */
export async function scanCheck(svg: string): Promise<{ ok: boolean; text: string | null }> {
  const total = Number(/viewBox="0 0 (\d+)/.exec(svg)?.[1] ?? 40);
  const Detector = (globalThis as { BarcodeDetector?: new (o: { formats: string[] }) => { detect: (s: CanvasImageSource) => Promise<{ rawValue: string }[]> } }).BarcodeDetector;
  if (Detector) {
    try {
      const found = await new Detector({ formats: ['qr_code'] }).detect(await rasterize(svg, Math.max(400, total * 8), '#ffffff'));
      if (found[0]) return { ok: true, text: found[0].rawValue };
    } catch {
      /* not supported for QR here: fall back to jsQR */
    }
  }
  const { default: jsQR } = await import('jsqr');
  for (const px of [240, 330, 480, 720, Math.max(240, total * 5)]) {
    const sharp = await rasterize(svg, px, '#ffffff');
    for (const blur of [0, 0.6]) {
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = px;
      const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
      if (blur) ctx.filter = `blur(${blur}px)`;
      ctx.drawImage(sharp, 0, 0);
      const found = jsQR(ctx.getImageData(0, 0, px, px).data, px, px, { inversionAttempts: 'dontInvert' });
      if (found) return { ok: true, text: found.data };
    }
  }
  return { ok: false, text: null };
}

/** Shrinks an uploaded logo to at most 512 px and returns it as a PNG data URL (keeps transparency). */
export async function prepareLogo(file: File): Promise<{ src: string; width: number; height: number }> {
  const okType = /^image\/(png|jpe?g|webp|svg\+xml|gif)$/.test(file.type) || /\.(png|jpe?g|webp|svg|gif)$/i.test(file.name);
  if (!okType) throw new Error('Choose a PNG, JPG, SVG or WebP image for the logo.');
  const url = URL.createObjectURL(file);
  try {
    const img = await loadImage(url).catch(() => {
      throw new Error('That logo could not be opened. Try saving it as PNG.');
    });
    let w = img.naturalWidth || 512;
    let h = img.naturalHeight || 512;
    const scale = Math.min(1, 512 / Math.max(w, h));
    w = Math.max(1, Math.round(w * scale));
    h = Math.max(1, Math.round(h * scale));
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0, w, h);
    return { src: canvas.toDataURL('image/png'), width: w, height: h };
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const previewUrl = svgUrl;
