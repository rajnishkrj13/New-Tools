import type { ImageAsset } from '../types/objects';
import { IMAGE_TYPES } from './validationUtils';

export const newId = (): string =>
  typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;

const canvasToBytes = (canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Uint8Array> =>
  new Promise((resolve, reject) =>
    canvas.toBlob(
      async (blob) => (blob ? resolve(new Uint8Array(await blob.arrayBuffer())) : reject(new Error('Image conversion failed'))),
      mime,
      quality,
    ),
  );

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image is damaged or in an unsupported format.'));
    img.src = url;
  });
}

function makeAsset(name: string, mime: ImageAsset['mime'], bytes: Uint8Array, width: number, height: number): ImageAsset {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: mime }));
  return { id: newId(), name, mime, bytes, url, width, height };
}

/**
 * Reads a PNG / JPEG / WebP file into an asset that pdf-lib can embed.
 * PNG and JPEG bytes are kept untouched (no quality loss). WebP is converted to PNG.
 * A JPEG whose EXIF orientation swaps its sides is re-encoded upright, because PDF
 * viewers ignore EXIF and would show it lying on its side.
 */
export async function importImageFile(file: File): Promise<ImageAsset> {
  const type = file.type || (/\.png$/i.test(file.name) ? 'image/png' : /\.jpe?g$/i.test(file.name) ? 'image/jpeg' : /\.webp$/i.test(file.name) ? 'image/webp' : '');
  if (!IMAGE_TYPES.includes(type)) throw new Error(`"${file.name}" is not a PNG, JPG or WebP image.`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const probeUrl = URL.createObjectURL(new Blob([bytes.slice().buffer], { type }));
  try {
    const img = await loadImage(probeUrl);
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    if (!w || !h) throw new Error(`"${file.name}" has no pixels.`);
    let reencode = type === 'image/webp';
    if (type === 'image/jpeg' && typeof createImageBitmap === 'function') {
      try {
        const raw = await createImageBitmap(new Blob([bytes.slice().buffer], { type }), { imageOrientation: 'none' });
        reencode = raw.width !== w || raw.height !== h;
        raw.close();
      } catch {
        /* the browser cannot tell; keep the original bytes */
      }
    }
    if (!reencode) return makeAsset(file.name, type as ImageAsset['mime'], bytes, w, h);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')!.drawImage(img, 0, 0);
    const out = type === 'image/webp' ? await canvasToBytes(canvas, 'image/png') : await canvasToBytes(canvas, 'image/jpeg', 0.95);
    canvas.width = 0;
    return makeAsset(file.name, type === 'image/webp' ? 'image/png' : 'image/jpeg', out, w, h);
  } finally {
    URL.revokeObjectURL(probeUrl);
  }
}

/**
 * Stores a canvas as an image asset: PNG when it has transparent pixels, otherwise JPEG
 * (a photo saved as PNG would make the exported file many times larger).
 */
export async function canvasToAsset(canvas: HTMLCanvasElement, name: string): Promise<ImageAsset> {
  const { width, height } = canvas;
  const data = canvas.getContext('2d')!.getImageData(0, 0, width, height).data;
  let transparent = false;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) {
      transparent = true;
      break;
    }
  }
  // Small pictures (logos, icons) stay lossless.
  const png = transparent || width * height <= 256 * 256;
  const bytes = png ? await canvasToBytes(canvas, 'image/png') : await canvasToBytes(canvas, 'image/jpeg', 0.92);
  return makeAsset(`${name}.${png ? 'png' : 'jpg'}`, png ? 'image/png' : 'image/jpeg', bytes, width, height);
}

/** Crops a drawing canvas to its inked area and returns it as a transparent PNG asset. */
export async function canvasToTrimmedAsset(canvas: HTMLCanvasElement, name: string): Promise<ImageAsset | null> {
  const ctx = canvas.getContext('2d')!;
  const { width, height } = canvas;
  const data = ctx.getImageData(0, 0, width, height).data;
  let minX = width, minY = height, maxX = -1, maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (data[(y * width + x) * 4 + 3] > 8) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const pad = 6;
  minX = Math.max(0, minX - pad);
  minY = Math.max(0, minY - pad);
  maxX = Math.min(width - 1, maxX + pad);
  maxY = Math.min(height - 1, maxY + pad);
  const out = document.createElement('canvas');
  out.width = maxX - minX + 1;
  out.height = maxY - minY + 1;
  out.getContext('2d')!.drawImage(canvas, minX, minY, out.width, out.height, 0, 0, out.width, out.height);
  const bytes = await canvasToBytes(out, 'image/png');
  return makeAsset(name, 'image/png', bytes, out.width, out.height);
}

export function downloadBytes(bytes: Uint8Array, fileName: string) {
  const url = URL.createObjectURL(new Blob([bytes.slice().buffer], { type: 'application/pdf' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
